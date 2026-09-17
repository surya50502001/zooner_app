using System.ComponentModel.DataAnnotations;

namespace Zooner.Api.Models;

public class WaitlistEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [EmailAddress]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(50)]
    public string UserType { get; set; } = "Shopper"; // "Shopper" or "Retailer"

    [MaxLength(64)]
    public string? IpAddress { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
