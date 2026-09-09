using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Models;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShopsController : ControllerBase
{
    private readonly IShopService _shopService;
    private readonly ILiveRequestService _liveRequestService;
    private readonly IAdminService _adminService;

    public ShopsController(IShopService shopService, ILiveRequestService liveRequestService, IAdminService adminService)
    {
        _shopService = shopService;
        _liveRequestService = liveRequestService;
        _adminService = adminService;
    }

    /// <summary>
    /// Register a new shop (Requires Vendor capability or Admin)
    /// </summary>
    [Authorize(Policy = "VendorPolicy")]
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateShop([FromBody] CreateShopRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.CreateShopAsync(userId, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Retrieve nearby public approved & active shops within distance radius
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<ShopDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetNearbyShops(
        [FromQuery] double? userLat = null,
        [FromQuery] double? userLon = null,
        [FromQuery] double? radiusKm = null,
        [FromQuery] string? category = null)
    {
        var response = await _shopService.GetNearbyShopsAsync(userLat, userLon, radiusKm, category);
        return Ok(response);
    }

    /// <summary>
    /// Retrieve shop details by ID (Public only if Approved, Active & Live; Owners/Admin can view pending/offline)
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetShopById(Guid id, [FromQuery] double? userLat = null, [FromQuery] double? userLon = null)
    {
        Guid? requestingUserId = null;
        bool isAdmin = false;
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var parsedId))
        {
            requestingUserId = parsedId;
            isAdmin = User.IsInRole("Admin");
        }

        var response = await _shopService.GetShopByIdAsync(id, userLat, userLon, requestingUserId, isAdmin);
        return response.Success ? Ok(response) : NotFound(response);
    }

    /// <summary>
    /// Retrieve all shops owned by current authenticated user
    /// </summary>
    [Authorize]
    [HttpGet("my-shops")]
    [ProducesResponseType(typeof(ApiResponse<List<ShopDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyShops()
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.GetMyShopsAsync(userId);
        return Ok(response);
    }

    /// <summary>
    /// Update shop profile (Owner only)
    /// </summary>
    [Authorize]
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateShop(Guid id, [FromBody] UpdateShopRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.UpdateShopAsync(userId, id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Toggle Shop LIVE availability online/offline (Owner only)
    /// </summary>
    [Authorize]
    [HttpPatch("{id:guid}/live-status")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleLiveStatus(Guid id, [FromBody] ToggleLiveStatusRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.ToggleLiveStatusAsync(userId, id, request.IsLiveEnabled);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Assign product categories to shop (Owner only)
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/categories")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> AssignCategories(Guid id, [FromBody] AssignCategoriesRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.AssignCategoriesAsync(userId, id, request.CategoryIds);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Remove a category from shop (Owner only)
    /// </summary>
    [Authorize]
    [HttpDelete("{id:guid}/categories/{categoryId:guid}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveCategory(Guid id, Guid categoryId)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.RemoveCategoryAsync(userId, id, categoryId);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Retrieve operating hours for shop
    /// </summary>
    [HttpGet("{id:guid}/operating-hours")]
    [ProducesResponseType(typeof(ApiResponse<List<ShopOperatingHourDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOperatingHours(Guid id)
    {
        Guid? requestingUserId = null;
        bool isAdmin = false;
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var parsedId))
        {
            requestingUserId = parsedId;
            isAdmin = User.IsInRole("Admin");
        }

        var response = await _shopService.GetOperatingHoursAsync(id, requestingUserId, isAdmin);
        return Ok(response);
    }

    /// <summary>
    /// Update operating hours for shop (Owner only)
    /// </summary>
    [Authorize]
    [HttpPut("{id:guid}/operating-hours")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateOperatingHours(Guid id, [FromBody] UpdateOperatingHoursRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.UpdateOperatingHoursAsync(userId, id, request.OperatingHours);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Retrieve incoming live requests matching this shop's location and categories (Owner only)
    /// </summary>
    [Authorize]
    [HttpGet("{id:guid}/incoming-requests")]
    [ProducesResponseType(typeof(ApiResponse<List<LiveRequestSummaryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetIncomingRequests(Guid id)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.GetIncomingRequestsForShopAsync(userId, id);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Instant verification for Super-Admin shop owners
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/verify-owner")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> VerifyOwnerShop(Guid id)
    {
        var userId = GetCurrentUserId();
        var userEmail = User.FindFirstValue(ClaimTypes.Email)
                     ?? User.FindFirstValue("email")
                     ?? User.FindFirstValue("preferred_username")
                     ?? string.Empty;

        // Check JWT role claim first, then super-admin email list
        var isAdmin = User.IsInRole("Admin") || _adminService.IsSuperAdminEmail(userEmail);

        // Fallback: if email claim is missing, check the database role directly
        if (!isAdmin && userId != Guid.Empty)
        {
            isAdmin = await _adminService.IsAdminUserAsync(userId);
        }

        if (!isAdmin)
        {
            return StatusCode(403, new { success = false, message = "Verification failed. Check admin privileges." });
        }

        var response = await _adminService.VerifyShopAsync(userId, id, new VerifyShopRequest 
        { 
            Status = ShopVerificationStatus.Approved
        });
        return response.Success ? Ok(response) : BadRequest(response);
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub")
                 ?? User.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            return Guid.Empty;
        return id;
    }
}
