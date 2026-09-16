using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
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
    private readonly string _dbPath;
    private readonly DbContextOptions<AppDbContext> _options;

    public RelationalConcurrencyAndInventoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"rel_concurrency_{Guid.NewGuid():N}.db");

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .Options;

        using var context = new AppDbContext(_options);
        context.Database.EnsureCreated();
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
                Price = 1500,
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
            var updatedInventory = await verifyContext.StoreInventories.FindAsync(inventoryId);
            Assert.NotNull(updatedInventory);
            Assert.Equal(0, updatedInventory.AvailableQuantity);
            Assert.Equal(1, updatedInventory.Quantity);

            var activeHolds = await verifyContext.InventoryHolds.Where(h => h.StoreInventoryId == inventoryId).ToListAsync();
            Assert.Single(activeHolds);
            Assert.Equal(InventoryHoldStatus.Active, activeHolds[0].Status);
        }
    }

    [Fact]
    public async Task Expired_Hold_Allows_New_Customer_To_Reserve()
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
                Price = 3000,
                Quantity = 1,
                AvailableQuantity = 0, // Held by old customer
                IsActive = true
            };

            var expiredHold = new InventoryHold
            {
                Id = Guid.NewGuid(),
                StoreInventoryId = inventory.Id,
                StoreId = shop.Id,
                CustomerId = customerOldId,
                Quantity = 1,
                ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5), // Expired
                Status = InventoryHoldStatus.Active,
                HoldCode = "OLD123",
                QrToken = "token-old"
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
            
            // New customer reserves - old expired hold is cleaned and new hold succeeds
            var result = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerNewId, 1);
            Assert.True(result.Success);
            Assert.NotNull(result.Data);
        }

        using (var verifyContext = CreateContext())
        {
            var updatedInventory = await verifyContext.StoreInventories.FindAsync(inventoryId);
            Assert.NotNull(updatedInventory);
            Assert.Equal(0, updatedInventory.AvailableQuantity);

            var oldHold = await verifyContext.InventoryHolds.FirstOrDefaultAsync(h => h.CustomerId == customerOldId);
            Assert.NotNull(oldHold);
            Assert.Equal(InventoryHoldStatus.Expired, oldHold.Status);

            var newHold = await verifyContext.InventoryHolds.FirstOrDefaultAsync(h => h.CustomerId == customerNewId);
            Assert.NotNull(newHold);
            Assert.Equal(InventoryHoldStatus.Active, newHold.Status);
        }
    }

    [Fact]
    public async Task Customer_Cannot_Have_Duplicate_Active_Holds_For_Same_Inventory()
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
                Price = 2500,
                Quantity = 2,
                AvailableQuantity = 2,
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
            
            // Try to reserve 5 items when only 2 available
            var res = await service.ReserveInventoryHoldAsync(storeId, inventoryId, customerId, 5);
            Assert.False(res.Success);
            Assert.Contains("insufficient stock", res.Message.ToLowerInvariant());
        }
    }
}

