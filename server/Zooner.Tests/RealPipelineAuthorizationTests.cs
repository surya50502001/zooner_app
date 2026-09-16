using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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
    private readonly string _dbName = Guid.NewGuid().ToString();

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
                options.UseInMemoryDatabase(_dbName);
            });
        });
    }

    public async Task<string> CreateUserAndGenerateTokenAsync(Guid userId, string role, string email = "test@zooner.app")
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
            IsActive = true
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        return tokenService.GenerateAccessToken(user);
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
}
