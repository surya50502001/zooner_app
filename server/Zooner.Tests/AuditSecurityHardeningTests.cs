using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Xunit;
using Zooner.Api.Controllers;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class AuditSecurityHardeningTests : IClassFixture<TestCustomWebApplicationFactory>
{
    private readonly TestCustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public AuditSecurityHardeningTests(TestCustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HoldValidation_RejectsRawGuidHoldId_WhenSuppliedAsQrToken()
    {
        using var context = TestDbContextFactory.Create(nameof(HoldValidation_RejectsRawGuidHoldId_WhenSuppliedAsQrToken));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "merchant@z.app", Role = UserRoles.Vendor };
        var customer = new User { Id = Guid.NewGuid(), Email = "shopper@z.app", Role = UserRoles.Customer };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Security Store", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var category = new Category { Id = Guid.NewGuid(), Name = "Electronics" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Smartwatch", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Black" };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 999, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(vendor, customer);
        context.Shops.Add(shop);
        context.Categories.Add(category);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        var holdRes = await invService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 1);
        Assert.True(holdRes.Success);
        var holdId = holdRes.Data!.HoldId;
        var validQrToken = holdRes.Data.QrToken;

        // Valid QR token succeeds
        var validResult = await invService.ValidateHoldQrAsync(shop.Id, validQrToken, vendor.Id);
        Assert.True(validResult.Success);
        Assert.True(validResult.Data!.IsValid);

        // Raw database hold Guid ID must be rejected as an invalid token
        var rawGuidResult = await invService.ValidateHoldQrAsync(shop.Id, holdId.ToString(), vendor.Id);
        Assert.True(rawGuidResult.Success);
        Assert.False(rawGuidResult.Data!.IsValid);
        Assert.Contains("Invalid QR pass code", rawGuidResult.Data.Message);
    }

    [Fact]
    public async Task HoldCode_And_QrToken_GeneratedWithHighEntropy()
    {
        using var context = TestDbContextFactory.Create(nameof(HoldCode_And_QrToken_GeneratedWithHighEntropy));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "entropy_v@z.app", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Entropy Store", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var category = new Category { Id = Guid.NewGuid(), Name = "Gadgets" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Entropy Device", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "V1" };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 500, AvailableQuantity = 500, IsActive = true };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        context.Categories.Add(category);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        var holdCodes = new HashSet<string>();
        var qrTokens = new HashSet<string>();

        // Generate 30 holds and assert entropy and format
        for (int i = 0; i < 30; i++)
        {
            var customer = new User { Id = Guid.NewGuid(), Email = $"cust_{i}@z.app", Role = UserRoles.Customer };
            context.Users.Add(customer);
            await context.SaveChangesAsync();

            var holdRes = await invService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 1);
            Assert.True(holdRes.Success);
            var hold = holdRes.Data!;

            Assert.StartsWith("H-", hold.HoldCode);
            // Prefix "H-" + 6 alphanumeric characters = 8 characters total
            Assert.Equal(8, hold.HoldCode.Length);

            Assert.StartsWith("zhold:", hold.QrToken);
            // Prefix "zhold:" (6) + GUID (36) + ":" (1) + HoldCode (8) + ":" (1) + 32 hex chars = 84 characters total
            Assert.Equal(84, hold.QrToken.Length);

            Assert.True(holdCodes.Add(hold.HoldCode), $"Duplicate hold code generated: {hold.HoldCode}");
            Assert.True(qrTokens.Add(hold.QrToken), $"Duplicate QR token generated: {hold.QrToken}");
        }
    }

    [Fact]
    public async Task Inventory_Pagination_LimitsAndOffsetsResults()
    {
        using var context = TestDbContextFactory.Create(nameof(Inventory_Pagination_LimitsAndOffsetsResults));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "paging_v@z.app", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Paging Store", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var category = new Category { Id = Guid.NewGuid(), Name = "Paging Category" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Paging Product", CategoryId = category.Id };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        context.Categories.Add(category);
        context.Products.Add(product);

        for (int i = 0; i < 15; i++)
        {
            var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = $"Variant {i:D2}" };
            var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 100 + i, Quantity = 10, AvailableQuantity = 10, IsActive = true };
            context.ProductVariants.Add(variant);
            context.StoreInventories.Add(inv);
        }
        await context.SaveChangesAsync();

        // Page 1 with pageSize 5 -> 5 items
        var page1 = await invService.GetStoreInventoryAsync(shop.Id, null, null, null, false, page: 1, pageSize: 5);
        Assert.True(page1.Success);
        Assert.Equal(5, page1.Data!.Count);

        // Page 2 with pageSize 5 -> 5 items
        var page2 = await invService.GetStoreInventoryAsync(shop.Id, null, null, null, false, page: 2, pageSize: 5);
        Assert.True(page2.Success);
        Assert.Equal(5, page2.Data!.Count);

        // Page 4 with pageSize 5 -> 0 items
        var page4 = await invService.GetStoreInventoryAsync(shop.Id, null, null, null, false, page: 4, pageSize: 5);
        Assert.True(page4.Success);
        Assert.Empty(page4.Data!);

        // Assert items on page 1 and page 2 are distinct
        var page1Ids = page1.Data.Select(x => x.InventoryId).ToHashSet();
        var page2Ids = page2.Data.Select(x => x.InventoryId).ToHashSet();
        Assert.Empty(page1Ids.Intersect(page2Ids));
    }

    [Fact]
    public async Task JWT_TokenWithoutSecurityStampClaim_IsRejectedWith401()
    {
        var userId = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new User
            {
                Id = userId,
                FullName = "Stamp Test User",
                Email = $"stamp_{userId}@test.com",
                Role = UserRoles.Customer,
                IsActive = true,
                SecurityStamp = Guid.NewGuid().ToString()
            });
            await db.SaveChangesAsync();
        }

        // Mint token WITHOUT "security_stamp" claim
        string tokenWithoutStamp;
        using (var scope = _factory.Services.CreateScope())
        {
            var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            var secretKey = config["Jwt:Key"] ?? "DevelopmentSecretKeyForJwtAuthenticationMustBe32Bytes!";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new(ClaimTypes.NameIdentifier, userId.ToString()),
                new(ClaimTypes.Email, $"stamp_{userId}@test.com"),
                new(ClaimTypes.Role, UserRoles.Customer)
                // Omit "security_stamp" claim entirely
            };

            var descriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(30),
                Issuer = config["Jwt:Issuer"] ?? "ZoonerApi",
                Audience = config["Jwt:Audience"] ?? "ZoonerClient",
                SigningCredentials = creds
            };

            var handler = new JwtSecurityTokenHandler();
            var token = handler.CreateToken(descriptor);
            tokenWithoutStamp = handler.WriteToken(token);
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenWithoutStamp);

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task JWT_TokenWithMismatchedSecurityStamp_IsRejectedWith401()
    {
        var userId = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new User
            {
                Id = userId,
                FullName = "Mismatched Stamp User",
                Email = $"mismatch_{userId}@test.com",
                Role = UserRoles.Customer,
                IsActive = true,
                SecurityStamp = "valid-stamp-in-database"
            });
            await db.SaveChangesAsync();
        }

        // Mint token with wrong "security_stamp" claim
        string tokenWithBadStamp;
        using (var scope = _factory.Services.CreateScope())
        {
            var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            var secretKey = config["Jwt:Key"] ?? "DevelopmentSecretKeyForJwtAuthenticationMustBe32Bytes!";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new(ClaimTypes.NameIdentifier, userId.ToString()),
                new(ClaimTypes.Email, $"mismatch_{userId}@test.com"),
                new(ClaimTypes.Role, UserRoles.Customer),
                new("security_stamp", "outdated-or-forged-stamp")
            };

            var descriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(30),
                Issuer = config["Jwt:Issuer"] ?? "ZoonerApi",
                Audience = config["Jwt:Audience"] ?? "ZoonerClient",
                SigningCredentials = creds
            };

            var handler = new JwtSecurityTokenHandler();
            var token = handler.CreateToken(descriptor);
            tokenWithBadStamp = handler.WriteToken(token);
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenWithBadStamp);

        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private class ThrowingDbContext : AppDbContext
    {
        public ThrowingDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            throw new DbUpdateException("Database connection terminated abruptly", new System.IO.IOException("Socket closed by remote host"));
        }
    }

    [Fact]
    public async Task Waitlist_NonUniqueConstraintError_Returns500()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        using var context = new ThrowingDbContext(options);
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "servererror@test.com",
            City = "Chennai",
            UserType = "Shopper"
        };

        var result = await controller.JoinWaitlist(request);
        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status500InternalServerError, objResult.StatusCode);

        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(objResult.Value);
        Assert.False(response.Success);
        Assert.Contains("unexpected database error", response.Message, StringComparison.OrdinalIgnoreCase);
    }
}
