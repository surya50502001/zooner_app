using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class RefreshTokenConcurrencyTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DbContextOptions<AppDbContext> _options;
    private readonly IConfiguration _config;
    private readonly ITokenService _tokenService;

    public RefreshTokenConcurrencyTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"rt_concurrency_{Guid.NewGuid():N}.db");

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .Options;

        using var initContext = new AppDbContext(_options);
        initContext.Database.EnsureCreated();

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

    public void Dispose()
    {
        try
        {
            if (File.Exists(_dbPath))
            {
                File.Delete(_dbPath);
            }
        }
        catch
        {
            // Best effort cleanup
        }
    }

    private AppDbContext CreateContext() => new AppDbContext(_options);

    [Fact]
    public async Task Simultaneous_Refresh_Requests_With_Same_Token_Only_One_Succeeds()
    {
        var userId = Guid.NewGuid();
        var rawToken = "active-refresh-token-race-test";

        using (var setupContext = CreateContext())
        {
            var user = new User
            {
                Id = userId,
                FullName = "Concurrency Test User",
                Email = "concurrent@test.com",
                Role = UserRoles.Customer,
                IsActive = true
            };

            var refreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = AuthService.HashToken(rawToken),
                ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
                CreatedAtUtc = DateTime.UtcNow
            };

            setupContext.Users.Add(user);
            setupContext.RefreshTokens.Add(refreshToken);
            await setupContext.SaveChangesAsync();
        }

        // Run 2 simultaneous refresh operations with the exact same token
        var task1 = Task.Run(async () =>
        {
            using var ctx1 = CreateContext();
            var service1 = new AuthService(ctx1, _tokenService, NullLogger<AuthService>.Instance);
            return await service1.RefreshTokenAsync(rawToken, "10.0.0.1");
        });

        var task2 = Task.Run(async () =>
        {
            using var ctx2 = CreateContext();
            var service2 = new AuthService(ctx2, _tokenService, NullLogger<AuthService>.Instance);
            return await service2.RefreshTokenAsync(rawToken, "10.0.0.2");
        });

        var results = await Task.WhenAll(task1, task2);

        var successCount = results.Count(r => r.Success);
        var failureCount = results.Count(r => !r.Success);

        // Exactly one request must succeed, the concurrent second request must be rejected
        Assert.Equal(1, successCount);
        Assert.Equal(1, failureCount);

        using (var verifyContext = CreateContext())
        {
            var allTokens = await verifyContext.RefreshTokens.Where(rt => rt.UserId == userId).ToListAsync();
            
            // Exactly 2 tokens in total: 1 old revoked token, 1 new active token
            Assert.Equal(2, allTokens.Count);

            var oldToken = allTokens.FirstOrDefault(rt => rt.Token == AuthService.HashToken(rawToken));
            Assert.NotNull(oldToken);
            Assert.True(oldToken.IsRevoked);

            var activeTokens = allTokens.Where(rt => rt.RevokedAtUtc == null).ToList();
            Assert.Single(activeTokens);
        }
    }

    [Fact]
    public async Task Successful_Rotation_Followed_By_Reusing_Old_Token_Fails_Without_Nuking_Winner_Session()
    {
        var userId = Guid.NewGuid();
        var initialRawToken = "initial-concurrency-token";
        string newlyIssuedToken = string.Empty;

        using (var setupContext = CreateContext())
        {
            var user = new User
            {
                Id = userId,
                FullName = "Concurrency Test User",
                Email = "concurrency2@test.com",
                Role = UserRoles.Customer,
                IsActive = true
            };

            var refreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = AuthService.HashToken(initialRawToken),
                ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
                CreatedAtUtc = DateTime.UtcNow
            };

            setupContext.Users.Add(user);
            setupContext.RefreshTokens.Add(refreshToken);
            await setupContext.SaveChangesAsync();
        }

        // 1. First legitimate rotation succeeds
        using (var ctx1 = CreateContext())
        {
            var authService1 = new AuthService(ctx1, _tokenService, NullLogger<AuthService>.Instance);
            var rotateRes = await authService1.RefreshTokenAsync(initialRawToken, "127.0.0.1");
            Assert.True(rotateRes.Success);
            Assert.NotNull(rotateRes.Data);
            Assert.NotEmpty(rotateRes.Data.RefreshToken);
            newlyIssuedToken = rotateRes.Data.RefreshToken;
        }

        // 2. Attacker/Stale client attempts to use the initial rotated token again
        using (var ctx2 = CreateContext())
        {
            var authService2 = new AuthService(ctx2, _tokenService, NullLogger<AuthService>.Instance);
            var replayRes = await authService2.RefreshTokenAsync(initialRawToken, "192.168.1.50");
            Assert.False(replayRes.Success);
            Assert.Contains("already been used or rotated", replayRes.Message);
        }

        // 3. Verify the newly issued winner token is STILL active and NOT revoked
        using (var verifyCtx = CreateContext())
        {
            var activeTokens = await verifyCtx.RefreshTokens
                .Where(rt => rt.UserId == userId && rt.RevokedAtUtc == null)
                .ToListAsync();
            Assert.Single(activeTokens);
            Assert.Equal(AuthService.HashToken(newlyIssuedToken), activeTokens[0].Token);
        }
    }

    [Fact]
    public async Task Revoked_Token_Refresh_Attempt_Fails()
    {
        var userId = Guid.NewGuid();
        var revokedRawToken = "already-revoked-token";

        using (var setupContext = CreateContext())
        {
            var user = new User
            {
                Id = userId,
                FullName = "Revocation Test User",
                Email = "revoked@test.com",
                Role = UserRoles.Customer,
                IsActive = true
            };

            var refreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = AuthService.HashToken(revokedRawToken),
                ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
                CreatedAtUtc = DateTime.UtcNow.AddDays(-1),
                RevokedAtUtc = DateTime.UtcNow.AddHours(-2)
            };

            setupContext.Users.Add(user);
            setupContext.RefreshTokens.Add(refreshToken);
            await setupContext.SaveChangesAsync();
        }

        using var ctx = CreateContext();
        var authService = new AuthService(ctx, _tokenService, NullLogger<AuthService>.Instance);
        var res = await authService.RefreshTokenAsync(revokedRawToken);

        Assert.False(res.Success);
        Assert.Contains("Session terminated", res.Message);
    }
}

