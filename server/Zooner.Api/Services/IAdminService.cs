using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Services;

public interface IAdminService
{
    Task<ApiResponse<ReportDto>> CreateReportAsync(Guid reporterId, CreateReportRequest request);
    Task<ApiResponse<List<ReportDto>>> GetReportsAsync(ReportStatus? status = null);
    Task<ApiResponse<ReportDto>> ResolveReportAsync(Guid adminId, Guid reportId, ResolveReportRequest request);
    Task<ApiResponse<List<ShopDto>>> GetShopsForVerificationAsync();
    Task<ApiResponse<List<ShopDto>>> GetAllShopsAsync(ShopVerificationStatus? status = null, string? search = null);
    Task<ApiResponse> VerifyShopAsync(Guid adminId, Guid shopId, VerifyShopRequest request);
    Task<ApiResponse> ToggleShopStatusAsync(Guid adminId, Guid shopId, bool isActive);
    Task<ApiResponse<List<UserDto>>> GetUsersAsync(int page = 1, int pageSize = 50);
    Task<ApiResponse> UpdateUserStatusAsync(Guid adminId, Guid targetUserId, UpdateUserStatusRequest request);
    Task<ApiResponse<List<BusinessSettingDto>>> GetSettingsAsync();
    Task<ApiResponse<BusinessSettingDto>> UpdateSettingAsync(Guid adminId, string key, UpdateSettingRequest request);
    Task<ApiResponse<List<AdminActionDto>>> GetAdminActionsAsync(int page = 1, int pageSize = 50);
    Task<ApiResponse<List<AuditLogDto>>> GetAuditLogsAsync(int page = 1, int pageSize = 50);
    bool IsSuperAdminEmail(string email);
}
