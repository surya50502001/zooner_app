using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Zooner.Api.Models;

namespace Zooner.Api.Services;

public class TokenService : ITokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateAccessToken(User user)
    {
        var secretKey = _configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("JWT Key is not configured.");
        var issuer = _configuration["Jwt:Issuer"] ?? "ZoonerApi";
        var audience = _configuration["Jwt:Audience"] ?? "ZoonerClient";
        var expiryMinutes = GetAccessTokenExpiryMinutes();

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Email, user.Email)
        };

        if (user.HasCustomerCapability)
        {
            claims.Add(new Claim(ClaimTypes.Role, UserRoles.Customer));
        }

        if (user.HasVendorCapability)
        {
            claims.Add(new Claim(ClaimTypes.Role, UserRoles.Vendor));
            claims.Add(new Claim(ClaimTypes.Role, "ShopOwner"));
        }

        if (user.IsAdmin)
        {
            claims.Add(new Claim(ClaimTypes.Role, UserRoles.Admin));
        }

        if (!claims.Any(c => c.Type == ClaimTypes.Role && c.Value.Equals(user.Role, StringComparison.OrdinalIgnoreCase)))
        {
            claims.Add(new Claim(ClaimTypes.Role, user.Role));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(expiryMinutes),
            Issuer = issuer,
            Audience = audience,
            SigningCredentials = credentials
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    public RefreshToken GenerateRefreshToken(Guid userId, string? ipAddress = null)
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);

        var expiryDays = int.TryParse(_configuration["Jwt:RefreshTokenExpiryDays"], out var days) ? days : 7;

        return new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Token = Convert.ToBase64String(randomBytes),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(expiryDays),
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByIp = ipAddress
        };
    }

    public int GetAccessTokenExpiryMinutes()
    {
        return int.TryParse(_configuration["Jwt:AccessTokenExpiryMinutes"], out var minutes) ? minutes : 60;
    }
}
