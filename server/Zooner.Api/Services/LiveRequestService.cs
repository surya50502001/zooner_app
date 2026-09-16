using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services.Location;
using Zooner.Api.Services.Realtime;

namespace Zooner.Api.Services;

public class LiveRequestService : ILiveRequestService
{
    private readonly AppDbContext _context;
    private readonly IShopService _shopService;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly ILogger<LiveRequestService> _logger;

    public LiveRequestService(
        AppDbContext context,
        IShopService shopService,
        IRealtimeNotifier realtimeNotifier,
        ILogger<LiveRequestService> logger)
    {
        _context = context;
        _shopService = shopService;
        _realtimeNotifier = realtimeNotifier;
        _logger = logger;
    }

    public async Task<ApiResponse<LiveRequestDto>> CreateRequestAsync(Guid customerId, CreateLiveRequest request)
    {
        var category = await _context.Categories.FindAsync(request.CategoryId);
        if (category == null || !category.IsActive)
        {
            return ApiResponse<LiveRequestDto>.Fail("Selected category does not exist or is inactive.");
        }

        string? subCategoryName = null;
        if (request.SubCategoryId.HasValue)
        {
            var subCat = await _context.SubCategories
                .FirstOrDefaultAsync(sc => sc.Id == request.SubCategoryId.Value && sc.CategoryId == request.CategoryId && sc.IsActive);
            if (subCat == null)
            {
                return ApiResponse<LiveRequestDto>.Fail("Selected subcategory does not belong to this category or is inactive.");
            }
            subCategoryName = subCat.Name;
        }

        // Configurable request expiration from settings or default 30 mins
        var expirationMinutes = 30;
        var setting = await _context.BusinessSettings.FindAsync("RequestExpirationMinutes");
        if (setting != null && int.TryParse(setting.Value, out var parsed))
        {
            expirationMinutes = parsed;
        }

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = request.RequestText.Trim(),
            CategoryId = request.CategoryId,
            SubCategoryId = request.SubCategoryId,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            SearchRadiusKm = request.SearchRadiusKm,
            Status = LiveRequestStatus.Active,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(expirationMinutes)
        };

        _context.LiveRequests.Add(liveRequest);
        await _context.SaveChangesAsync();

        // 1. Find eligible nearby shops
        var eligibleShops = await _shopService.FindNearbyEligibleShopsAsync(
            request.Latitude,
            request.Longitude,
            request.SearchRadiusKm,
            request.CategoryId);

        var summaryDto = new LiveRequestSummaryDto
        {
            Id = liveRequest.Id,
            RequestText = liveRequest.RequestText,
            CategoryId = category.Id,
            CategoryName = category.Name,
            SubCategoryName = subCategoryName,
            Latitude = liveRequest.Latitude,
            Longitude = liveRequest.Longitude,
            SearchRadiusKm = liveRequest.SearchRadiusKm,
            Status = liveRequest.Status.ToString(),
            CreatedAtUtc = liveRequest.CreatedAtUtc,
            ExpiresAtUtc = liveRequest.ExpiresAtUtc
        };

        // 2. Broadcast live request through SignalR to all matching nearby shops
        if (eligibleShops.Any())
        {
            var shopIds = eligibleShops.Select(s => s.Id).ToList();
            await _realtimeNotifier.NotifyNewLiveRequestAsync(shopIds, summaryDto);

            // 3. Persist notifications for shop owners
            foreach (var shop in eligibleShops)
            {
                _context.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    UserId = shop.OwnerId,
                    Title = "New Nearby Live Request",
                    Message = $"A customer nearby is looking for: \"{liveRequest.RequestText}\"",
                    Type = "NewLiveRequest",
                    RelatedEntityId = liveRequest.Id,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
            await _context.SaveChangesAsync();
        }

        _logger.LogInformation("LiveRequest {RequestId} created by Customer {CustomerId}. Dispatched to {ShopCount} nearby shops.",
            liveRequest.Id, customerId, eligibleShops.Count);

        return ApiResponse<LiveRequestDto>.Ok((await LoadRequestDtoAsync(liveRequest.Id))!, "Live request created successfully.");
    }

