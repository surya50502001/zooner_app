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

    public async Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request, string? ipAddress = null)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var existingUser = await _context.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        if (existingUser)
        {
            return ApiResponse<AuthResponse>.Fail("An account with this email address already exists.");
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        // Public registration always assigns Customer role
        var role = UserRoles.Customer;

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
        try
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

            // Guard: user not found
            if (user == null)
            {
                return ApiResponse<AuthResponse>.Fail("Invalid email or password.");
            }

            // Guard: Google-only account (no password set)
            if (string.IsNullOrEmpty(user.PasswordHash))
            {
                return ApiResponse<AuthResponse>.Fail("This account uses Google Sign-In. Please sign in with Google instead.");
            }

            // Guard: wrong password
            bool passwordValid;
            try { passwordValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash); }
            catch { passwordValid = false; }

            if (!passwordValid)
            {
                return ApiResponse<AuthResponse>.Fail("Invalid email or password.");
            }

            if (!user.IsActive)
            {
                return ApiResponse<AuthResponse>.Fail("This account has been deactivated. Please contact support.");
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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during login for {Email}", request.Email?.Trim());
            return ApiResponse<AuthResponse>.Fail("An unexpected error occurred. Please try again.");
        }
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
                // 3. Brand new user: Default to Customer role
                var initialRole = UserRoles.Customer;
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
        if (string.IsNullOrWhiteSpace(token))
        {
            return ApiResponse<AuthResponse>.Fail("Invalid refresh token.");
        }

        var hashedToken = HashToken(token);
        var now = DateTime.UtcNow;

        // 1. Generate replacement credentials upfront
        var expiryDays = int.TryParse(_configuration?["Jwt:RefreshTokenExpiryDays"], out var days) ? days : 7;
        var newExpiresAtUtc = now.AddDays(expiryDays);

        var randomBytes = new byte[64];
        using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create())
        {
            rng.GetBytes(randomBytes);
        }
        var plainNewRefreshToken = Convert.ToBase64String(randomBytes);
        var hashedNewRefreshToken = HashToken(plainNewRefreshToken);

        // 2. Perform atomic conditional transition: exactly one request can transition the active unrevoked token
        var rowsAffected = await _context.RefreshTokens
            .Where(rt => rt.Token == hashedToken && rt.RevokedAtUtc == null && rt.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(rt => rt.RevokedAtUtc, now)
                .SetProperty(rt => rt.RevokedByIp, ipAddress)
                .SetProperty(rt => rt.ReplacedByToken, hashedNewRefreshToken));

        if (rowsAffected == 1)
        {
            // Winner of the rotation: load consumed token to obtain UserId and verify User is active
            var consumedToken = await _context.RefreshTokens
                .Include(rt => rt.User)
                .FirstOrDefaultAsync(rt => rt.Token == hashedToken);

            if (consumedToken == null || consumedToken.User == null)
            {
                return ApiResponse<AuthResponse>.Fail("Associated user not found.");
            }

            var user = consumedToken.User;
            if (!user.IsActive)
            {
                return ApiResponse<AuthResponse>.Fail("This account has been deactivated.");
            }

            var newRefreshTokenEntity = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Token = hashedNewRefreshToken,
                ExpiresAtUtc = newExpiresAtUtc,
                CreatedAtUtc = now,
                CreatedByIp = ipAddress
            };

            _context.RefreshTokens.Add(newRefreshTokenEntity);
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

        // rowsAffected == 0: Token does not exist, expired, or was already consumed/revoked
        var existingToken = await _context.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.Token == hashedToken);

        if (existingToken == null)
        {
            return ApiResponse<AuthResponse>.Fail("Invalid refresh token.");
        }

        if (existingToken.IsRevoked)
        {
            if (!string.IsNullOrEmpty(existingToken.ReplacedByToken))
            {
                // Token was already rotated/consumed by another request
                return ApiResponse<AuthResponse>.Fail("Refresh token has already been used or rotated.");
            }

            // Explicitly revoked token reuse detected -> invalidate all active tokens for this user
            _logger.LogWarning("Revoked refresh token reuse detected for User ID {UserId}", existingToken.UserId);
            await _context.RefreshTokens
                .Where(rt => rt.UserId == existingToken.UserId && rt.RevokedAtUtc == null)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(t => t.RevokedAtUtc, now)
                    .SetProperty(t => t.RevokedByIp, ipAddress));

            return ApiResponse<AuthResponse>.Fail("Invalid refresh token. Session terminated for security.");
        }

        if (existingToken.ExpiresAtUtc <= now)
        {
            return ApiResponse<AuthResponse>.Fail("Refresh token has expired. Please sign in again.");
        }

        return ApiResponse<AuthResponse>.Fail("Refresh token has already been used or rotated.");
    }

    public async Task<ApiResponse> RevokeTokenAsync(string token, string? ipAddress = null)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return ApiResponse.Fail("Token not found.");
        }

        var hashedToken = HashToken(token);
        var now = DateTime.UtcNow;

        var rowsAffected = await _context.RefreshTokens
            .Where(rt => rt.Token == hashedToken && rt.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(rt => rt.RevokedAtUtc, now)
                .SetProperty(rt => rt.RevokedByIp, ipAddress));

        if (rowsAffected > 0)
        {
            return ApiResponse.Ok("Token revoked successfully.");
        }

        var existing = await _context.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == hashedToken);
        if (existing == null)
        {
            return ApiResponse.Fail("Token not found.");
        }

        return ApiResponse.Fail("Token is already inactive or revoked.");
    }

    public async Task<ApiResponse<UserDto>> GetCurrentUserAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return ApiResponse<UserDto>.Fail("User not found.");
        }

        if (!user.IsActive)
        {
            return ApiResponse<UserDto>.Fail("This account has been deactivated.");
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

        if (!user.IsActive)
        {
            return ApiResponse<AuthResponse>.Fail("This account has been deactivated.");
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

    public static string HashToken(string token)
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
