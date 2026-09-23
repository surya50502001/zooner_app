using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;


namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/stores/{storeId:guid}/[controller]")]
public class InventoryController : ControllerBase
{
    private readonly IInventoryService _inventoryService;

    public InventoryController(IInventoryService inventoryService)
    {
        _inventoryService = inventoryService;
    }

    /// <summary>
    /// Retrieve inventory items for a specific store (Gated by store approval/live status unless owner or admin)
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<StoreInventoryDetailDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<List<StoreInventoryDetailDto>>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetStoreInventory(
        Guid storeId,
        [FromQuery] string? search,
        [FromQuery] Guid? categoryId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        Guid? requestingUserId = null;
        bool isAdmin = false;
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var parsedId))
        {
            requestingUserId = parsedId;
            isAdmin = User.IsInRole("Admin");
        }

        var response = await _inventoryService.GetStoreInventoryAsync(storeId, search, categoryId, requestingUserId, isAdmin, page, pageSize);
        return response.Success ? Ok(response) : NotFound(response);
    }

    /// <summary>
    /// Add an existing global product variant to a store's inventory
    /// Authorized: Authenticated vendor must own the store
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "VendorPolicy")]
    [ProducesResponseType(typeof(ApiResponse<StoreInventoryDetailDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<StoreInventoryDetailDto>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> AddInventory(
        Guid storeId,
        [FromBody] AddStoreInventoryRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Unauthorized user context."));
        }

        var response = await _inventoryService.AddStoreInventoryAsync(storeId, userId, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Update store inventory details (price, quantity, shelf location)
    /// Authorized: Authenticated vendor must own the store
    /// </summary>
    [HttpPut("{inventoryId:guid}")]
    [Authorize(Policy = "VendorPolicy")]
    [ProducesResponseType(typeof(ApiResponse<StoreInventoryDetailDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateInventory(
        Guid storeId,
        Guid inventoryId,
        [FromBody] UpdateStoreInventoryRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Unauthorized user context."));
        }

        var response = await _inventoryService.UpdateStoreInventoryAsync(storeId, inventoryId, userId, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Deactivate/remove an item from store inventory
    /// Authorized: Authenticated vendor must own the store
    /// </summary>
    [HttpDelete("{inventoryId:guid}")]
    [Authorize(Policy = "VendorPolicy")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteInventory(
        Guid storeId,
        Guid inventoryId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<bool>.ErrorResponse("Unauthorized user context."));
        }

        var response = await _inventoryService.DeleteStoreInventoryAsync(storeId, inventoryId, userId);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Reserve 30-minute customer hold pass (Requires authentication)
    /// </summary>
    [HttpPost("{inventoryId:guid}/hold")]
    [Authorize]
    [EnableRateLimiting("hold-limit")]
    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status200OK)]

    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ReserveHold(
        Guid storeId,
        Guid inventoryId,
        [FromBody] CreateHoldRequest? request = null)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var customerId))
        {
            return Unauthorized(ApiResponse<InventoryHoldDto>.ErrorResponse("Authentication required to reserve hold pass."));
        }

        var quantity = request?.Quantity ?? 1;
        var response = await _inventoryService.ReserveInventoryHoldAsync(storeId, inventoryId, customerId, quantity);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Release customer hold pass (Authorized: Hold owner, Store owner, or Admin)
    /// </summary>
    [HttpPost("{inventoryId:guid}/holds/{holdId:guid}/release")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ReleaseHold(
        Guid storeId,
        Guid inventoryId,
        Guid holdId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<bool>.ErrorResponse("Authentication required."));
        }

        var response = await _inventoryService.ReleaseInventoryHoldAsync(storeId, inventoryId, holdId, userId);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Retrieve all active holds for the current authenticated customer
    /// </summary>
    [HttpGet("~/api/holds/my-holds")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<List<InventoryHoldDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<List<InventoryHoldDto>>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetMyHolds(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var customerId))
        {
            return Unauthorized(ApiResponse<List<InventoryHoldDto>>.ErrorResponse("Authentication required."));
        }

        var response = await _inventoryService.GetActiveHoldsForCustomerAsync(customerId, page, pageSize);
        return Ok(response);
    }

    /// <summary>
    /// Validate customer QR pass code for in-store pickup (Merchant Authorized)
    /// </summary>
    [HttpPost("holds/validate-qr")]
    [Authorize(Policy = "VendorPolicy")]
    [EnableRateLimiting("hold-validation-limit")]
    [ProducesResponseType(typeof(ApiResponse<ValidateHoldQrResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ValidateHoldQrResponse>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ValidateHoldQr(
        Guid storeId,
        [FromBody] ValidateHoldQrRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var vendorUserId))
        {
            return Unauthorized(ApiResponse<ValidateHoldQrResponse>.ErrorResponse("Unauthorized vendor context."));
        }

        var response = await _inventoryService.ValidateHoldQrAsync(storeId, request.QrTokenOrCode, vendorUserId);
        return Ok(response);
    }

    /// <summary>
    /// Mark validated customer hold pass as collected/fulfilled (Merchant Authorized)
    /// </summary>
    [HttpPost("holds/{holdId:guid}/collect")]
    [Authorize(Policy = "VendorPolicy")]
    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<InventoryHoldDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CollectHold(
        Guid storeId,
        Guid holdId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var vendorUserId))
        {
            return Unauthorized(ApiResponse<InventoryHoldDto>.ErrorResponse("Unauthorized vendor context."));
        }

        var response = await _inventoryService.CollectHoldAsync(storeId, holdId, vendorUserId);
        return response.Success ? Ok(response) : BadRequest(response);
    }
}


