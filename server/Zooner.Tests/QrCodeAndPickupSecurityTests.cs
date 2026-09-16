using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class QrCodeAndPickupSecurityTests
{
    [Fact]
    public async Task Wrong_Store_Merchant_Scan_Is_Rejected()
    {
        using var context = TestDbContextFactory.Create(nameof(Wrong_Store_Merchant_Scan_Is_Rejected));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendorA = new User { Id = Guid.NewGuid(), Email = "va@z.app", Role = UserRoles.Vendor };
        var vendorB = new User { Id = Guid.NewGuid(), Email = "vb@z.app", Role = UserRoles.Vendor };
        var customer = new User { Id = Guid.NewGuid(), Email = "cust@z.app", Role = UserRoles.Customer };

        var shopA = new Shop { Id = Guid.NewGuid(), OwnerId = vendorA.Id, Name = "Shop A", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var shopB = new Shop { Id = Guid.NewGuid(), OwnerId = vendorB.Id, Name = "Shop B", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };

        var category = new Category { Id = Guid.NewGuid(), Name = "Tech" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Earbuds", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "White" };
        var invA = new StoreInventory { Id = Guid.NewGuid(), StoreId = shopA.Id, ProductVariantId = variant.Id, Price = 1200, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(vendorA, vendorB, customer);
        context.Shops.AddRange(shopA, shopB);
        context.Categories.Add(category);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(invA);
        await context.SaveChangesAsync();

        var holdRes = await invService.ReserveInventoryHoldAsync(shopA.Id, invA.Id, customer.Id, 1);
        Assert.True(holdRes.Success);
        var qrToken = holdRes.Data!.QrToken;

        // Vendor B at Shop B scans Customer's hold for Shop A -> must be rejected
        var valRes = await invService.ValidateHoldQrAsync(shopB.Id, qrToken, vendorB.Id);
        Assert.True(valRes.Success);
        Assert.False(valRes.Data!.IsValid);
        Assert.Contains("belongs to a different store", valRes.Data.Message);
    }

    [Fact]
    public async Task Double_Collection_Replay_Is_Prevented()
    {
        using var context = TestDbContextFactory.Create(nameof(Double_Collection_Replay_Is_Prevented));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendor = new User { Id = Guid.NewGuid(), Email = "v@z.app", Role = UserRoles.Vendor };
        var customer = new User { Id = Guid.NewGuid(), Email = "c@z.app", Role = UserRoles.Customer };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Shoe Store", IsActive = true, IsLiveEnabled = true, VerificationStatus = ShopVerificationStatus.Approved };
        var category = new Category { Id = Guid.NewGuid(), Name = "Footwear" };
        var product = new Product { Id = Guid.NewGuid(), Name = "Sneakers", CategoryId = category.Id };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Blue 9" };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 2500, Quantity = 3, AvailableQuantity = 3, IsActive = true };

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

        // First collection -> Success
        var collect1 = await invService.CollectHoldAsync(shop.Id, holdId, vendor.Id);
        Assert.True(collect1.Success);
        Assert.Equal(InventoryHoldStatus.Fulfilled.ToString(), collect1.Data!.Status);

        // Replay attempt -> Rejected
        var collect2 = await invService.CollectHoldAsync(shop.Id, holdId, vendor.Id);
        Assert.False(collect2.Success);
        Assert.Contains("already been collected", collect2.Message);
    }
}

