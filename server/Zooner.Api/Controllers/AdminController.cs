using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AdminPolicy")]
public class AdminController : ControllerBase
{
    private readonly ICategoryService _categoryService;
    private readonly IAdminService _adminService;

    public AdminController(ICategoryService categoryService, IAdminService adminService)
    {
        _categoryService = categoryService;
        _adminService = adminService;
    }

    #region Categories
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryRequest request)
    {
        var response = await _categoryService.CreateCategoryAsync(request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpPut("categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] UpdateCategoryRequest request)
    {
        var response = await _categoryService.UpdateCategoryAsync(id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpPatch("categories/{id:guid}/status")]
    public async Task<IActionResult> ToggleCategoryStatus(Guid id, [FromQuery] bool isActive)
    {
        var response = await _categoryService.ToggleCategoryStatusAsync(id, isActive);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpPost("categories/reorder")]
    public async Task<IActionResult> ReorderCategories([FromBody] List<ReorderCategoryItemRequest> items)
    {
        var response = await _categoryService.ReorderCategoriesAsync(items);
        return Ok(response);
    }

    [HttpPost("subcategories")]
    public async Task<IActionResult> CreateSubCategory([FromBody] CreateSubCategoryRequest request)
    {
        var response = await _categoryService.CreateSubCategoryAsync(request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpPut("subcategories/{id:guid}")]
    public async Task<IActionResult> UpdateSubCategory(Guid id, [FromBody] UpdateSubCategoryRequest request)
    {
        var response = await _categoryService.UpdateSubCategoryAsync(id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }
    #endregion

    #region Shops & Verification
    [HttpGet("shops")]
    public async Task<IActionResult> GetAllShops([FromQuery] ShopVerificationStatus? status = null, [FromQuery] string? search = null)
    {
        var response = await _adminService.GetAllShopsAsync(status, search);
        return Ok(response);
    }

    [HttpGet("shops/pending")]
    public async Task<IActionResult> GetPendingShops()
    {
        var response = await _adminService.GetShopsForVerificationAsync();
        return Ok(response);
    }

    [HttpPatch("shops/{id:guid}/verify")]
    public async Task<IActionResult> VerifyShop(Guid id, [FromBody] VerifyShopRequest request)
    {
        var adminId = GetCurrentUserId();
        var response = await _adminService.VerifyShopAsync(adminId, id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpPatch("shops/{id:guid}/status")]
    public async Task<IActionResult> ToggleShopStatus(Guid id, [FromBody] UpdateUserStatusRequest request)
    {
        var adminId = GetCurrentUserId();
        var response = await _adminService.ToggleShopStatusAsync(adminId, id, request.IsActive);
        return response.Success ? Ok(response) : BadRequest(response);
    }
    #endregion

    #region Users
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var response = await _adminService.GetUsersAsync(page, pageSize);
        return Ok(response);
    }

    [HttpPatch("users/{id:guid}/status")]
    public async Task<IActionResult> UpdateUserStatus(Guid id, [FromBody] UpdateUserStatusRequest request)
    {
        var adminId = GetCurrentUserId();
        var response = await _adminService.UpdateUserStatusAsync(adminId, id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }
    #endregion

    #region Reports
    [HttpGet("reports")]
    public async Task<IActionResult> GetReports([FromQuery] ReportStatus? status = null)
    {
        var response = await _adminService.GetReportsAsync(status);
        return Ok(response);
    }

    [HttpPatch("reports/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveReport(Guid id, [FromBody] ResolveReportRequest request)
    {
        var adminId = GetCurrentUserId();
        var response = await _adminService.ResolveReportAsync(adminId, id, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }
    #endregion

    #region Settings
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var response = await _adminService.GetSettingsAsync();
        return Ok(response);
    }

    [HttpPut("settings/{key}")]
    public async Task<IActionResult> UpdateSetting(string key, [FromBody] UpdateSettingRequest request)
    {
        var adminId = GetCurrentUserId();
        var response = await _adminService.UpdateSettingAsync(adminId, key, request);
        return response.Success ? Ok(response) : BadRequest(response);
    }
    #endregion

    #region Admin Actions & Audit Logs
    [HttpGet("actions")]
    public async Task<IActionResult> GetAdminActions([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var response = await _adminService.GetAdminActionsAsync(page, pageSize);
        return Ok(response);
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var response = await _adminService.GetAuditLogsAsync(page, pageSize);
        return Ok(response);
    }
    #endregion

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.Name);
        if (Guid.TryParse(claim, out var id)) return id;
        return Guid.Empty;
    }
}
