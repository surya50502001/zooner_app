using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RequestsController : ControllerBase
{
    private readonly ILiveRequestService _liveRequestService;

    public RequestsController(ILiveRequestService liveRequestService)
    {
        _liveRequestService = liveRequestService;
    }

    /// <summary>
    /// Customer creates a new live product request (broadcasts LIVE to nearby shops)
    /// </summary>
    [Authorize]
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateLiveRequest([FromBody] CreateLiveRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.CreateRequestAsync(userId, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Get details of a live request including all shops that responded AVAILABLE
    /// </summary>
    [Authorize]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetRequestById(Guid id)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.GetRequestByIdAsync(id, userId);
        if (!response.Success)
        {
            if (response.Message == "Live request not found.")
            {
                return NotFound(response);
            }
            if (response.Message.Contains("Access denied") || response.Message.Contains("Unauthorized"))
            {
                return StatusCode(StatusCodes.Status403Forbidden, response);
            }
            return BadRequest(response);
        }
        return Ok(response);
    }

    /// <summary>
    /// Retrieve all active and past live requests created by the authenticated customer
    /// </summary>
    [Authorize]
    [HttpGet("my-requests")]
    [ProducesResponseType(typeof(ApiResponse<List<LiveRequestSummaryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyRequests()
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.GetMyRequestsAsync(userId);
        return Ok(response);
    }

    /// <summary>
    /// Shop owner responds AVAILABLE to a live request (dispatches instant SignalR update to customer)
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/respond")]
    [ProducesResponseType(typeof(ApiResponse<ShopResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ShopResponseDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RespondAvailable(Guid id, [FromBody] RespondToLiveRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.RespondAvailableAsync(userId, id, request.ShopId);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Customer cancels an active live request
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CancelRequest(Guid id)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.CancelRequestAsync(userId, id);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Customer selects a shop from the available respondents to visit or chat
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/select-shop/{shopId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<LiveRequestDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SelectShop(Guid id, Guid shopId)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.SelectShopAsync(userId, id, shopId);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    /// <summary>
    /// Customer marks a request as fulfilled after visiting the shop
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/fulfill")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> FulfillRequest(Guid id)
    {
        var userId = GetCurrentUserId();
        var response = await _liveRequestService.FulfillRequestAsync(userId, id);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }
}
