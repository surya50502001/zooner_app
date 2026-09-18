using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("waitlist-limit")]
public class WaitlistController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<WaitlistController> _logger;

    public WaitlistController(AppDbContext context, ILogger<WaitlistController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Join the Zooner early access waitlist for city launches and updates
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<WaitlistConfirmationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WaitlistConfirmationDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> JoinWaitlist([FromBody] JoinWaitlistRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<WaitlistConfirmationDto>.Fail("Validation failed", errors));
        }

        // Validate and normalize UserType strictly server-side
        var rawUserType = request.UserType?.Trim();
        string normalizedUserType;
        if (string.Equals(rawUserType, "Shopper", StringComparison.OrdinalIgnoreCase))
        {
            normalizedUserType = "Shopper";
        }
        else if (string.Equals(rawUserType, "Retailer", StringComparison.OrdinalIgnoreCase))
        {
            normalizedUserType = "Retailer";
        }
        else
        {
            return BadRequest(ApiResponse<WaitlistConfirmationDto>.Fail(
                "Invalid user type. Allowed values are 'Shopper' or 'Retailer'.",
                new List<string> { "UserType must be either 'Shopper' or 'Retailer'." }));
        }

        // Normalize email: trim whitespace and lowercase
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        // City is optional: never invent geographic fallback, preserve null if not provided
        var normalizedCity = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();

        // Client IP captured safely for bot/abuse protection (max 45 chars for IPv6)
        var clientIp = HttpContext?.Connection.RemoteIpAddress?.ToString();
        if (clientIp != null && clientIp.Length > 45)
        {
            clientIp = clientIp.Substring(0, 45);
        }

        // Idempotent check: if already subscribed, return clean success without leaking internal data or DB IDs
        var existing = await _context.WaitlistEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Email.ToLower() == normalizedEmail);

        if (existing != null)
        {
            return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
                new WaitlistConfirmationDto
                {
                    Email = normalizedEmail,
                    City = normalizedCity,
                    UserType = normalizedUserType
                },
                "You're already on the Zooner waitlist! We'll notify you as soon as we launch."));
        }

        var entry = new WaitlistEntry
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            City = normalizedCity,
            UserType = normalizedUserType,
            IpAddress = clientIp,
            CreatedAtUtc = DateTime.UtcNow
        };

        try
        {
            _context.WaitlistEntries.Add(entry);
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Concurrent race condition: another request just inserted this email
            return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
                new WaitlistConfirmationDto
                {
                    Email = normalizedEmail,
                    City = normalizedCity,
                    UserType = normalizedUserType
                },
                "You're already on the Zooner waitlist! We'll notify you as soon as we launch."));
        }

        _logger.LogInformation("New waitlist subscriber registered: {Email} (UserType: {UserType})", normalizedEmail, normalizedUserType);

        return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
            new WaitlistConfirmationDto
            {
                Email = normalizedEmail,
                City = normalizedCity,
                UserType = normalizedUserType
            },
            "Welcome to Zooner! You're on the early access waitlist."));
    }
}
