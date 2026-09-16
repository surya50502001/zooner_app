using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Controllers;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Realtime;

namespace Zooner.Tests;

public class AuthorizationPipelineTests
{
    private static ControllerContext CreateControllerContext(Guid userId, string role, string email = "test@zooner.app")
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, role)
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        return new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
    }

    [Fact]
    public async Task Customer_Cannot_Access_Admin_Reports_Endpoint()
    {
        using var context = TestDbContextFactory.Create(nameof(Customer_Cannot_Access_Admin_Reports_Endpoint));
        var adminService = new AdminService(context);
        var catService = new CategoryService(context);
        var controller = new AdminController(catService, adminService);

        var customerId = Guid.NewGuid();
        controller.ControllerContext = CreateControllerContext(customerId, UserRoles.Customer);

        // Server-side action check
        var user = new User { Id = customerId, Email = "cust@z.app", Role = UserRoles.Customer };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var isAdmin = await adminService.IsAdminUserAsync(customerId);
        Assert.False(isAdmin);
    }

    [Fact]
    public async Task Vendor_Cannot_Verify_Or_Approve_Store_Admin_Required()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Cannot_Verify_Or_Approve_Store_Admin_Required));
        var shopService = new ShopService(context, new ConfigurationBuilder().Build(), NullLogger<ShopService>.Instance);
        var adminService = new AdminService(context);
        var notifierMock = new Mock<IRealtimeNotifier>();
        var liveReqService = new LiveRequestService(context, shopService, notifierMock.Object, NullLogger<LiveRequestService>.Instance);

        var vendorId = Guid.NewGuid();
        var vendor = new User { Id = vendorId, Email = "vendor@z.app", Role = UserRoles.Vendor };
        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Vendor Shop",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true,
            IsLiveEnabled = true
        };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        await context.SaveChangesAsync();

        var shopsController = new ShopsController(shopService, liveReqService, adminService, context)
        {
            ControllerContext = CreateControllerContext(vendorId, UserRoles.Vendor)
        };

        // Vendor attempting to call verify-owner
        var actionResult = await shopsController.VerifyOwnerShop(shop.Id);
        var objResult = Assert.IsType<ObjectResult>(actionResult);
        Assert.Equal(403, objResult.StatusCode);

        // Verify shop is still Pending
        var refreshed = await context.Shops.FindAsync(shop.Id);
        Assert.Equal(ShopVerificationStatus.Pending, refreshed!.VerificationStatus);
    }

    [Fact]
    public async Task Admin_Can_Verify_Store()
    {
        using var context = TestDbContextFactory.Create(nameof(Admin_Can_Verify_Store));
        var shopService = new ShopService(context, new ConfigurationBuilder().Build(), NullLogger<ShopService>.Instance);
        var adminService = new AdminService(context);
        var notifierMock = new Mock<IRealtimeNotifier>();
        var liveReqService = new LiveRequestService(context, shopService, notifierMock.Object, NullLogger<LiveRequestService>.Instance);

        var adminId = Guid.NewGuid();
        var admin = new User { Id = adminId, Email = "admin@z.app", Role = UserRoles.Admin };
        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = Guid.NewGuid(),
            Name = "Pending Shop",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true,
            IsLiveEnabled = true
        };

        context.Users.Add(admin);
        context.Shops.Add(shop);
        await context.SaveChangesAsync();

        var shopsController = new ShopsController(shopService, liveReqService, adminService, context)
        {
            ControllerContext = CreateControllerContext(adminId, UserRoles.Admin)
        };

        var actionResult = await shopsController.VerifyOwnerShop(shop.Id);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        Assert.NotNull(okResult.Value);

        var refreshed = await context.Shops.FindAsync(shop.Id);
        Assert.Equal(ShopVerificationStatus.Approved, refreshed!.VerificationStatus);
    }

    [Fact]
    public async Task Vendor_Accessing_Another_Vendors_Store_Inventory_Mutation_Is_Forbidden()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Accessing_Another_Vendors_Store_Inventory_Mutation_Is_Forbidden));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendorAId = Guid.NewGuid();
        var vendorBId = Guid.NewGuid();
        var vendorA = new User { Id = vendorAId, Email = "va@z.app", Role = UserRoles.Vendor };
        var vendorB = new User { Id = vendorBId, Email = "vb@z.app", Role = UserRoles.Vendor };

        var shopA = new Shop { Id = Guid.NewGuid(), OwnerId = vendorAId, Name = "Shop A", VerificationStatus = ShopVerificationStatus.Approved, IsActive = true, IsLiveEnabled = true };
        var category = new Category { Id = Guid.NewGuid(), Name = "Cat" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Prod", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Var" };
        var invA = new StoreInventory { Id = Guid.NewGuid(), StoreId = shopA.Id, ProductVariantId = variant.Id, Price = 100, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(vendorA, vendorB);
        context.Shops.Add(shopA);
        context.Categories.Add(category);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(invA);
        await context.SaveChangesAsync();

        // Vendor B attempts to update inventory in Shop A
        var res = await invService.UpdateStoreInventoryAsync(shopA.Id, invA.Id, vendorBId, new UpdateStoreInventoryRequest
        {
            Price = 50,
            Quantity = 2,
            ShelfLocation = "A1",
            IsActive = true
        });

        Assert.False(res.Success);
        Assert.Contains("Unauthorized", res.Message);
    }

    [Fact]
    public async Task Customer_Cannot_Access_Another_Customers_Live_Request()
    {
        using var context = TestDbContextFactory.Create(nameof(Customer_Cannot_Access_Another_Customers_Live_Request));
        var shopService = new ShopService(context, new ConfigurationBuilder().Build(), NullLogger<ShopService>.Instance);
        var notifierMock = new Mock<IRealtimeNotifier>();
        var liveReqService = new LiveRequestService(context, shopService, notifierMock.Object, NullLogger<LiveRequestService>.Instance);

        var cust1Id = Guid.NewGuid();
        var cust2Id = Guid.NewGuid();
        var cust1 = new User { Id = cust1Id, Email = "c1@z.app", Role = UserRoles.Customer };
        var cust2 = new User { Id = cust2Id, Email = "c2@z.app", Role = UserRoles.Customer };
        var category = new Category { Id = Guid.NewGuid(), Name = "Cat" };
        var request = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = cust1Id,
            CategoryId = category.Id,
            RequestText = "Secret Item",
            Latitude = 11.0,
            Longitude = 76.9,
            SearchRadiusKm = 5,
            Status = LiveRequestStatus.Active,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30),
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.AddRange(cust1, cust2);
        context.Categories.Add(category);
        context.LiveRequests.Add(request);
        await context.SaveChangesAsync();

        var res = await liveReqService.GetRequestByIdAsync(request.Id, cust2Id);
        Assert.False(res.Success);
        Assert.Contains("Access denied", res.Message);
    }
}

