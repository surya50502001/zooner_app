using System.ComponentModel.DataAnnotations;

namespace Zooner.Api.Models.DTOs;

public class ShopOperatingHourDto
{
    public DayOfWeek DayOfWeek { get; set; }
    public TimeSpan OpenTime { get; set; }
    public TimeSpan CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

public class ShopCategorySummaryDto
{
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
}

public class ShopDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? ImageUrl { get; set; }
    public string VerificationStatus { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool IsLiveEnabled { get; set; }
    public bool IsCurrentlyOpen { get; set; }
    public double? DistanceKm { get; set; }
    public List<ShopCategorySummaryDto> Categories { get; set; } = new();
    public List<ShopOperatingHourDto> OperatingHours { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
}

public class VendorShopDto : ShopDto
{
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public string OwnerEmail { get; set; } = string.Empty;
    public string OwnerPhone { get; set; } = string.Empty;
}

public class CreateShopRequest
{
    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    [Required]
    [MaxLength(300)]
    public string Address { get; set; } = string.Empty;

    [Range(-90.0, 90.0)]
    public double Latitude { get; set; }

    [Range(-180.0, 180.0)]
    public double Longitude { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    public List<Guid> CategoryIds { get; set; } = new();
}

public class UpdateShopRequest
{
    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    [Required]
    [MaxLength(300)]
    public string Address { get; set; } = string.Empty;

    [Range(-90.0, 90.0)]
    public double Latitude { get; set; }

    [Range(-180.0, 180.0)]
    public double Longitude { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }
}

public class ToggleLiveStatusRequest
{
    [Required]
    public bool IsLiveEnabled { get; set; }
}

public class AssignCategoriesRequest
{
    [Required]
    public List<Guid> CategoryIds { get; set; } = new();
}

public class UpdateOperatingHoursRequest
{
    [Required]
    public List<ShopOperatingHourDto> OperatingHours { get; set; } = new();
}
