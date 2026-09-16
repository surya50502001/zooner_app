using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class RelationalConcurrencyAndInventoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public RelationalConcurrencyAndInventoryTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var context = new AppDbContext(_options);
        context.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _connection.Dispose();
    }

    private AppDbContext CreateContext() => new AppDbContext(_options);

    [Fact]
    public async Task Simultaneous_Hold_Reservations_With_Stock_1_Allows_Exactly_One_Success()
    {
        var storeId = Guid.NewGuid();
        var inventoryId = Guid.NewGuid();
        var customerAId = Guid.NewGuid();
        var customerBId = Guid.NewGuid();
        var vendorId = Guid.NewGuid();

        using (var setupContext = CreateContext())
        {
            var vendor = new User { Id = vendorId, FullName = "Vendor", Email = "v@test.com", Role = UserRoles.Vendor };
            var custA = new User { Id = customerAId, FullName = "Customer A", Email = "a@test.com", Role = UserRoles.Customer };
            var custB = new User { Id = customerBId, FullName = "Customer B", Email = "b@test.com", Role = UserRoles.Customer };

            var category = new Category { Id = Guid.NewGuid(), Name = "Electronics", Slug = "electronics" };
            var brand = new Brand { Id = Guid.NewGuid(), Name = "Sony", NormalizedName = "sony" };
            var product = new Product { Id = Guid.NewGuid(), Name = "Headphones", CategoryId = category.Id, BrandId = brand.Id };
            var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Black" };

            var shop = new Shop
            {
                Id = storeId,
                OwnerId = vendor.Id,
                Name = "Audio Hub",
                Phone = "1234567890",
                Address = "100 Tech Lane",
                Latitude = 11.0,
                Longitude = 76.9,
                IsActive = true,
                IsLiveEnabled = true,
                VerificationStatus = ShopVerificationStatus.Approved
            };

            var inventory = new StoreInventory
            {
                Id = inventoryId,
                StoreId = shop.Id,
                ProductVariantId = variant.Id,
                Price = 2999,
                Quantity = 1,
                AvailableQuantity = 1,
                IsActive = true
            };

            setupContext.Users.AddRange(vendor, custA, custB);
            setupContext.Categories.Add(category);
            setupContext.Brands.Add(brand);
            setupContext.Products.Add(product);
            setupContext.ProductVariants.Add(variant);
            setupContext.Shops.Add(shop);
            setupContext.StoreInventories.Add(inventory);
            await setupContext.SaveChangesAsync();
        }

        var taskA = Task.Run(async () =>
        {
            using var contextA = CreateContext();
            var serviceA = new InventoryService(contextA, NullLogger<InventoryService>.Instance);
            return await serviceA.ReserveInventoryHoldAsync(storeId, inventoryId, customerAId, 1);
        });

        var taskB = Task.Run(async () =>
        {
            using var contextB = CreateContext();
            var serviceB = new InventoryService(contextB, NullLogger<InventoryService>.Instance);
            return await serviceB.ReserveInventoryHoldAsync(storeId, inventoryId, customerBId, 1);
        });

        var results = await Task.WhenAll(taskA, taskB);
        var successCount = results.Count(r => r.Success);
        var failCount = results.Count(r => !r.Success);

        Assert.Equal(1, successCount);
        Assert.Equal(1, failCount);

        using (var verifyContext = CreateContext())
        {
            var finalInv = await verifyContext.StoreInventories.FindAsync(inventoryId);
            Assert.NotNull(finalInv);
            Assert.Equal(0, finalInv.AvailableQuantity);
            Assert.Equal(1, finalInv.Quantity);

            var activeHolds = await verifyContext.InventoryHolds
                .Where(h => h.StoreInventoryId == inventoryId && h.Status == InventoryHoldStatus.Active)
                .ToListAsync();

            Assert.Single(activeHolds);
            Assert.True(activeHolds[0].CustomerId == customerAId || activeHolds[0].CustomerId == customerBId);
        }
    }

    [Fact]
    public async Task Expired_Hold_Returns_Available_Stock()
    {
        var storeId = Guid.NewGuid();
        var inventoryId = Guid.NewGuid();
        var customerOldId = Guid.NewGuid();
        var customerNewId = Guid.NewGuid();

        using (var setupContext = CreateContext())
        {
            var vendor = new User { Id = Guid.NewGuid(), FullName = "Vendor", Email = "v2@test.com", Role = UserRoles.Vendor };
            var custOld = new User { Id = customerOldId, FullName = "Old Cust", Email = "old@test.com", Role = UserRoles.Customer };
            var custNew = new User { Id = customerNewId, FullName = "New Cust", Email = "new@test.com", Role = UserRoles.Customer };

            var category = new Category { Id = Guid.NewGuid(), Name = "Sports", Slug = "sports" };
            var brand = new Brand { Id = Guid.NewGuid(), Name = "Nike", NormalizedName = "nike" };
            var product = new Product { Id = Guid.NewGuid(), Name = "Running Shoes", CategoryId = category.Id, BrandId = brand.Id };
            var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Size 10" };

            var shop = new Shop
            {
                Id = storeId,
                OwnerId = vendor.Id,
                Name = "Nike Pro",
                Phone = "9998887776",
                Address = "Sports Complex",
                Latitude = 11.0,
                Longitude = 76.9,
                IsActive = true,
                IsLiveEnabled = true,
                VerificationStatus = ShopVerificationStatus.Approved
            };

            var inventory = new StoreInventory
            {
                Id = inventoryId,
                StoreId = shop.Id,
                ProductVariantId = variant.Id,
                Price = 4999,
                Quantity = 1,
                AvailableQuantity = 0,
                IsActive = true
            };

            var expiredHold = new InventoryHold
            {
                Id = Guid.NewGuid(),
                StoreInventoryId = inventory.Id,
                StoreId = shop.Id,
                CustomerId = customerOldId,
                Quantity = 1,
                HoldCode = "H-1111",
                QrToken = "zhold:1111",
                Status = InventoryHoldStatus.Active,
                ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5),
                CreatedAtUtc = DateTime.UtcNow.AddMinutes(-35)
            };

            setupContext.Users.AddRange(vendor, custOld, custNew);
            setupContext.Categories.Add(category);
            setupContext.Brands.Add(brand);
            setupContext.Products.Add(product);
            setupContext.ProductVariants.Add(variant);
            setupContext.Shops.Add(shop);
            setupContext.StoreInventories.Add(inventory);
            setupContext.InventoryHolds.Add(expiredHold);
            await setupContext.SaveChangesAsync();
        }

        using (var testContext = CreateContext())
        {
            var service = new InventoryService(testContext, NullLogger<InventoryService>.Instance);
            
            var res = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerNewId, 1);
            Assert.True(res.Success);
            Assert.NotNull(res.Data);

            var updatedOldHold = await testContext.InventoryHolds.FirstOrDefaultAsync(h => h.CustomerId == customerOldId);
            Assert.NotNull(updatedOldHold);
            Assert.Equal(InventoryHoldStatus.Expired, updatedOldHold.Status);

            var updatedInv = await testContext.StoreInventories.FindAsync(inventoryId);
            Assert.NotNull(updatedInv);
            Assert.Equal(0, updatedInv.AvailableQuantity);
        }
    }

    [Fact]
    public async Task Customer_Cannot_Create_Duplicate_Active_Hold_For_Same_Inventory()
    {
        var storeId = Guid.NewGuid();
        var inventoryId = Guid.NewGuid();
        var customerId = Guid.NewGuid();

        using (var setupContext = CreateContext())
        {
            var vendor = new User { Id = Guid.NewGuid(), Email = "v3@test.com", Role = UserRoles.Vendor };
            var cust = new User { Id = customerId, Email = "cust3@test.com", Role = UserRoles.Customer };
            var category = new Category { Id = Guid.NewGuid(), Name = "Books", Slug = "books" };
            var brand = new Brand { Id = Guid.NewGuid(), Name = "Penguin", NormalizedName = "penguin" };
            var product = new Product { Id = Guid.NewGuid(), Name = "Novel", CategoryId = category.Id, BrandId = brand.Id };
            var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Paperback" };

            var shop = new Shop
            {
                Id = storeId,
                OwnerId = vendor.Id,
                Name = "Bookstore",
                Phone = "111",
                Address = "Main",
                Latitude = 11.0,
                Longitude = 76.9,
                IsActive = true,
                IsLiveEnabled = true,
                VerificationStatus = ShopVerificationStatus.Approved
            };

            var inventory = new StoreInventory
            {
                Id = inventoryId,
                StoreId = shop.Id,
                ProductVariantId = variant.Id,
                Price = 500,
                Quantity = 10,
                AvailableQuantity = 10,
                IsActive = true
            };

            setupContext.Users.AddRange(vendor, cust);
            setupContext.Categories.Add(category);
            setupContext.Brands.Add(brand);
            setupContext.Products.Add(product);
            setupContext.ProductVariants.Add(variant);
            setupContext.Shops.Add(shop);
            setupContext.StoreInventories.Add(inventory);
            await setupContext.SaveChangesAsync();
        }

        using (var testContext = CreateContext())
        {
            var service = new InventoryService(testContext, NullLogger<InventoryService>.Instance);
            
            var res1 = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerId, 1);
            Assert.True(res1.Success);

            var res2 = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerId, 1);
            Assert.False(res2.Success);
            Assert.Contains("already have an active hold", res2.Message);
        }
    }

    [Fact]
    public async Task Hold_Cannot_Exceed_Available_Stock()
    {
        var storeId = Guid.NewGuid();
        var inventoryId = Guid.NewGuid();
        var customerId = Guid.NewGuid();

        using (var setupContext = CreateContext())
        {
            var vendor = new User { Id = Guid.NewGuid(), Email = "v4@test.com", Role = UserRoles.Vendor };
            var cust = new User { Id = customerId, Email = "cust4@test.com", Role = UserRoles.Customer };
            var category = new Category { Id = Guid.NewGuid(), Name = "Hardware", Slug = "hardware" };
            var brand = new Brand { Id = Guid.NewGuid(), Name = "Generic", NormalizedName = "generic" };
            var product = new Product { Id = Guid.NewGuid(), Name = "Drill", CategoryId = category.Id, BrandId = brand.Id };
            var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "12V" };

            var shop = new Shop
            {
                Id = storeId,
                OwnerId = vendor.Id,
                Name = "Hardware Mart",
                Phone = "222",
                Address = "Industrial Area",
                Latitude = 11.0,
                Longitude = 76.9,
                IsActive = true,
                IsLiveEnabled = true,
                VerificationStatus = ShopVerificationStatus.Approved
            };

            var inventory = new StoreInventory
            {
                Id = inventoryId,
                StoreId = shop.Id,
                ProductVariantId = variant.Id,
                Price = 1500,
                Quantity = 2,
                AvailableQuantity = 1,
                IsActive = true
            };

            setupContext.Users.AddRange(vendor, cust);
            setupContext.Categories.Add(category);
            setupContext.Brands.Add(brand);
            setupContext.Products.Add(product);
            setupContext.ProductVariants.Add(variant);
            setupContext.Shops.Add(shop);
            setupContext.StoreInventories.Add(inventory);
            await setupContext.SaveChangesAsync();
        }

        using (var testContext = CreateContext())
        {
            var service = new InventoryService(testContext, NullLogger<InventoryService>.Instance);
            
            var res = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerId, 2);
            Assert.False(res.Success);
            Assert.Contains("Insufficient stock", res.Message);
        }
    }
}