    public async Task<ApiResponse<LiveRequestDto>> GetRequestByIdAsync(Guid requestId, Guid userId)
    {
        var request = await _context.LiveRequests
            .Include(r => r.Responses)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (request == null)
        {
            return ApiResponse<LiveRequestDto>.Fail("Live request not found.");
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return ApiResponse<LiveRequestDto>.Fail("Unauthorized access.");
        }

        bool isCustomerOwner = request.CustomerId == userId;
        bool isAdmin = user.Role == UserRoles.Admin || user.IsAdmin;

        var userShopIds = new List<Guid>();
        bool isParticipatingVendor = false;

        if (!isCustomerOwner && !isAdmin)
        {
            userShopIds = await _context.Shops
                .Where(s => s.OwnerId == userId)
                .Select(s => s.Id)
                .ToListAsync();

            if (userShopIds.Any())
            {
                isParticipatingVendor = request.Responses.Any(resp => userShopIds.Contains(resp.ShopId));
            }
        }

        if (!isCustomerOwner && !isAdmin && !isParticipatingVendor)
        {
            return ApiResponse<LiveRequestDto>.Fail("Access denied. You do not have permission to view this live request.");
        }

        var dto = await LoadRequestDtoAsync(requestId);
        if (dto == null)
        {
            return ApiResponse<LiveRequestDto>.Fail("Live request not found.");
        }

        // Vendor privacy: Participating vendors only see their own shop's responses, not competitors'
        if (isParticipatingVendor && !isCustomerOwner && !isAdmin)
        {
            dto.Responses = dto.Responses.Where(r => userShopIds.Contains(r.ShopId)).ToList();
        }

        return ApiResponse<LiveRequestDto>.Ok(dto);
    }

