using System;
using System.Collections.Generic;
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

public class DisabledUserAuthenticationTests
{
    private readonly IConfiguration _config;
    private readonly ITokenService _tokenService;

    public DisabledUserAuthenticationTests()
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
    public async Task Active_User_Login_Succeeds()
    {
        using var context = TestDbContextFactory.Create(nameof(Active_User_Login_Succeeds));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var password = "SecurePassword123!";
        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Active User",
            Email = "active@test.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = UserRoles.Customer,
            IsActive = true
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var result = await authService.LoginAsync(new LoginRequest { Email = user.Email, Password = password });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.NotEmpty(result.Data.AccessToken);
    }

    [Fact]
    public async Task Deactivated_User_Login_Is_Rejected()
    {
        using var context = TestDbContextFactory.Create(nameof(Deactivated_User_Login_Is_Rejected));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var password = "SecurePassword123!";
        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Deactivated User",
            Email = "deactivated@test.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = UserRoles.Customer,
            IsActive = false // Deactivated
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var result = await authService.LoginAsync(new LoginRequest { Email = user.Email, Password = password });

        Assert.False(result.Success);
        Assert.Contains("deactivated", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Deactivated_User_Refresh_Token_Is_Rejected()
    {
        using var context = TestDbContextFactory.Create(nameof(Deactivated_User_Refresh_Token_Is_Rejected));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Deactivated User",
            Email = "deact_refresh@test.com",
            Role = UserRoles.Customer,
            IsActive = false // Inactive
        };

        var rawToken = "raw-refresh-token-xyz";
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

        var result = await authService.RefreshTokenAsync(rawToken);

        Assert.False(result.Success);
        Assert.Contains("deactivated", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Admin_Deactivating_User_Revokes_All_Active_Refresh_Tokens()
    {
        using var context = TestDbContextFactory.Create(nameof(Admin_Deactivating_User_Revokes_All_Active_Refresh_Tokens));
        var adminService = new AdminService(context);
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var adminId = Guid.NewGuid();
        var targetUser = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Target User",
            Email = "target@test.com",
            Role = UserRoles.Customer,
            IsActive = true
        };

        var token1Raw = "token-1-abc";
        var token2Raw = "token-2-def";

        var token1 = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = targetUser.Id,
            Token = AuthService.HashToken(token1Raw),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };
        var token2 = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = targetUser.Id,
            Token = AuthService.HashToken(token2Raw),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.Add(targetUser);
        context.RefreshTokens.AddRange(token1, token2);
        await context.SaveChangesAsync();

        // Admin deactivates targetUser
        var updateResult = await adminService.UpdateUserStatusAsync(adminId, targetUser.Id, new UpdateUserStatusRequest { IsActive = false });
        Assert.True(updateResult.Success);

        // Verify tokens are marked revoked in database
        var dbTokens = await context.RefreshTokens.Where(rt => rt.UserId == targetUser.Id).ToListAsync();
        Assert.All(dbTokens, t => Assert.NotNull(t.RevokedAtUtc));

        // Attempting to refresh with either token is rejected
        var refreshResult = await authService.RefreshTokenAsync(token1Raw);
        Assert.False(refreshResult.Success);
    }

    [Fact]
    public async Task Reactivated_User_Can_Authenticate_Normally()
    {
        using var context = TestDbContextFactory.Create(nameof(Reactivated_User_Can_Authenticate_Normally));
        var adminService = new AdminService(context);
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var adminId = Guid.NewGuid();
        var password = "ReactPass123!";
        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Reactivated User",
            Email = "react@test.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = UserRoles.Customer,
            IsActive = false // Initially deactivated
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        // Login fails initially
        var login1 = await authService.LoginAsync(new LoginRequest { Email = user.Email, Password = password });
        Assert.False(login1.Success);

        // Admin reactivates user
        await adminService.UpdateUserStatusAsync(adminId, user.Id, new UpdateUserStatusRequest { IsActive = true });

        // Login succeeds now
        var login2 = await authService.LoginAsync(new LoginRequest { Email = user.Email, Password = password });
        Assert.True(login2.Success);
        Assert.NotNull(login2.Data);
    }
}
