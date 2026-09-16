using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class RefreshTokenSecurityTests
{
    private readonly IConfiguration _config;
    private readonly ITokenService _tokenService;

    public RefreshTokenSecurityTests()
    {
        _config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Jwt:Key", "SuperSecretTestingJwtKeyMinimum32CharactersLong2026!" },
                { "Jwt:Issuer", "ZoonerApiTest" },
                { "Jwt:Audience", "ZoonerClientTest" },
                { "Jwt:AccessTokenExpiryMinutes", "15" },
                { "Jwt:RefreshTokenExpiryDays", "7" }
            })
            .Build();

        _tokenService = new TokenService(_config);
    }

    [Fact]
    public async Task Expired_Refresh_Token_Is_Rejected()
    {
        using var context = TestDbContextFactory.Create(nameof(Expired_Refresh_Token_Is_Rejected));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var user = new User { Id = Guid.NewGuid(), Email = "user@test.com", Role = UserRoles.Customer, FullName = "User" };
        var rawToken = "expired-raw-token-123";
        var expiredRefreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = AuthService.HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-1), // Expired
            CreatedAtUtc = DateTime.UtcNow.AddDays(-8)
        };

        context.Users.Add(user);
        context.RefreshTokens.Add(expiredRefreshToken);
        await context.SaveChangesAsync();

        var res = await authService.RefreshTokenAsync(rawToken);
        Assert.False(res.Success);
        Assert.Contains("expired", res.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Revoked_Refresh_Token_Reuse_Detects_Attack_And_Revokes_All_User_Sessions()
    {
        using var context = TestDbContextFactory.Create(nameof(Revoked_Refresh_Token_Reuse_Detects_Attack_And_Revokes_All_User_Sessions));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var user = new User { Id = Guid.NewGuid(), Email = "reuse@test.com", Role = UserRoles.Customer, FullName = "User" };
        var stolenTokenRaw = "stolen-token-xyz";
        var legitActiveTokenRaw = "legit-active-token-abc";

        var revokedToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = AuthService.HashToken(stolenTokenRaw),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(5),
            CreatedAtUtc = DateTime.UtcNow.AddDays(-2),
            RevokedAtUtc = DateTime.UtcNow.AddHours(-1) // Revoked previously
        };

        var activeToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = AuthService.HashToken(legitActiveTokenRaw),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.Add(user);
        context.RefreshTokens.AddRange(revokedToken, activeToken);
        await context.SaveChangesAsync();

        // Attacker attempts to use revoked token
        var res = await authService.RefreshTokenAsync(stolenTokenRaw, "192.168.1.100");
        Assert.False(res.Success);
        Assert.Contains("Session terminated", res.Message);

        // Security check: all user tokens must now be revoked due to reuse detection
        var remainingTokens = await context.RefreshTokens.AsNoTracking().Where(rt => rt.UserId == user.Id).ToListAsync();
        Assert.All(remainingTokens, t => Assert.NotNull(t.RevokedAtUtc));
    }

    [Fact]
    public async Task Token_Rotation_Revokes_Old_Token_And_Issues_New_Active_Token()
    {
        using var context = TestDbContextFactory.Create(nameof(Token_Rotation_Revokes_Old_Token_And_Issues_New_Active_Token));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var user = new User { Id = Guid.NewGuid(), Email = "rotate@test.com", Role = UserRoles.Customer, FullName = "User" };
        var rawToken = "initial-token-123";
        var refreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = AuthService.HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.Add(user);
        context.RefreshTokens.Add(refreshToken);
        await context.SaveChangesAsync();

        var res = await authService.RefreshTokenAsync(rawToken, "127.0.0.1");
        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.NotEmpty(res.Data.AccessToken);
        Assert.NotEmpty(res.Data.RefreshToken);
        Assert.NotEqual(rawToken, res.Data.RefreshToken);

        // Verify old token in DB is revoked with replacement pointer
        var oldDbToken = await context.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(rt => rt.Id == refreshToken.Id);
        Assert.NotNull(oldDbToken!.RevokedAtUtc);
        Assert.NotNull(oldDbToken.ReplacedByToken);

        // Verify new token in DB is active
        var newDbToken = await context.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(rt => rt.Token == AuthService.HashToken(res.Data.RefreshToken));
        Assert.NotNull(newDbToken);
        Assert.Null(newDbToken.RevokedAtUtc);
        Assert.True(newDbToken.IsActive);
    }

    [Fact]
    public async Task Logout_Revokes_Active_Refresh_Token()
    {
        using var context = TestDbContextFactory.Create(nameof(Logout_Revokes_Active_Refresh_Token));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var user = new User { Id = Guid.NewGuid(), Email = "logout@test.com", Role = UserRoles.Customer, FullName = "User" };
        var rawToken = "logout-token-123";
        var refreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = AuthService.HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.Add(user);
        context.RefreshTokens.Add(refreshToken);
        await context.SaveChangesAsync();

        var res = await authService.RevokeTokenAsync(rawToken, "127.0.0.1");
        Assert.True(res.Success);

        var dbToken = await context.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(rt => rt.Id == refreshToken.Id);
        Assert.NotNull(dbToken!.RevokedAtUtc);
        Assert.False(dbToken.IsActive);
    }
}