    public async Task<ApiResponse<List<LiveRequestSummaryDto>>> GetMyRequestsAsync(Guid customerId)
    {
        var requests = await _context.LiveRequests
            .Where(r => r.CustomerId == customerId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Include(r => r.Category)
            .Include(r => r.SubCategory)
            .AsNoTracking()
            .Select(r => new LiveRequestSummaryDto
            {
                Id = r.Id,
                RequestText = r.RequestText,
                CategoryId = r.CategoryId,
                CategoryName = r.Category != null ? r.Category.Name : string.Empty,
                SubCategoryName = r.SubCategory != null ? r.SubCategory.Name : null,
                Latitude = r.Latitude,
                Longitude = r.Longitude,
                SearchRadiusKm = r.SearchRadiusKm,
                Status = r.Status.ToString(),
                CreatedAtUtc = r.CreatedAtUtc,
                ExpiresAtUtc = r.ExpiresAtUtc
            })
            .ToListAsync();

        return ApiResponse<List<LiveRequestSummaryDto>>.Ok(requests);
    }

    public async Task<ApiResponse<List<LiveRequestSummaryDto>>> GetIncomingRequestsForShopAsync(Guid ownerId, Guid shopId)
    {
        var shop = await _context.Shops
            .Include(s => s.ShopCategories)
            .FirstOrDefaultAsync(s => s.Id == shopId);

        if (shop == null) return ApiResponse<List<LiveRequestSummaryDto>>.Fail("Shop not found.");
        if (shop.OwnerId != ownerId) return ApiResponse<List<LiveRequestSummaryDto>>.Fail("Unauthorized.");
        if (!shop.IsActive || shop.VerificationStatus != ShopVerificationStatus.Approved)
        {
            return ApiResponse<List<LiveRequestSummaryDto>>.Fail("Shop is not active or verified.");
        }

        var categoryIds = shop.ShopCategories.Select(sc => sc.CategoryId).ToList();
        var now = DateTime.UtcNow;

        // Fetch active requests in shop's categories
        var activeRequests = await _context.LiveRequests
            .Where(r => r.Status == LiveRequestStatus.Active 
                     && r.ExpiresAtUtc > now 
                     && categoryIds.Contains(r.CategoryId))
            .Include(r => r.Category)
            .Include(r => r.SubCategory)
            .AsNoTracking()
            .ToListAsync();

        // Filter requests where shop is within the customer's search radius
        var results = new List<LiveRequestSummaryDto>();
        foreach (var req in activeRequests)
        {
            var distance = GeoLocationHelper.CalculateDistanceKm(req.Latitude, req.Longitude, shop.Latitude, shop.Longitude);
            if (distance <= req.SearchRadiusKm)
            {
                results.Add(new LiveRequestSummaryDto
                {
                    Id = req.Id,
                    RequestText = req.RequestText,
                    CategoryId = req.CategoryId,
                    CategoryName = req.Category?.Name ?? string.Empty,
                    SubCategoryName = req.SubCategory?.Name,
                    Latitude = req.Latitude,
                    Longitude = req.Longitude,
                    SearchRadiusKm = req.SearchRadiusKm,
                    DistanceToShopKm = distance,
                    Status = req.Status.ToString(),
                    CreatedAtUtc = req.CreatedAtUtc,
                    ExpiresAtUtc = req.ExpiresAtUtc
                });
            }
        }

        return ApiResponse<List<LiveRequestSummaryDto>>.Ok(results.OrderBy(r => r.DistanceToShopKm).ToList());
    }

    public async Task<ApiResponse<ShopResponseDto>> RespondAvailableAsync(Guid ownerId, Guid requestId, Guid shopId)
    {
        var liveRequest = await _context.LiveRequests
            .Include(r => r.Customer)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (liveRequest == null)
        {
            return ApiResponse<ShopResponseDto>.Fail("Live request not found.");
        }

        if (liveRequest.Status != LiveRequestStatus.Active)
        {
            return ApiResponse<ShopResponseDto>.Fail($"Cannot respond to a request with status: {liveRequest.Status}.");
        }

        if (liveRequest.ExpiresAtUtc <= DateTime.UtcNow)
        {
            liveRequest.Status = LiveRequestStatus.Expired;
            await _context.SaveChangesAsync();
            return ApiResponse<ShopResponseDto>.Fail("This live request has expired.");
        }

        var shop = await _context.Shops
            .Include(s => s.ShopCategories)
            .FirstOrDefaultAsync(s => s.Id == shopId);

        if (shop == null) return ApiResponse<ShopResponseDto>.Fail("Shop not found.");
        if (shop.OwnerId != ownerId) return ApiResponse<ShopResponseDto>.Fail("You do not own this shop.");
        if (!shop.IsActive) return ApiResponse<ShopResponseDto>.Fail("Shop is not active.");
        if (!shop.IsLiveEnabled) return ApiResponse<ShopResponseDto>.Fail("Shop LIVE availability is currently offline.");
        if (shop.VerificationStatus != ShopVerificationStatus.Approved) return ApiResponse<ShopResponseDto>.Fail("Shop is not verified.");

        // Check if shop is within request radius
        var distance = GeoLocationHelper.CalculateDistanceKm(liveRequest.Latitude, liveRequest.Longitude, shop.Latitude, shop.Longitude);
        if (distance > liveRequest.SearchRadiusKm)
        {
            return ApiResponse<ShopResponseDto>.Fail($"Shop is outside the customer's search radius ({distance:F1} km > {liveRequest.SearchRadiusKm} km).");
        }

        // CRITICAL: Prevent duplicate responses from the same shop
        var existingResponse = await _context.ShopResponses
            .AnyAsync(sr => sr.LiveRequestId == requestId && sr.ShopId == shopId);

        if (existingResponse)
        {
            return ApiResponse<ShopResponseDto>.Fail("Your shop has already responded to this request.");
        }

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = requestId,
            ShopId = shopId,
            Status = ShopResponseStatus.Available,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.ShopResponses.Add(response);

        // Create persistent notification for customer
        _context.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            UserId = liveRequest.CustomerId,
            Title = "Product Available Nearby!",
            Message = $"{shop.Name} has your requested item in stock ({distance:F1} km away)!",
            Type = "ShopAvailable",
            RelatedEntityId = liveRequest.Id,
            CreatedAtUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        // Dispatch realtime notification to customer through SignalR
        var notificationDto = new ShopAvailableNotificationDto
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            ShopName = shop.Name,
            ShopAddress = shop.Address,
            DistanceKm = distance,
            RespondedAtUtc = response.CreatedAtUtc
        };
        await _realtimeNotifier.NotifyShopAvailableAsync(liveRequest.CustomerId, notificationDto);

        var responseDto = new ShopResponseDto
        {
            Id = response.Id,
            ShopId = shop.Id,
            ShopName = shop.Name,
            ShopPhone = shop.Phone,
            ShopAddress = shop.Address,
            ShopLatitude = shop.Latitude,
            ShopLongitude = shop.Longitude,
            DistanceKm = distance,
            Status = response.Status.ToString(),
            CreatedAtUtc = response.CreatedAtUtc
        };

        return ApiResponse<ShopResponseDto>.Ok(responseDto, "Response sent to customer successfully.");
    }

    public async Task<ApiResponse> CancelRequestAsync(Guid customerId, Guid requestId)
    {
        var request = await _context.LiveRequests
            .Include(r => r.Responses)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (request == null) return ApiResponse.Fail("Live request not found.");
        if (request.CustomerId != customerId) return ApiResponse.Fail("You are not authorized to cancel this request.");

        if (request.Status != LiveRequestStatus.Active)
        {
            return ApiResponse.Fail($"Cannot cancel a request that is already {request.Status}.");
        }

        request.Status = LiveRequestStatus.Cancelled;
        request.CancelledAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Notify shops that responded
        var shopIds = request.Responses.Select(r => r.ShopId).Distinct().ToList();
        await _realtimeNotifier.NotifyRequestCancelledAsync(shopIds, requestId);

        return ApiResponse.Ok("Live request cancelled successfully.");
    }

