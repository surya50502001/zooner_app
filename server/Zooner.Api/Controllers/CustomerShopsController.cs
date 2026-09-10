using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Models;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomerShopsController : ControllerBase
{
    private readonly IShopService _shopService;

    public CustomerShopsController(IShopService shopService)
    {
        _shopService = shopService;
    }

    // Register a new shop for any authenticated user (no vendor role required)
    [Authorize]
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ShopDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateCustomerShop([FromBody] CreateShopRequest request)
    {
        var userId = GetCurrentUserId();
        var response = await _shopService.CreateShopAsync(userId, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.Parse(claim!);
    }
}
