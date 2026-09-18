using System.ComponentModel.DataAnnotations;

namespace Zooner.Api.Models.DTOs;

public class JoinWaitlistRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    [MaxLength(256, ErrorMessage = "Email must not exceed 256 characters.")]
    public string Email { get; set; } = string.Empty;

    [MaxLength(100, ErrorMessage = "City must not exceed 100 characters.")]
    public string? City { get; set; }

    [Required(ErrorMessage = "UserType is required.")]
    [MaxLength(50, ErrorMessage = "UserType must not exceed 50 characters.")]
    public string UserType { get; set; } = "Shopper"; // "Shopper" or "Retailer"
}

public class WaitlistConfirmationDto
{
    public string Email { get; set; } = string.Empty;
    public string? City { get; set; }
    public string UserType { get; set; } = "Shopper";
}

// Backward-compatible alias for existing references without exposing sensitive columns
public class WaitlistEntryDto : WaitlistConfirmationDto
{
}
