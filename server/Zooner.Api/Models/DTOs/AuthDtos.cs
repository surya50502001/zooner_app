using System.ComponentModel.DataAnnotations;

namespace Zooner.Api.Models.DTOs;

public class RegisterRequest
{
    [Required(ErrorMessage = "Full name is required")]
    [MaxLength(100, ErrorMessage = "Full name cannot exceed 100 characters")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required")]
    [MinLength(6, ErrorMessage = "Password must be at least 6 characters")]
    public string Password { get; set; } = string.Empty;

    // Note: Public registration always creates standard Customer accounts; any client-provided value is safely ignored.
    public string? Role { get; set; }
}

public class LoginRequest
{
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required")]
    public string Password { get; set; } = string.Empty;
}

public class RefreshTokenRequest
{
    [Required(ErrorMessage = "Refresh token is required")]
    public string RefreshToken { get; set; } = string.Empty;
}

public class RevokeTokenRequest
{
    public string? RefreshToken { get; set; }
}

public class UserDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public int ExpiresInMinutes { get; set; }
    public string TokenType { get; set; } = "Bearer";
    public UserDto User { get; set; } = null!;
}

public class GoogleLoginRequest
{
    [Required(ErrorMessage = "Google credential token is required.")]
    public string Credential { get; set; } = string.Empty;
}

public class GoogleTokenPayload
{
    public string Subject { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool EmailVerified { get; set; }
    public string? Name { get; set; }
    public string? GivenName { get; set; }
    public string? FamilyName { get; set; }
    public string? Picture { get; set; }
}

public class GoogleValidationResult
{
    public bool IsValid { get; set; }
    public string? ErrorMessage { get; set; }
    public GoogleTokenPayload? Payload { get; set; }

    public static GoogleValidationResult Success(GoogleTokenPayload payload) => new() { IsValid = true, Payload = payload };
    public static GoogleValidationResult Fail(string message) => new() { IsValid = false, ErrorMessage = message };
}

