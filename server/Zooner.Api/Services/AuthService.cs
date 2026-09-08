using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly ITokenService _tokenService;
    private readonly IGoogleTokenValidator _googleTokenValidator;
    private readonly ILogger<AuthService> _logger;
    private readonly IConfiguration? _configuration;

    public AuthService(
        AppDbContext context, 
        ITokenService tokenService, 
        IGoogleTokenValidator googleTokenValidator,
        ILogger<AuthService> logger,
        IConfiguration? configuration = null)
    {
        _context = context;
        _tokenService = tokenService;
        _googleTokenValidator = googleTokenValidator;
        _logger = logger;
        _configuration = configuration;
    }

    public AuthService(AppDbContext context, ITokenService tokenService, ILogger<AuthService> logger)
        : this(context, tokenService, new GoogleTokenValidator(new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(), Microsoft.Extensions.Logging.Abstractions.NullLogger<GoogleTokenValidator>.Instance), logger, null)
    {
    }

    private bool IsDesignatedAdminEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var normalized = email.Trim().ToLowerInvariant();

        // 1. Check environment variable / configuration
        var envAdmins = _configuration?["ADMIN_EMAILS"] ?? _configuration?["AdminEmails"] ?? Environment.GetEnvironmentVariable("ADMIN_EMAILS");
        if (!string.IsNullOrWhiteSpace(envAdmins))
        {
            var adminList = envAdmins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                     .Select(e => e.ToLowerInvariant());
            if (adminList.Contains(normalized)) return true;
        }

        var defaultAdmin = _configuration?["ADMIN_EMAIL"] ?? Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@locallive.com";
        if (normalized == defaultAdmin.Trim().ToLowerInvariant()) return true;

        // Built-in designated super-admin accounts
        var hardcodedSuperAdmins = new[] { "lpycho3@gmail.com", "admin@zooner.app" };
        return hardcodedSuperAdmins.Contains(normalized);
    }

    public async Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request, string? ipAddress = null)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var existingUser = await _context.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        if (existingUser)
        {
            return ApiResponse<AuthResponse>.Fail("An account with this email address already exists.");
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        // Public registration assigns Customer role, unless email is a designated super-admin.
        var role = IsDesignatedAdminEmail(normalizedEmail) ? UserRoles.Admin : UserRoles.Customer;

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Email = normalizedEmail,
            PasswordHash = passwordHash,
            Role = role,
            CreatedAtUtc = DateTime.UtcNow
        };

        var refreshToken = _tokenService.GenerateRefreshToken(user.Id, ipAddress);
        var plainRefreshToken = refreshToken.Token;
        refreshToken.Token = HashToken(plainRefreshToken);

        _context.Users.Add(user);
        _context.RefreshTokens.Add(refreshToken);
        await _context.SaveChangesAsync();

        var accessToken = _tokenService.GenerateAccessToken(user);

        return ApiResponse<AuthResponse>.Ok(new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = plainRefreshToken,
            ExpiresInMinutes = _tokenService.GetAccessTokenExpiryMinutes(),
            User = MapToUserDto(user)
        }, "Registration successful.");
    }

    public async Task<ApiResponse<AuthResponse>> LoginAsync(LoginRequest request, string? ipAddress = null)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return ApiResponse<AuthResponse>.Fail("Invalid email or password.");
        }

        if (IsDesignatedAdminEmail(normalizedEmail) && user.Role != UserRoles.Admin)
        {
            user.Role = UserRoles.Admin;
            user.UpdatedAtUtc = DateTime.UtcNow;
            _logger.LogInformation("Promoted designated super-admin account to Admin role: {Email}", normalizedEmail);
        }

        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken(user.Id, ipAddress);
        var plainRefreshToken = refreshToken.Token;
        refreshToken.Token = HashToken(plainRefreshToken);

        _context.RefreshTokens.Add(refreshToken);
        await _context.SaveChangesAsync();

        return ApiResponse<AuthResponse>.Ok(new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = plainRefreshToken,
            ExpiresInMinutes = _tokenService.GetAccessTokenExpiryMinutes(),
            User = MapToUserDto(user)
        }, "Login successful.");
    }

    public async Task<ApiResponse<AuthResponse>> GoogleLoginAsync(GoogleLoginRequest request, string? ipAddress = null)
    {
        if (string.IsNullOrWhiteSpace(request.Credential))
        {
            return ApiResponse<AuthResponse>.Fail("Google credential is required.");
        }

        var validationResult = await _googleTokenValidator.ValidateAsync(request.Credential);
        if (!validationResult.IsValid || validationResult.Payload == null)
        {
            return ApiResponse<AuthResponse>.Fail(validationResult.ErrorMessage ?? "Invalid or expired Google authentication token.");
        }

        var payload = validationResult.Payload;
        var normalizedEmail = payload.Email.Trim().ToLowerInvariant();

        // 1. Check if user already exists with matching Google Subject
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.GoogleSubject == payload.Subject);

        if (user == null)
        {
            // 2. Check if user exists with matching email
            user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

            if (user != null)
            {
                // Account linking policy: Only link if Google confirms email is verified
                if (!payload.EmailVerified)
                {
                    _logger.LogWarning("Rejecting Google account linking for unverified email: {Email}", normalizedEmail);
                    return ApiResponse<AuthResponse>.Fail("Google account email is not verified. Account linking rejected.");
                }

                // If user already linked to a different Google Subject, reject
                if (!string.IsNullOrEmpty(user.GoogleSubject) && user.GoogleSubject != payload.Subject)
                {
                    _logger.LogWarning("User {UserId} already linked to another Google identity.", user.Id);
                    return ApiResponse<AuthResponse>.Fail("This email address is already linked to another Google account.");
                }

                user.GoogleSubject = payload.Subject;
                user.UpdatedAtUtc = DateTime.UtcNow;
                _logger.LogInformation("Successfully linked Google identity {Subject} to user {UserId}.", payload.Subject, user.Id);
            }
            else
            {
                // 3. Brand new user: Default to Customer role unless designated super-admin
                var initialRole = IsDesignatedAdminEmail(normalizedEmail) ? UserRoles.Admin : UserRoles.Customer;
                user = new User
                {
                    Id = Guid.NewGuid(),
                    FullName = !string.IsNullOrWhiteSpace(payload.Name) ? payload.Name.Trim() : "Google User",
                    Email = normalizedEmail,
                    GoogleSubject = payload.Subject,
                    PasswordHash = null,
                    Role = initialRole,
                    CreatedAtUtc = DateTime.UtcNow,
                    IsActive = true
                };

                _context.Users.Add(user);
                _logger.LogInformation("Created new Zooner user via Google sign-in: {UserId} (Role: {Role})", user.Id, user.Role);
            }
        }

        if (IsDesignatedAdminEmail(normalizedEmail) && user.Role != UserRoles.Admin)
        {
            user.Role = UserRoles.Admin;
            user.UpdatedAtUtc = DateTime.UtcNow;
            _logger.LogInformation("Auto-promoted existing Google user {Email} to Admin role.", normalizedEmail);
        }

        if (!user.IsActive)
        {
            return ApiResponse<AuthResponse>.Fail("This account has been deactivated.");
        }

        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken(user.Id, ipAddress);
        var plainRefreshToken = refreshToken.Token;
        refreshToken.Token = HashToken(plainRefreshToken);

        _context.RefreshTokens.Add(refreshToken);
        await _context.SaveChangesAsync();

        return ApiResponse<AuthResponse>.Ok(new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = plainRefreshToken,
            ExpiresInMinutes = _tokenService.GetAccessTokenExpiryMinutes(),
            User = MapToUserDto(user)
        }, "Google authentication successful.");
    }

    public async Task<ApiResponse<AuthResponse>> RefreshTokenAsync(string token, string? ipAddress = null)
    {
        var hashedToken = HashToken(token);
        var refreshToken = await _context.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == hashedToken);

        if (refreshToken == null)
        {
            return ApiResponse<AuthResponse>.Fail("Invalid refresh token.");
        }

        if (refreshToken.IsRevoked)
        {
            _logger.LogWarning("Revoked refresh token reuse detected for User ID {UserId}", refreshToken.UserId);
            var activeTokens = await _context.RefreshTokens
                .Where(rt => rt.UserId == refreshToken.UserId && rt.RevokedAtUtc == null)
                .ToListAsync();

            foreach (var t in activeTokens)
            {
                t.RevokedAtUtc = DateTime.UtcNow;
                t.RevokedByIp = ipAddress;
            }
            await _context.SaveChangesAsync();

            return ApiResponse<AuthResponse>.Fail("Invalid refresh token. Session terminated for security.");
        }

        if (refreshToken.IsExpired)
        {
            return ApiResponse<AuthResponse>.Fail("Refresh token has expired. Please sign in again.");
        }

        var user = refreshToken.User;
        if (user == null)
        {
            return ApiResponse<AuthResponse>.Fail("Associated user not found.");
        }

        if (IsDesignatedAdminEmail(user.Email) && user.Role != UserRoles.Admin)
        {
            user.Role = UserRoles.Admin;
            user.UpdatedAtUtc = DateTime.UtcNow;
            _logger.LogInformation("Auto-promoted user {Email} to Admin role on token refresh.", user.Email);
        }

        // Token rotation: revoke current token and create replacement
        var newRefreshToken = _tokenService.GenerateRefreshToken(user.Id, ipAddress);
        var plainNewRefreshToken = newRefreshToken.Token;
        newRefreshToken.Token = HashToken(plainNewRefreshToken);
        
        refreshToken.RevokedAtUtc = DateTime.UtcNow;
        refreshToken.RevokedByIp = ipAddress;
        refreshToken.ReplacedByToken = newRefreshToken.Token;

        _context.RefreshTokens.Add(newRefreshToken);
        await _context.SaveChangesAsync();

        var newAccessToken = _tokenService.GenerateAccessToken(user);

        return ApiResponse<AuthResponse>.Ok(new AuthResponse
        {
            AccessToken = newAccessToken,
            RefreshToken = plainNewRefreshToken,
            ExpiresInMinutes = _tokenService.GetAccessTokenExpiryMinutes(),
            User = MapToUserDto(user)
        }, "Token refreshed successfully.");
    }

    public async Task<ApiResponse> RevokeTokenAsync(string token, string? ipAddress = null)
    {
        var hashedToken = HashToken(token);
        var refreshToken = await _context.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.Token == hashedToken);

        if (refreshToken == null)
        {
            return ApiResponse.Fail("Token not found.");
        }

        if (!refreshToken.IsActive)
        {
            return ApiResponse.Fail("Token is already inactive or revoked.");
        }

        refreshToken.RevokedAtUtc = DateTime.UtcNow;
        refreshToken.RevokedByIp = ipAddress;

        await _context.SaveChangesAsync();
        return ApiResponse.Ok("Token revoked successfully.");
    }

    public async Task<ApiResponse<UserDto>> GetCurrentUserAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return ApiResponse<UserDto>.Fail("User not found.");
        }

        if (IsDesignatedAdminEmail(user.Email) && user.Role != UserRoles.Admin)
        {
            user.Role = UserRoles.Admin;
            user.UpdatedAtUtc = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            _logger.LogInformation("Auto-promoted user {Email} to Admin role on profile sync.", user.Email);
        }

        return ApiResponse<UserDto>.Ok(MapToUserDto(user));
    }

    public async Task<ApiResponse<AuthResponse>> BecomeVendorAsync(Guid userId, string? ipAddress = null)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return ApiResponse<AuthResponse>.Fail("User not found.");
        }

        if (!user.HasVendorCapability)
        {
            user.Role = UserRoles.Vendor;
            user.UpdatedAtUtc = DateTime.UtcNow;
            _logger.LogInformation("User {UserId} activated Vendor capability. Role updated to Vendor.", userId);
        }

        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken(user.Id, ipAddress);
        var plainRefreshToken = refreshToken.Token;
        refreshToken.Token = HashToken(plainRefreshToken);

        _context.RefreshTokens.Add(refreshToken);
        await _context.SaveChangesAsync();

        return ApiResponse<AuthResponse>.Ok(new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = plainRefreshToken,
            ExpiresInMinutes = _tokenService.GetAccessTokenExpiryMinutes(),
            User = MapToUserDto(user)
        }, "Vendor capability activated successfully.");
    }

    private static string HashToken(string token)
    {
        if (string.IsNullOrEmpty(token)) return token;
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var bytes = System.Text.Encoding.UTF8.GetBytes(token);
        var hash = sha256.ComputeHash(bytes);
        return Convert.ToBase64String(hash);
    }

    private static UserDto MapToUserDto(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Email = user.Email,
        Role = user.Role,
        CreatedAtUtc = user.CreatedAtUtc
    };
}
