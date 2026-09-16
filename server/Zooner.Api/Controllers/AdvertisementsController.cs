using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services.Location;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdvertisementsController : ControllerBase
{
    private readonly AppDbContext _context;

    public AdvertisementsController(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Retrieve targeted sponsored ads matching shopper's GPS location, preferred category, and time window (Premium Only)
    /// </summary>
    [HttpGet("targeted")]
    public async Task<IActionResult> GetTargetedAds(
        [FromQuery] double? userLat = null,
        [FromQuery] double? userLon = null,
        [FromQuery] string? category = "all")
    {
        var now = DateTime.UtcNow;

        // Fetch active ads within valid time window from active shops
        var adsQuery = _context.PremiumAdvertisements
            .Include(ad => ad.Shop)
            .Where(ad => ad.IsActive 
                         && ad.IsPremiumMerchantOnly 
                         && ad.StartTimeUtc <= now 
                         && ad.EndTimeUtc >= now);

        if (!string.IsNullOrWhiteSpace(category) && !category.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            adsQuery = adsQuery.Where(ad => ad.TargetCategory.Equals(category, StringComparison.OrdinalIgnoreCase));
        }

        var adsList = await adsQuery.ToListAsync();

        // Filter by location radius (Geo-distance calculation if coordinates provided)
        var targetedAds = adsList
            .Select(ad =>
            {
                double distanceKm = 0;
                bool isWithinRadius = true;

                if (userLat.HasValue && userLon.HasValue && ad.Shop != null)
                {
                    distanceKm = GeoLocationHelper.CalculateDistanceKm(
                        userLat.Value, userLon.Value,
                        ad.Shop.Latitude,
                        ad.Shop.Longitude
                    );
                    isWithinRadius = distanceKm <= ad.TargetRadiusKm;
                }

                var remainingSeconds = (int)(ad.EndTimeUtc - now).TotalSeconds;

                return new
                {
                    ad.Id,
                    ShopId = ad.ShopId,
                    ShopName = ad.Shop?.Name ?? "Verified Premium Retailer",
                    ShopAddress = ad.Shop?.Address ?? "Nearby Store",
                    ad.Title,
                    ad.Description,
                    ad.TargetCategory,
                    ad.OfferTag,
                    ad.ImageUrl,
                    DistanceKm = Math.Round(distanceKm, 2),
                    DistanceText = !userLat.HasValue ? "Nearby" : distanceKm < 1.0 ? $"{Math.Round(distanceKm * 1000)}m away" : $"{Math.Round(distanceKm, 1)} km away",
                    IsWithinRadius = isWithinRadius,
                    RemainingSeconds = Math.Max(0, remainingSeconds),
                    FormattedTimeLeft = $"{Math.Max(0, remainingSeconds / 3600):D2}h {Math.Max(0, (remainingSeconds % 3600) / 60):D2}m remaining",
                    IsPremiumSponsored = true
                };
            })
            .Where(ad => ad.IsWithinRadius)
            .OrderBy(ad => ad.DistanceKm)
            .ToList();

        return Ok(new ApiResponse<object>
        {
            Success = true,
            Message = "Targeted premium advertisements retrieved successfully.",
            Data = targetedAds
        });
    }
}
