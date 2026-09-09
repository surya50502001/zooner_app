using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Services;

public class AdminService : IAdminService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration? _configuration;

    public AdminService(AppDbContext context, IConfiguration? configuration = null)
    {
        _context = context;
        _configuration = configuration;
    }

    public bool IsSuperAdminEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var superAdmins = _configuration?.GetSection("AdminConfig:SuperAdminEmails").Get<List<string>>()
            ?? new List<string> { "lpycho3@gmail.com", "admin@zooner.app" };
        return superAdmins.Any(a => a.Equals(email.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public async Task<bool> IsAdminUserAsync(Guid userId)
    {
        if (userId == Guid.Empty) return false;
        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return false;
        return user.Role == UserRoles.Admin || IsSuperAdminEmail(user.Email ?? string.Empty);
    }

    public async Task<ApiResponse<ReportDto>> CreateReportAsync(Guid reporterId, CreateReportRequest request)
    {
        var report = new Report
        {
            Id = Guid.NewGuid(),
            ReporterId = reporterId,
            TargetType = request.TargetType,
            TargetId = request.TargetId,
            Reason = request.Reason.Trim(),
            Description = request.Description.Trim(),
            Status = ReportStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.Reports.Add(report);
        await _context.SaveChangesAsync();

        var reporter = await _context.Users.FindAsync(reporterId);

        return ApiResponse<ReportDto>.Ok(new ReportDto
        {
            Id = report.Id,
            ReporterId = reporterId,
            ReporterName = reporter?.FullName ?? string.Empty,
            TargetType = report.TargetType,
            TargetId = report.TargetId,
            Reason = report.Reason,
            Description = report.Description,
            Status = report.Status.ToString(),
            CreatedAtUtc = report.CreatedAtUtc
        }, "Report submitted.");
    }

    public async Task<ApiResponse<List<ReportDto>>> GetReportsAsync(ReportStatus? status = null)
    {
        var query = _context.Reports.Include(r => r.Reporter).AsQueryable();

        if (status.HasValue)
        {
            query = query.Where(r => r.Status == status.Value);
        }

        var reports = await query
            .OrderByDescending(r => r.CreatedAtUtc)
            .AsNoTracking()
            .Select(r => new ReportDto
            {
                Id = r.Id,
                ReporterId = r.ReporterId,
                ReporterName = r.Reporter != null ? r.Reporter.FullName : string.Empty,
                TargetType = r.TargetType,
                TargetId = r.TargetId,
                Reason = r.Reason,
                Description = r.Description,
                Status = r.Status.ToString(),
                AdminNotes = r.AdminNotes,
                CreatedAtUtc = r.CreatedAtUtc,
                ResolvedAtUtc = r.ResolvedAtUtc
            })
            .ToListAsync();

        return ApiResponse<List<ReportDto>>.Ok(reports);
    }

    public async Task<ApiResponse<ReportDto>> ResolveReportAsync(Guid adminId, Guid reportId, ResolveReportRequest request)
    {
        var report = await _context.Reports.Include(r => r.Reporter).FirstOrDefaultAsync(r => r.Id == reportId);
        if (report == null)
        {
            return ApiResponse<ReportDto>.Fail("Report not found.");
        }

        report.Status = request.Status;
        report.AdminNotes = request.AdminNotes?.Trim();
        report.ResolvedAtUtc = DateTime.UtcNow;

        _context.AdminActions.Add(new AdminAction
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId,
            Action = "ResolveReport",
            TargetEntity = "Report",
            TargetId = reportId.ToString(),
            Details = $"Report resolved to {request.Status}. Notes: {request.AdminNotes}",
            TimestampUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        return ApiResponse<ReportDto>.Ok(new ReportDto
        {
            Id = report.Id,
            ReporterId = report.ReporterId,
            ReporterName = report.Reporter?.FullName ?? string.Empty,
            TargetType = report.TargetType,
            TargetId = report.TargetId,
            Reason = report.Reason,
            Description = report.Description,
            Status = report.Status.ToString(),
            AdminNotes = report.AdminNotes,
            CreatedAtUtc = report.CreatedAtUtc,
            ResolvedAtUtc = report.ResolvedAtUtc
        }, "Report updated.");
    }

    public async Task<ApiResponse<List<ShopDto>>> GetShopsForVerificationAsync()
    {
        return await GetAllShopsAsync(ShopVerificationStatus.Pending);
    }

    public async Task<ApiResponse<List<ShopDto>>> GetAllShopsAsync(ShopVerificationStatus? status = null, string? search = null)
    {
        var query = _context.Shops
            .Include(s => s.Owner)
            .Include(s => s.ShopCategories).ThenInclude(sc => sc.Category)
            .Include(s => s.OperatingHours)
            .AsNoTracking()
            .AsQueryable();

        if (status.HasValue)
        {
            query = query.Where(s => s.VerificationStatus == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var sLower = search.Trim().ToLower();
            query = query.Where(s =>
                s.Name.ToLower().Contains(sLower) ||
                (s.Address != null && s.Address.ToLower().Contains(sLower)) ||
                (s.Phone != null && s.Phone.ToLower().Contains(sLower)) ||
                (s.Owner != null && (s.Owner.FullName.ToLower().Contains(sLower) || s.Owner.Email.ToLower().Contains(sLower))));
        }

        var shops = await query
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToListAsync();

        var dtos = shops.Select(s => new VendorShopDto
        {
            Id = s.Id,
            OwnerId = s.OwnerId,
            OwnerName = s.Owner?.FullName ?? string.Empty,
            Name = s.Name,
            Description = s.Description,
            Phone = s.Phone,
            Address = s.Address,
            Latitude = s.Latitude,
            Longitude = s.Longitude,
            ImageUrl = s.ImageUrl,
            VerificationStatus = s.VerificationStatus.ToString(),
            IsActive = s.IsActive,
            IsLiveEnabled = s.IsLiveEnabled,
            CreatedAtUtc = s.CreatedAtUtc,
            Categories = s.ShopCategories.Select(sc => new ShopCategorySummaryDto
            {
                CategoryId = sc.CategoryId,
                Name = sc.Category?.Name ?? string.Empty,
                Slug = sc.Category?.Slug ?? string.Empty,
                Icon = sc.Category?.Icon ?? string.Empty
            }).ToList()
        }).Cast<ShopDto>().ToList();

        return ApiResponse<List<ShopDto>>.Ok(dtos);
    }

    public async Task<ApiResponse> VerifyShopAsync(Guid adminId, Guid shopId, VerifyShopRequest request)
    {
        var shop = await _context.Shops.FindAsync(shopId);
        if (shop == null) return ApiResponse.Fail("Shop not found.");

        shop.VerificationStatus = request.Status;
        if (request.Status == ShopVerificationStatus.Approved)
        {
            shop.IsActive = true;
            var owner = await _context.Users.FindAsync(shop.OwnerId);
            if (owner != null && owner.Role != UserRoles.Admin)
            {
                owner.Role = UserRoles.Vendor;
                owner.UpdatedAtUtc = DateTime.UtcNow;
            }
        }
        shop.UpdatedAtUtc = DateTime.UtcNow;

        _context.AdminActions.Add(new AdminAction
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId != Guid.Empty ? adminId : null,
            Action = "VerifyShop",
            TargetEntity = "Shop",
            TargetId = shopId.ToString(),
            Details = $"Shop '{shop.Name}' verification status set to {request.Status}",
            TimestampUtc = DateTime.UtcNow
        });

        // Notify shop owner
        _context.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            UserId = shop.OwnerId,
            Title = "Shop Verification Update",
            Message = $"Your shop '{shop.Name}' verification status is now: {request.Status}.",
            Type = "ShopVerification",
            RelatedEntityId = shop.Id,
            CreatedAtUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();
        return ApiResponse.Ok($"Shop status updated to {request.Status}.");
    }

    public async Task<ApiResponse> ToggleShopStatusAsync(Guid adminId, Guid shopId, bool isActive)
    {
        var shop = await _context.Shops.FindAsync(shopId);
        if (shop == null) return ApiResponse.Fail("Shop not found.");

        shop.IsActive = isActive;
        shop.UpdatedAtUtc = DateTime.UtcNow;

        _context.AdminActions.Add(new AdminAction
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId,
            Action = "ToggleShopStatus",
            TargetEntity = "Shop",
            TargetId = shopId.ToString(),
            Details = $"Shop '{shop.Name}' active status set to {isActive}",
            TimestampUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();
        return ApiResponse.Ok($"Shop '{shop.Name}' is now {(isActive ? "active" : "suspended")}.");
    }

    public async Task<ApiResponse<List<UserDto>>> GetUsersAsync(int page = 1, int pageSize = 50)
    {
        var users = await _context.Users
            .OrderByDescending(u => u.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .AsNoTracking()
            .Select(u => new UserDto
            {
                Id = u.Id,
                FullName = u.FullName,
                Email = u.Email,
                Role = u.Role,
                CreatedAtUtc = u.CreatedAtUtc
            })
            .ToListAsync();

        return ApiResponse<List<UserDto>>.Ok(users);
    }

    public async Task<ApiResponse> UpdateUserStatusAsync(Guid adminId, Guid targetUserId, UpdateUserStatusRequest request)
    {
        var user = await _context.Users.FindAsync(targetUserId);
        if (user == null) return ApiResponse.Fail("User not found.");

        user.IsActive = request.IsActive;
        user.UpdatedAtUtc = DateTime.UtcNow;

        _context.AdminActions.Add(new AdminAction
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId,
            Action = "UpdateUserStatus",
            TargetEntity = "User",
            TargetId = targetUserId.ToString(),
            Details = $"User active status set to {request.IsActive}",
            TimestampUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();
        return ApiResponse.Ok($"User account {(request.IsActive ? "activated" : "deactivated")}.");
    }

    public async Task<ApiResponse<List<BusinessSettingDto>>> GetSettingsAsync()
    {
        var settings = await _context.BusinessSettings
            .AsNoTracking()
            .Select(s => new BusinessSettingDto
            {
                Key = s.Key,
                Value = s.Value,
                Description = s.Description,
                UpdatedAtUtc = s.UpdatedAtUtc,
                UpdatedBy = s.UpdatedBy
            })
            .ToListAsync();

        return ApiResponse<List<BusinessSettingDto>>.Ok(settings);
    }

    public async Task<ApiResponse<BusinessSettingDto>> UpdateSettingAsync(Guid adminId, string key, UpdateSettingRequest request)
    {
        var setting = await _context.BusinessSettings.FindAsync(key);
        if (setting == null)
        {
            setting = new BusinessSetting
            {
                Key = key,
                Value = request.Value,
                Description = request.Description ?? string.Empty,
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = adminId.ToString()
            };
            _context.BusinessSettings.Add(setting);
        }
        else
        {
            setting.Value = request.Value;
            if (request.Description != null) setting.Description = request.Description;
            setting.UpdatedAtUtc = DateTime.UtcNow;
            setting.UpdatedBy = adminId.ToString();
        }

        _context.AdminActions.Add(new AdminAction
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId,
            Action = "UpdateSetting",
            TargetEntity = "BusinessSetting",
            TargetId = key,
            Details = $"Setting '{key}' value changed to '{request.Value}'",
            TimestampUtc = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        return ApiResponse<BusinessSettingDto>.Ok(new BusinessSettingDto
        {
            Key = setting.Key,
            Value = setting.Value,
            Description = setting.Description,
            UpdatedAtUtc = setting.UpdatedAtUtc,
            UpdatedBy = setting.UpdatedBy
        }, "Setting updated.");
    }

    public async Task<ApiResponse<List<AdminActionDto>>> GetAdminActionsAsync(int page = 1, int pageSize = 50)
    {
        var logs = await _context.AdminActions
            .OrderByDescending(al => al.TimestampUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(al => al.AdminUser)
            .AsNoTracking()
            .Select(al => new AdminActionDto
            {
                Id = al.Id,
                AdminUserId = al.AdminUserId,
                AdminUserName = al.AdminUser != null ? al.AdminUser.FullName : "System",
                Action = al.Action,
                TargetEntity = al.TargetEntity,
                TargetId = al.TargetId,
                Details = al.Details,
                TimestampUtc = al.TimestampUtc
            })
            .ToListAsync();

        return ApiResponse<List<AdminActionDto>>.Ok(logs);
    }

    public async Task<ApiResponse<List<AuditLogDto>>> GetAuditLogsAsync(int page = 1, int pageSize = 50)
    {
        var res = await GetAdminActionsAsync(page, pageSize);
        var auditLogs = res.Data?.Select(a => new AuditLogDto
        {
            Id = a.Id,
            AdminUserId = a.AdminUserId,
            AdminUserName = a.AdminUserName,
            Action = a.Action,
            TargetEntity = a.TargetEntity,
            TargetId = a.TargetId,
            Details = a.Details,
            TimestampUtc = a.TimestampUtc
        }).ToList() ?? new List<AuditLogDto>();

        return ApiResponse<List<AuditLogDto>>.Ok(auditLogs);
    }
}
