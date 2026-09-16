using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class TestCustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:;Foreign Keys=False");

    public TestCustomWebApplicationFactory()
    {
        _connection.Open();
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys = OFF;";
        cmd.ExecuteNonQuery();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseSqlite(_connection);
            });

            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.EnsureCreated();
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        _connection.Dispose();
    }

    public async Task<string> CreateUserAndGenerateTokenAsync(Guid userId, string role, string email = "test@zooner.app", bool isActive = true)
    {
        using var scope = Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tokenService = scope.ServiceProvider.GetRequiredService<ITokenService>();

        var user = new User
        {
            Id = userId,
            FullName = $"Test {role}",
            Email = email,
            Role = role,
            IsActive = isActive,
            SecurityStamp = Guid.NewGuid().ToString()
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        return tokenService.GenerateAccessToken(user);
    }

    public async Task DeactivateUserAsync(Guid userId)
    {
        using var scope = Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await context.Users.FindAsync(userId);
        if (user != null)
        {
            user.IsActive = false;
            user.SecurityStamp = Guid.NewGuid().ToString();
            await context.SaveChangesAsync();
        }
    }

    public async Task<string> CreateRefreshTokenForUserAsync(Guid userId)
    {
        using var scope = Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tokenService = scope.ServiceProvider.GetRequiredService<ITokenService>();

        var rt = tokenService.GenerateRefreshToken(userId);
        var plain = rt.Token;
        rt.Token = AuthService.HashToken(plain);
        context.RefreshTokens.Add(rt);
        await context.SaveChangesAsync();

        return plain;
    }
}

public class RealPipelineAuthorizationTests : IClassFixture<TestCustomWebApplicationFactory>
{
    private readonly TestCustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public RealPipelineAuthorizationTests(TestCustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Anonymous_Access_To_Admin_Endpoints_Returns_401_Unauthorized()
    {
        var response = await _client.GetAsync("/api/admin/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_Access_To_Admin_Endpoints_Returns_403_Forbidden()
    {
        var customerId = Guid.NewGuid();
        var token = await _factory.CreateUserAndGenerateTokenAsync(customerId, UserRoles.Customer, $"cust_{customerId}@test.com");

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/reports");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Vendor_Access_To_Admin_Endpoints_Returns_403_Forbidden()
    {
        var vendorId = Guid.NewGuid();
        var token = await _factory.CreateUserAndGenerateTokenAsync(vendorId, UserRoles.Vendor, $"vendor_{vendorId}@test.com");

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/reports");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_Access_To_Admin_Endpoints_Returns_200_OK()
    {
        var adminId = Guid.NewGuid();
        var token = await _factory.CreateUserAndGenerateTokenAsync(adminId, UserRoles.Admin, $"admin_{adminId}@test.com");

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/admin/reports");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Customer_Access_To_Create_Global_Product_Returns_403_Forbidden()
    {
        var customerId = Guid.NewGuid();
        var token = await _factory.CreateUserAndGenerateTokenAsync(customerId, UserRoles.Customer, $"cust2_{customerId}@test.com");

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/products");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Content = new StringContent("{}", Encoding.UTF8, "application/json");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_Access_To_Create_Global_Product_Returns_401_Unauthorized()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/products");
        request.Content = new StringContent("{}", Encoding.UTF8, "application/json");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Issued_JWT_Fails_Immediately_With_401_After_User_Deactivation()
    {
        var userId = Guid.NewGuid();
        var token = await _factory.CreateUserAndGenerateTokenAsync(userId, UserRoles.Customer, $"jwt_deact_{userId}@test.com");

        // 1. When active, JWT authorizes request successfully
        using (var initialReq = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me"))
        {
            initialReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var initialRes = await _client.SendAsync(initialReq);
            Assert.Equal(HttpStatusCode.OK, initialRes.StatusCode);
        }

        // 2. Deactivate the user
        await _factory.DeactivateUserAsync(userId);

        // 3. Same token now fails authentication immediately (401)
        using (var postDeactReq = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me"))
        {
            postDeactReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var postDeactRes = await _client.SendAsync(postDeactReq);
            Assert.Equal(HttpStatusCode.Unauthorized, postDeactRes.StatusCode);
        }
    }

    [Fact]
    public async Task Cookie_Refresh_With_Trusted_Browser_Origin_Succeeds()
    {
        var userId = Guid.NewGuid();
        await _factory.CreateUserAndGenerateTokenAsync(userId, UserRoles.Customer, $"cookie_trusted_{userId}@test.com");
        var plainRefreshToken = await _factory.CreateRefreshTokenForUserAsync(userId);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh-token");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Cookie", $"refreshToken={plainRefreshToken}");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Cookie_Refresh_With_Untrusted_Browser_Origin_Returns_403_Forbidden()
    {
        var userId = Guid.NewGuid();
        await _factory.CreateUserAndGenerateTokenAsync(userId, UserRoles.Customer, $"cookie_untrusted_{userId}@test.com");
        var plainRefreshToken = await _factory.CreateRefreshTokenForUserAsync(userId);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh-token");
        request.Headers.Add("Origin", "https://malicious-attacker.com");
        request.Headers.Add("Cookie", $"refreshToken={plainRefreshToken}");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Cookie_Refresh_With_Missing_Origin_Returns_403_Forbidden()
    {
        var userId = Guid.NewGuid();
        await _factory.CreateUserAndGenerateTokenAsync(userId, UserRoles.Customer, $"cookie_no_origin_{userId}@test.com");
        var plainRefreshToken = await _factory.CreateRefreshTokenForUserAsync(userId);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh-token");
        // No Origin and No Referer header supplied
        request.Headers.Add("Cookie", $"refreshToken={plainRefreshToken}");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Native_Client_Body_Refresh_Without_Origin_Succeeds()
    {
        var userId = Guid.NewGuid();
        await _factory.CreateUserAndGenerateTokenAsync(userId, UserRoles.Customer, $"native_refresh_{userId}@test.com");
        var plainRefreshToken = await _factory.CreateRefreshTokenForUserAsync(userId);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh-token");
        request.Content = new StringContent(
            System.Text.Json.JsonSerializer.Serialize(new { refreshToken = plainRefreshToken }),
            Encoding.UTF8,
            "application/json");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Cookie_Logout_With_Untrusted_Origin_Returns_403_Forbidden()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
        request.Headers.Add("Origin", "https://malicious-site.com");
        request.Headers.Add("Cookie", "refreshToken=some-token");

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
