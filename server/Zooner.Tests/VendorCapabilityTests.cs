using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Realtime;

namespace Zooner.Tests;

public class VendorCapabilityTests
{
    [Fact]
    public async Task Vendor_Without_Approved_Shop_Cannot_Add_Inventory()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Without_Approved_Shop_Cannot_Add_Inventory));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendorId = Guid.NewGuid();
        var vendor = new User
        {
            Id = vendorId,
            FullName = "Pending Vendor",
            Email = "pending_vendor@test.com",
            Role = UserRoles.Vendor,
            IsActive = true
        };

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Pending Verification Shop",
            Phone = "1234567890",
            Address = "123 Main St",
            VerificationStatus = ShopVerificationStatus.Pending, // Not approved
            IsActive = true
        };

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Name = "Test Item",
            Description = "Desc",
            CategoryId = Guid.NewGuid()
        };

        var variant = new ProductVariant
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            VariantName = "Default",
            IsActive = true
        };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        await context.SaveChangesAsync();

        var result = await inventoryService.AddStoreInventoryAsync(shop.Id, vendorId, new AddStoreInventoryRequest
        {
            ProductVariantId = variant.Id,
            Price = 100,
            Quantity = 10
        });

        Assert.False(result.Success);
        Assert.Contains("not active or approved", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Vendor_With_Approved_Shop_Can_Add_Inventory()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_With_Approved_Shop_Can_Add_Inventory));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendorId = Guid.NewGuid();
        var vendor = new User
        {
            Id = vendorId,
            FullName = "Approved Vendor",
            Email = "approved_vendor@test.com",
            Role = UserRoles.Vendor,
            IsActive = true
        };

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Approved Shop",
            Phone = "1234567890",
            Address = "123 Main St",
            VerificationStatus = ShopVerificationStatus.Approved, // Approved
            IsActive = true
        };

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Name = "Test Item",
            Description = "Desc",
            CategoryId = Guid.NewGuid()
        };

        var variant = new ProductVariant
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            VariantName = "Default",
            IsActive = true
        };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        await context.SaveChangesAsync();

        var result = await inventoryService.AddStoreInventoryAsync(shop.Id, vendorId, new AddStoreInventoryRequest
        {
            ProductVariantId = variant.Id,
            Price = 100,
            Quantity = 10
        });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(100, result.Data.Price);
    }

    [Fact]
    public async Task Vendor_Without_Approved_Shop_Cannot_Enable_Live_Mode()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Without_Approved_Shop_Cannot_Enable_Live_Mode));
        var shopService = new ShopService(context, NullLogger<ShopService>.Instance);

        var vendorId = Guid.NewGuid();
        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Unapproved Shop",
            Phone = "1234567890",
            Address = "123 Main St",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true,
            IsLiveEnabled = false
        };

        context.Shops.Add(shop);
        await context.SaveChangesAsync();

        var result = await shopService.ToggleLiveStatusAsync(vendorId, shop.Id, isLiveEnabled: true);

        Assert.False(result.Success);
        Assert.Contains("not active or verified", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Vendor_Without_Approved_Shop_Cannot_View_Incoming_Live_Requests()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Without_Approved_Shop_Cannot_View_Incoming_Live_Requests));
        var liveRequestService = new LiveRequestService(
            context,
            new ShopService(context, NullLogger<ShopService>.Instance),
            Mock.Of<IRealtimeNotifier>(),
            NullLogger<LiveRequestService>.Instance);

        var vendorId = Guid.NewGuid();
        var categoryId = Guid.NewGuid();

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Pending Shop",
            Phone = "1234567890",
            Address = "123 Main St",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true
        };

        shop.ShopCategories.Add(new ShopCategory { ShopId = shop.Id, CategoryId = categoryId });

        context.Shops.Add(shop);
        await context.SaveChangesAsync();

        var result = await liveRequestService.GetIncomingRequestsForShopAsync(vendorId, shop.Id);

        Assert.False(result.Success);
        Assert.Contains("not active or verified", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Customer_Cannot_Start_Chat_With_Unapproved_Or_Inactive_Shop()
    {
        using var context = TestDbContextFactory.Create(nameof(Customer_Cannot_Start_Chat_With_Unapproved_Or_Inactive_Shop));
        var chatService = new ChatService(context, Mock.Of<IRealtimeNotifier>(), NullLogger<ChatService>.Instance);

        var customerId = Guid.NewGuid();
        var vendorId = Guid.NewGuid();

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Unapproved Shop",
            Phone = "1234567890",
            Address = "123 Main St",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true
        };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need something",
            CategoryId = Guid.NewGuid()
        };

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            Status = ShopResponseStatus.Available
        };

        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.ShopResponses.Add(response);
        await context.SaveChangesAsync();

        var result = await chatService.StartConversationAsync(customerId, new StartConversationRequest
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id
        });

        Assert.False(result.Success);
        Assert.Contains("not currently active or verified", result.Message.ToLowerInvariant());
    }
}