    public async Task<ApiResponse<LiveRequestDto>> SelectShopAsync(Guid customerId, Guid requestId, Guid shopId)
    {
        var request = await _context.LiveRequests
            .Include(r => r.Responses)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (request == null) return ApiResponse<LiveRequestDto>.Fail("Live request not found.");
        if (request.CustomerId != customerId) return ApiResponse<LiveRequestDto>.Fail("Unauthorized.");

        if (request.Status != LiveRequestStatus.Active)
        {
            return ApiResponse<LiveRequestDto>.Fail("Can only select a shop for an active request.");
        }

        // Shop must have responded AVAILABLE
        var hasResponded = request.Responses.Any(r => r.ShopId == shopId);
        if (!hasResponded)
        {
            return ApiResponse<LiveRequestDto>.Fail("You can only select a shop that has responded as AVAILABLE.");
        }

        request.SelectedShopId = shopId;

        // Auto-create or get Chat Conversation for this request and shop
        var existingConversation = await _context.Conversations
            .FirstOrDefaultAsync(c => c.LiveRequestId == requestId && c.ShopId == shopId);

        if (existingConversation == null)
        {
            _context.Conversations.Add(new Conversation
            {
                Id = Guid.NewGuid(),
                LiveRequestId = requestId,
                CustomerId = customerId,
                ShopId = shopId,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        return ApiResponse<LiveRequestDto>.Ok((await LoadRequestDtoAsync(requestId))!, "Shop selected. You can now chat or navigate to the store.");
    }

    public async Task<ApiResponse> FulfillRequestAsync(Guid customerId, Guid requestId)
    {
        var request = await _context.LiveRequests.FindAsync(requestId);
        if (request == null) return ApiResponse.Fail("Live request not found.");
        if (request.CustomerId != customerId) return ApiResponse.Fail("Unauthorized.");

        if (request.Status != LiveRequestStatus.Active)
        {
            return ApiResponse.Fail($"Cannot fulfill a request with status: {request.Status}.");
        }

        request.Status = LiveRequestStatus.Fulfilled;
        request.FulfilledAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return ApiResponse.Ok("Request marked as fulfilled.");
    }

    private async Task<LiveRequestDto?> LoadRequestDtoAsync(Guid requestId)
    {
        var r = await _context.LiveRequests
            .Include(r => r.Customer)
            .Include(r => r.Category)
            .Include(r => r.SubCategory)
            .Include(r => r.SelectedShop)
            .Include(r => r.Responses).ThenInclude(sr => sr.Shop)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (r == null) return null;

        return new LiveRequestDto
        {
            Id = r.Id,
            CustomerId = r.CustomerId,
            CustomerName = r.Customer?.FullName ?? string.Empty,
            RequestText = r.RequestText,
            CategoryId = r.CategoryId,
            CategoryName = r.Category?.Name ?? string.Empty,
            SubCategoryId = r.SubCategoryId,
            SubCategoryName = r.SubCategory?.Name,
            Latitude = r.Latitude,
            Longitude = r.Longitude,
            SearchRadiusKm = r.SearchRadiusKm,
            Status = r.Status.ToString(),
            CreatedAtUtc = r.CreatedAtUtc,
            ExpiresAtUtc = r.ExpiresAtUtc,
            FulfilledAtUtc = r.FulfilledAtUtc,
            CancelledAtUtc = r.CancelledAtUtc,
            SelectedShopId = r.SelectedShopId,
            SelectedShopName = r.SelectedShop?.Name,
            Responses = r.Responses.Select(resp => new ShopResponseDto
            {
                Id = resp.Id,
                ShopId = resp.ShopId,
                ShopName = resp.Shop?.Name ?? string.Empty,
                ShopPhone = resp.Shop?.Phone ?? string.Empty,
                ShopAddress = resp.Shop?.Address ?? string.Empty,
                ShopLatitude = resp.Shop?.Latitude ?? 0,
                ShopLongitude = resp.Shop?.Longitude ?? 0,
                DistanceKm = resp.Shop != null ? GeoLocationHelper.CalculateDistanceKm(r.Latitude, r.Longitude, resp.Shop.Latitude, resp.Shop.Longitude) : null,
                Status = resp.Status.ToString(),
                CreatedAtUtc = resp.CreatedAtUtc
            }).ToList()
        };
    }
}
