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
using Zooner.Api.Services.Realtime;

namespace Zooner.Tests;

public class SecurityHardeningTests
{
    private readonly IConfiguration _emptyConfig = new ConfigurationBuilder().Build();

    [Fact]
    public async Task Merchant_Cannot_Self_Approve_Store_And_Requires_Admin()
    {
        using var context = TestDbContextFactory.Create(nameof(Merchant_Cannot_Self_Approve_Store_And_Requires_Admin));
        var shopService = new ShopService(context, _emptyConfig, NullLogger<ShopService>.Instance);
        var adminService = new AdminService(context, _emptyConfig);

        var merchant = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Merchant John",
            Email = "merchant@test.com",
            PasswordHash = "hashed",
            Role = UserRoles.Customer
        };
        var admin = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Admin User",
            Email = "admin@zooner.app",
            PasswordHash = "hashed",
            Role = UserRoles.Admin
        };
        context.Users.AddRange(merchant, admin);
        await context.SaveChangesAsync();

        var createReq = new CreateShopRequest
        {
            Name = "John's Shoes",
            Description = "Footwear Store",
            Phone = "1234567890",
            Address = "123 Main St",
            Latitude = 11.01,
            Longitude = 76.95,
            CategoryIds = new List<Guid>()
        };

        var result = await shopService.CreateShopAsync(merchant.Id, createReq);
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        // Merchant creating a store must always be Pending
        Assert.Equal(ShopVerificationStatus.Pending.ToString(), result.Data.VerificationStatus);

        // Verification must be performed by Admin
        var verifyRes = await adminService.VerifyShopAsync(admin.Id, result.Data.Id, new VerifyShopRequest
        {
            Status = ShopVerificationStatus.Approved
        });

        Assert.True(verifyRes.Success);
        var updatedShop = await context.Shops.FindAsync(result.Data.Id);
        Assert.NotNull(updatedShop);
        Assert.Equal(ShopVerificationStatus.Approved, updatedShop.VerificationStatus);
    }

    [Fact]
    public async Task Customer_Request_Access_Control_Enforces_Privacy()
    {
        using var context = TestDbContextFactory.Create(nameof(Customer_Request_Access_Control_Enforces_Privacy));
        var shopService = new ShopService(context, _emptyConfig, NullLogger<ShopService>.Instance);
        var notifierMock = new Mock<IRealtimeNotifier>();
        var liveRequestService = new LiveRequestService(context, shopService, notifierMock.Object, NullLogger<LiveRequestService>.Instance);

        var customerA = new User { Id = Guid.NewGuid(), FullName = "Customer Alice", Email = "alice@test.com", Role = UserRoles.Customer };
        var customerB = new User { Id = Guid.NewGuid(), FullName = "Customer Bob", Email = "bob@test.com", Role = UserRoles.Customer };
        var vendor1 = new User { Id = Guid.NewGuid(), FullName = "Vendor One", Email = "vendor1@test.com", Role = UserRoles.Vendor };
        var vendor2 = new User { Id = Guid.NewGuid(), FullName = "Vendor Two", Email = "vendor2@test.com", Role = UserRoles.Vendor };
        var unrelatedVendor = new User { Id = Guid.NewGuid(), FullName = "Vendor Three", Email = "vendor3@test.com", Role = UserRoles.Vendor };
        var admin = new User { Id = Guid.NewGuid(), FullName = "Platform Admin", Email = "admin@zooner.app", Role = UserRoles.Admin };

        var shop1 = new Shop { Id = Guid.NewGuid(), OwnerId = vendor1.Id, Name = "Shop 1", Phone = "1", Address = "A", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var shop2 = new Shop { Id = Guid.NewGuid(), OwnerId = vendor2.Id, Name = "Shop 2", Phone = "2", Address = "B", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var shop3 = new Shop { Id = Guid.NewGuid(), OwnerId = unrelatedVendor.Id, Name = "Shop 3", Phone = "3", Address = "C", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };

        var category = new Category { Id = Guid.NewGuid(), Name = "Electronics" };

        var request = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerA.Id,
            CategoryId = category.Id,
            RequestText = "Looking for Sony headphones",
            Latitude = 11.0,
            Longitude = 76.9,
            SearchRadiusKm = 5,
            Status = LiveRequestStatus.Active,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30),
            CreatedAtUtc = DateTime.UtcNow
        };

        var response1 = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = request.Id,
            ShopId = shop1.Id,
            Status = ShopResponseStatus.Available,
            CreatedAtUtc = DateTime.UtcNow
        };

        var response2 = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = request.Id,
            ShopId = shop2.Id,
            Status = ShopResponseStatus.Available,
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.AddRange(customerA, customerB, vendor1, vendor2, unrelatedVendor, admin);
        context.Shops.AddRange(shop1, shop2, shop3);
        context.Categories.Add(category);
        context.LiveRequests.Add(request);
        context.ShopResponses.AddRange(response1, response2);
        await context.SaveChangesAsync();

        // 1. Customer A (owner) can view request and all responses
        var resAlice = await liveRequestService.GetRequestByIdAsync(request.Id, customerA.Id);
        Assert.True(resAlice.Success);
        Assert.Equal(2, resAlice.Data!.Responses.Count);

        // 2. Platform Admin can view request and all responses
        var resAdmin = await liveRequestService.GetRequestByIdAsync(request.Id, admin.Id);
        Assert.True(resAdmin.Success);
        Assert.Equal(2, resAdmin.Data!.Responses.Count);

        // 3. Participating Vendor 1 can view request, but only sees their own response
        var resVendor1 = await liveRequestService.GetRequestByIdAsync(request.Id, vendor1.Id);
        Assert.True(resVendor1.Success);
        Assert.Single(resVendor1.Data!.Responses);
        Assert.Equal(shop1.Id, resVendor1.Data.Responses[0].ShopId);

        // 4. Customer B (unrelated) is blocked (Forbidden)
        var resBob = await liveRequestService.GetRequestByIdAsync(request.Id, customerB.Id);
        Assert.False(resBob.Success);
        Assert.Contains("Access denied", resBob.Message);

        // 5. Unrelated vendor is blocked (Forbidden)
        var resVendor3 = await liveRequestService.GetRequestByIdAsync(request.Id, unrelatedVendor.Id);
        Assert.False(resVendor3.Success);
        Assert.Contains("Access denied", resVendor3.Message);
    }

    [Fact]
    public async Task InventoryHold_Rejected_If_Store_Not_Approved_Active_Or_LiveEnabled()
    {
        using var context = TestDbContextFactory.Create(nameof(InventoryHold_Rejected_If_Store_Not_Approved_Active_Or_LiveEnabled));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "v@z.app", Role = "Vendor" };
        var customer = new User { Id = Guid.NewGuid(), Email = "c@z.app", Role = "Customer" };
        var category = new Category { Id = Guid.NewGuid(), Name = "Sports" };
        var brand = new Brand { Id = Guid.NewGuid(), Name = "Nike" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Shoe", CategoryId = category.Id, BrandId = brand.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Red 9" };

        // Store 1: Pending verification
        var pendingStore = new Shop { Id = Guid.NewGuid(), Name = "Pending Store", OwnerId = vendor.Id, IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Pending };
        var inv1 = new StoreInventory { Id = Guid.NewGuid(), StoreId = pendingStore.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        // Store 2: Not live enabled
        var disabledStore = new Shop { Id = Guid.NewGuid(), Name = "Disabled Store", OwnerId = vendor.Id, IsActive = true, IsLiveEnabled = false, VerificationStatus = ShopVerificationStatus.Approved };
        var inv2 = new StoreInventory { Id = Guid.NewGuid(), StoreId = disabledStore.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        // Store 3: Inactive
        var inactiveStore = new Shop { Id = Guid.NewGuid(), Name = "Inactive Store", OwnerId = vendor.Id, IsActive = false, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var inv3 = new StoreInventory { Id = Guid.NewGuid(), StoreId = inactiveStore.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        // Store 4: Approved, Active, LiveEnabled
        var validStore = new Shop { Id = Guid.NewGuid(), Name = "Valid Store", OwnerId = vendor.Id, IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var inv4 = new StoreInventory { Id = Guid.NewGuid(), StoreId = validStore.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(vendor, customer);
        context.Categories.Add(category);
        context.Brands.Add(brand);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.Shops.AddRange(pendingStore, disabledStore, inactiveStore, validStore);
        context.StoreInventories.AddRange(inv1, inv2, inv3, inv4);
        await context.SaveChangesAsync();

        // 1. Pending store reservation fails
        var res1 = await invService.ReserveInventoryHoldAsync(pendingStore.Id, inv1.Id, customer.Id, 1);
        Assert.False(res1.Success);
        Assert.Contains("Store is not active, verified, or live-enabled", res1.Message);

        // 2. Not live enabled store reservation fails
        var res2 = await invService.ReserveInventoryHoldAsync(disabledStore.Id, inv2.Id, customer.Id, 1);
        Assert.False(res2.Success);
        Assert.Contains("Store is not active, verified, or live-enabled", res2.Message);

        // 3. Inactive store reservation fails
        var res3 = await invService.ReserveInventoryHoldAsync(inactiveStore.Id, inv3.Id, customer.Id, 1);
        Assert.False(res3.Success);
        Assert.Contains("Store is not active, verified, or live-enabled", res3.Message);

        // 4. Valid store reservation succeeds
        var res4 = await invService.ReserveInventoryHoldAsync(validStore.Id, inv4.Id, customer.Id, 1);
        Assert.True(res4.Success);
        Assert.NotNull(res4.Data);
        Assert.Equal(4, (await context.StoreInventories.FindAsync(inv4.Id))!.AvailableQuantity);
    }

    [Fact]
    public async Task Hold_QR_Code_Validation_And_Double_Collection_Prevention()
    {
        using var context = TestDbContextFactory.Create(nameof(Hold_QR_Code_Validation_And_Double_Collection_Prevention));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "vendor@z.app", Role = "Vendor" };
        var customer = new User { Id = Guid.NewGuid(), Email = "customer@z.app", Role = "Customer" };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Test Shop", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var category = new Category { Id = Guid.NewGuid(), Name = "Tech" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Gadget", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Standard" };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 500, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(vendor, customer);
        context.Shops.Add(shop);
        context.Categories.Add(category);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        var holdRes = await invService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 1);
        Assert.True(holdRes.Success);
        var qrToken = holdRes.Data!.QrToken;
        var holdId = holdRes.Data.HoldId;

        // 1. Valid QR scan by merchant
        var valRes = await invService.ValidateHoldQrAsync(shop.Id, qrToken, vendor.Id);
        Assert.True(valRes.Success);
        Assert.True(valRes.Data!.IsValid);

        // 2. Collect hold pass
        var collectRes = await invService.CollectHoldAsync(shop.Id, holdId, vendor.Id);
        Assert.True(collectRes.Success);
        Assert.Equal(InventoryHoldStatus.Fulfilled.ToString(), collectRes.Data!.Status);

        // 3. Attempting double collection on fulfilled hold must be rejected
        var doubleCollect = await invService.CollectHoldAsync(shop.Id, holdId, vendor.Id);
        Assert.False(doubleCollect.Success);
        Assert.Contains("already been collected", doubleCollect.Message);
    }

    [Fact]
    public async Task Production_Bootstrap_Fails_Fast_When_Admin_Password_Insecure()
    {
        using var context = TestDbContextFactory.Create(nameof(Production_Bootstrap_Fails_Fast_When_Admin_Password_Insecure));
        var insecConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "ADMIN_EMAIL", "admin@zooner.app" },
                { "ADMIN_PASSWORD", "Admin@123" }
            })
            .Build();

        // In production (isDevelopment: false) with default password -> must fail fast
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            DbSeeder.SeedAsync(context, NullLogger.Instance, insecConfig, isDevelopment: false));

        // In production (isDevelopment: false) with strong password -> succeeds
        var secureConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "ADMIN_EMAIL", "admin@zooner.app" },
                { "ADMIN_PASSWORD", "SuperSecure#2026!ComplexPassword" }
            })
            .Build();

        await DbSeeder.SeedAsync(context, NullLogger.Instance, secureConfig, isDevelopment: false);
        Assert.True(await context.Users.AnyAsync(u => u.Email == "admin@zooner.app"));
    }
}
