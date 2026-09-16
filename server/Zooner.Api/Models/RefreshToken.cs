using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Zooner.Api.Models;

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public string Token { get; set; } = string.Empty;

    public DateTime ExpiresAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public string? CreatedByIp { get; set; }

    [ConcurrencyCheck]
    public DateTime? RevokedAtUtc { get; set; }

    public string? RevokedByIp { get; set; }

    public string? ReplacedByToken { get; set; }

    public Guid UserId { get; set; }

    [JsonIgnore]
    public User? User { get; set; }

    public bool IsExpired => DateTime.UtcNow >= ExpiresAtUtc;

    public bool IsRevoked => RevokedAtUtc != null;

    public bool IsActive => !IsRevoked && !IsExpired;
}
