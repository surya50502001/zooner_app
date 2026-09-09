using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Background;
using Microsoft.EntityFrameworkCore;

namespace Zooner.Tests;

public class ProductionReadinessTests
{
    private readonly IConfiguration _config = new ConfigurationBuilder().Build();

    [Fact]
    public async Task StoreRegistration_Defaults_To_Pending_Verification()
    {
        using var context = TestDbContextFactory.Create(nameof(StoreRegistration_Defaults_To_Pending_Verification));
        var shopService = new ShopService(context, _config, NullLogger<ShopService>.Instance);

        var owner = new User
        {
            Id = Guid.NewGuid(),
            FullName = "New Retailer",
            Email = "retailer@example.com",
            PasswordHash = "hash",
            Role = "Customer"
        };
        context.Users.Add(owner);
        await context.SaveChangesAsync();

        var res = await shopService.CreateShopAsync(owner.Id, new CreateShopRequest
        {
            Name = "ElectroHub",
            Description = "Gadgets",
            Phone = "9876543210",
            Address = "123 Tech Park, Coimbatore",
            Latitude = 11.0168,
            Longitude = 76.9558
        });

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        // CRITICAL: New store in production must be Pending, NOT auto-approved
        Assert.Equal("Pending", res.Data.VerificationStatus);
    }

    [Fact]
    public async Task Unverified_Store_Inventory_Hidden_From_Public_Search()
    {
        using var context = TestDbContextFactory.Create(nameof(Unverified_Store_Inventory_Hidden_From_Public_Search));
        var productService = new ProductService(context, NullLogger<ProductService>.Instance);

        var owner = new User { Id = Guid.NewGuid(), FullName = "Owner", Email = "owner@test.com", PasswordHash = "h" };
        var category = new Category { Id = Guid.NewGuid(), Name = "Electronics", Slug = "electronics" };
        var pendingShop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = owner.Id,
            Name = "Pending Mobile Store",
            Phone = "12345",
            Address = "Road",
            VerificationStatus = ShopVerificationStatus.Pending, // NOT approved
            IsActive = true
        };

        var product = new Product
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            Category = category,
            Name = "Flagship Smartphone Pro",
            NormalizedName = "FLAGSHIP SMARTPHONE PRO",
            IsActive = true
        };



        var variant = new ProductVariant
        {
            Id = Guid.NewGuid(),
            ProductId = product.Id,
            VariantName = "256GB Black",
            IsActive = true
        };

        var inventory = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = pendingShop.Id,
            ProductVariantId = variant.Id,
            Price = 69999m,
            Quantity = 10,
            AvailableQuantity = 10,
            IsActive = true
        };

        product.Variants.Add(variant);
        inventory.Store = pendingShop;
        inventory.ProductVariant = variant;

        context.Users.Add(owner);
        context.Categories.Add(category);
        context.Shops.Add(pendingShop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inventory);
        await context.SaveChangesAsync();



        // Customer searches for product
        var searchResult = await productService.SearchProductsAsync("Smartphone", null, null, null);
        Assert.True(searchResult.Success);
        var foundProduct = searchResult.Data!.FirstOrDefault(p => p.Id == product.Id);
        
        // Unapproved store inventory must NOT be exposed in carrying stores
        Assert.NotNull(foundProduct);
        Assert.Equal(0, foundProduct.NearbyStoresCount);
        Assert.Empty(foundProduct.CarryingStores);

        var storesResult = await productService.GetProductStoresAsync(product.Id, null, null);
        Assert.Empty(storesResult.Data!);
    }

    [Fact]
    public async Task InventoryHold_AtomicReservation_Enforces_QuantityBounds_And_Stock()
    {
        using var context = TestDbContextFactory.Create(nameof(InventoryHold_AtomicReservation_Enforces_QuantityBounds_And_Stock));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var customer = new User { Id = Guid.NewGuid(), FullName = "Shopper", Email = "shopper@test.com", PasswordHash = "h" };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = Guid.NewGuid(), Name = "Electronics Corner", Phone = "123", Address = "Mall", IsActive = true, VerificationStatus = ShopVerificationStatus.Approved };
        var product = new Product { Id = Guid.NewGuid(), Name = "Noise Cancelling Headphones", NormalizedName = "noise cancelling headphones", IsActive = true };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "Black", IsActive = true };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 14999m, Quantity = 2, AvailableQuantity = 2, IsActive = true };

        context.Users.Add(customer);
        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        // Test 1: Invalid bounds (> 5)
        var excessHold = await inventoryService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 10);
        Assert.False(excessHold.Success);
        Assert.Contains("between 1 and 5", excessHold.Message);

        // Test 2: Successful hold of 1 item
        var holdRes = await inventoryService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 1);
        Assert.True(holdRes.Success);
        Assert.NotNull(holdRes.Data);
        Assert.StartsWith("H-", holdRes.Data.HoldCode);

        // Verify stock decremented
        var updatedInv = await context.StoreInventories.FindAsync(inv.Id);
        Assert.Equal(1, updatedInv!.AvailableQuantity);

        // Test 3: Prevent duplicate concurrent active holds by same user on same item
        var dupHold = await inventoryService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 1);
        Assert.False(dupHold.Success);
        Assert.Contains("already have an active hold pass", dupHold.Message);
    }

    [Fact]
    public async Task InventoryHold_Release_Restores_Stock_And_Requires_Authorization()
    {
        using var context = TestDbContextFactory.Create(nameof(InventoryHold_Release_Restores_Stock_And_Requires_Authorization));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var owner = new User { Id = Guid.NewGuid(), FullName = "Owner", Email = "owner@test.com", PasswordHash = "h" };
        var customer = new User { Id = Guid.NewGuid(), FullName = "Customer", Email = "customer@test.com", PasswordHash = "h" };
        var intruder = new User { Id = Guid.NewGuid(), FullName = "Intruder", Email = "intruder@test.com", PasswordHash = "h" };

        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = owner.Id, Name = "Shoe Store", Phone = "123", Address = "St", IsActive = true, VerificationStatus = ShopVerificationStatus.Approved };
        var product = new Product { Id = Guid.NewGuid(), Name = "Running Shoes", NormalizedName = "running shoes", IsActive = true };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "UK 9", IsActive = true };
        var inv = new StoreInventory { Id = Guid.NewGuid(), StoreId = shop.Id, ProductVariantId = variant.Id, Price = 4999m, Quantity = 5, AvailableQuantity = 5, IsActive = true };

        context.Users.AddRange(owner, customer, intruder);
        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        var holdRes = await inventoryService.ReserveInventoryHoldAsync(shop.Id, inv.Id, customer.Id, 2);
        Assert.True(holdRes.Success);

        // Intruder attempts to cancel/release customer's hold
        var intruderRelease = await inventoryService.ReleaseInventoryHoldAsync(shop.Id, inv.Id, holdRes.Data!.HoldId, intruder.Id);
        Assert.False(intruderRelease.Success);
        Assert.Contains("Unauthorized", intruderRelease.Message);

        // Legitimate customer releases their own hold
        var customerRelease = await inventoryService.ReleaseInventoryHoldAsync(shop.Id, inv.Id, holdRes.Data.HoldId, customer.Id);
        Assert.True(customerRelease.Success);

        var refreshedInv = await context.StoreInventories.FindAsync(inv.Id);
        Assert.Equal(5, refreshedInv!.AvailableQuantity); // Restored back to 5
    }

    [Fact]
    public async Task Vendor_Isolation_Cannot_Modify_Another_Vendor_Inventory()
    {
        using var context = TestDbContextFactory.Create(nameof(Vendor_Isolation_Cannot_Modify_Another_Vendor_Inventory));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var vendorA = new User { Id = Guid.NewGuid(), FullName = "Vendor A", Email = "va@test.com", PasswordHash = "h" };
        var vendorB = new User { Id = Guid.NewGuid(), FullName = "Vendor B", Email = "vb@test.com", PasswordHash = "h" };

        var shopA = new Shop { Id = Guid.NewGuid(), OwnerId = vendorA.Id, Name = "Shop A", Phone = "1", Address = "A", IsActive = true };
        var product = new Product { Id = Guid.NewGuid(), Name = "Gadget", NormalizedName = "gadget", IsActive = true };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "V1", IsActive = true };
        var invA = new StoreInventory { Id = Guid.NewGuid(), StoreId = shopA.Id, ProductVariantId = variant.Id, Price = 1000m, Quantity = 10, AvailableQuantity = 10, IsActive = true };

        context.Users.AddRange(vendorA, vendorB);
        context.Shops.Add(shopA);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(invA);
        await context.SaveChangesAsync();

        // Vendor B attempts to update Vendor A's inventory
        var updateRes = await inventoryService.UpdateStoreInventoryAsync(shopA.Id, invA.Id, vendorB.Id, new UpdateStoreInventoryRequest
        {
            Price = 1m,
            Quantity = 0
        });

        Assert.False(updateRes.Success);
        Assert.Contains("Unauthorized", updateRes.Message);

        // Vendor B attempts to delete Vendor A's inventory
        var deleteRes = await inventoryService.DeleteStoreInventoryAsync(shopA.Id, invA.Id, vendorB.Id);
        Assert.False(deleteRes.Success);
        Assert.Contains("Unauthorized", deleteRes.Message);
    }

    [Fact]
    public async Task Single_User_Dual_Capability_Customer_And_Vendor()
    {
        using var context = TestDbContextFactory.Create(nameof(Single_User_Dual_Capability_Customer_And_Vendor));
        var shopService = new ShopService(context, _config, NullLogger<ShopService>.Instance);

        // User registers as regular customer
        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Multi Role User",
            Email = "multirole@zooner.in",
            PasswordHash = "hash",
            Role = "Customer"
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        // Same user registers their physical shop without creating a second account
        var shopRes = await shopService.CreateShopAsync(user.Id, new CreateShopRequest
        {
            Name = "MultiRole Stationery",
            Phone = "9944123456",
            Address = "Crosscut Road, Coimbatore"
        });

        Assert.True(shopRes.Success);

        // User can retrieve their owned shops
        var myShops = await shopService.GetMyShopsAsync(user.Id);
        Assert.Single(myShops.Data!);
        Assert.Equal("MultiRole Stationery", myShops.Data![0].Name);
    }

    [Fact]
    public async Task BecomeVendor_Upgrades_Role_To_Both_And_Emits_Vendor_And_Customer_Claims()
    {
        using var context = TestDbContextFactory.Create(nameof(BecomeVendor_Upgrades_Role_To_Both_And_Emits_Vendor_And_Customer_Claims));
        var inMemorySettings = new Dictionary<string, string?> {
            {"Jwt:Key", "SuperSecretKeyForTestingProductionReadinessZooner2026!"},
            {"Jwt:Issuer", "TestIssuer"},
            {"Jwt:Audience", "TestAudience"}
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemorySettings).Build();
        var tokenService = new TokenService(config);
        var authService = new AuthService(context, tokenService, NullLogger<AuthService>.Instance);

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = "John Shopper",
            Email = "shopper@test.com",
            PasswordHash = "hash",
            Role = UserRoles.Customer
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        Assert.True(user.HasCustomerCapability);
        Assert.False(user.HasVendorCapability);

        var response = await authService.BecomeVendorAsync(user.Id);
        Assert.True(response.Success);
        Assert.Equal(UserRoles.Vendor, response.Data!.User.Role);

        // Verify updated entity in db
        var updated = await context.Users.FindAsync(user.Id);
        Assert.NotNull(updated);
        Assert.Equal(UserRoles.Vendor, updated.Role);
        Assert.True(updated.HasCustomerCapability);
        Assert.True(updated.HasVendorCapability);

        // Verify generated token contains Customer, Vendor, and ShopOwner role claims
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(response.Data.AccessToken);
        var roleClaims = jwt.Claims
            .Where(c => c.Type == "role" || c.Type == System.Security.Claims.ClaimTypes.Role)
            .Select(c => c.Value)
            .ToList();
        Assert.Contains("Customer", roleClaims);
        Assert.Contains("Vendor", roleClaims);
        Assert.Contains("ShopOwner", roleClaims);
    }

    [Fact]
    public async Task RefreshToken_Storage_Is_Hashed_And_Cannot_Be_Found_By_Plaintext()
    {
        using var context = TestDbContextFactory.Create(nameof(RefreshToken_Storage_Is_Hashed_And_Cannot_Be_Found_By_Plaintext));
        var inMemorySettings = new Dictionary<string, string?> {
            {"Jwt:Key", "SuperSecretKeyForTestingProductionReadinessZooner2026!"},
            {"Jwt:Issuer", "TestIssuer"},
            {"Jwt:Audience", "TestAudience"}
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemorySettings).Build();
        var tokenService = new TokenService(config);
        var authService = new AuthService(context, tokenService, NullLogger<AuthService>.Instance);

        var request = new RegisterRequest
        {
            FullName = "Hash Tester",
            Email = "hash@tester.com",
            Password = "SecurePassword123!"
        };

        var response = await authService.RegisterAsync(request);
        Assert.True(response.Success);
        
        var plainToken = response.Data!.RefreshToken;
        
        // Ensure the token stored in DB is not the plain token
        var dbToken = await context.RefreshTokens.FirstOrDefaultAsync();
        Assert.NotNull(dbToken);
        Assert.NotEqual(plainToken, dbToken.Token);

        // Ensure we can refresh using the plain token
        var refreshResponse = await authService.RefreshTokenAsync(plainToken);
        Assert.True(refreshResponse.Success);
    }

    [Fact]
    public async Task InventoryHold_Concurrency_Rejects_Simultaneous_OverAllocation()
    {
        using var context = TestDbContextFactory.Create(nameof(InventoryHold_Concurrency_Rejects_Simultaneous_OverAllocation));
        var invService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var shop = new Shop { Id = Guid.NewGuid(), Name = "Shop", OwnerId = Guid.NewGuid(), Phone = "1", Address = "A", VerificationStatus = ShopVerificationStatus.Approved, IsActive = true };
        var product = new Product { Id = Guid.NewGuid(), Name = "Phone", CategoryId = Guid.NewGuid(), BrandId = Guid.NewGuid() };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "V1", IsActive = true };
        var inventory = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = shop.Id,
            ProductVariantId = variant.Id,
            Quantity = 1,
            AvailableQuantity = 1,
            Price = 100,
            IsActive = true
        };
        var customer1 = new User { Id = Guid.NewGuid(), FullName = "C1", Email = "c1@t.com", PasswordHash = "h" };
        var customer2 = new User { Id = Guid.NewGuid(), FullName = "C2", Email = "c2@t.com", PasswordHash = "h" };

        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inventory);
        context.Users.AddRange(customer1, customer2);
        await context.SaveChangesAsync();

        // First hold claims the 1 available unit
        var hold1 = await invService.ReserveInventoryHoldAsync(shop.Id, inventory.Id, customer1.Id, 1);
        Assert.True(hold1.Success);

        // Second hold immediately fails because AvailableQuantity is now 0
        var hold2 = await invService.ReserveInventoryHoldAsync(shop.Id, inventory.Id, customer2.Id, 1);
        Assert.False(hold2.Success);
        Assert.Contains("Insufficient stock", hold2.Message);
    }

    [Fact]
    public async Task HoldExpirationWorker_Scans_And_Restores_Expired_Inventory_Stock()
    {
        var dbName = nameof(HoldExpirationWorker_Scans_And_Restores_Expired_Inventory_Stock);
        using var context = TestDbContextFactory.Create(dbName);

        var shop = new Shop { Id = Guid.NewGuid(), Name = "Shop", OwnerId = Guid.NewGuid(), Phone = "1", Address = "A", IsActive = true };
        var inventory = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = shop.Id,
            ProductVariantId = Guid.NewGuid(),
            Quantity = 5,
            AvailableQuantity = 3, // 2 items held
            Price = 50,
            IsActive = true
        };
        var expiredHold = new InventoryHold
        {
            Id = Guid.NewGuid(),
            StoreId = shop.Id,
            StoreInventoryId = inventory.Id,
            CustomerId = Guid.NewGuid(),
            Quantity = 2,
            HoldCode = "H-9999",
            Status = InventoryHoldStatus.Active,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5),
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-35)
        };

        context.Shops.Add(shop);
        context.StoreInventories.Add(inventory);
        context.InventoryHolds.Add(expiredHold);
        await context.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddScoped(_ => TestDbContextFactory.Create(dbName));
        var serviceProvider = services.BuildServiceProvider();

        var worker = new HoldExpirationWorker(serviceProvider, NullLogger<HoldExpirationWorker>.Instance);
        var expiredCount = await worker.ExpireOutdatedHoldsAsync(CancellationToken.None);

        Assert.Equal(1, expiredCount);

        using var verifyContext = TestDbContextFactory.Create(dbName);
        var updatedHold = await verifyContext.InventoryHolds.FindAsync(expiredHold.Id);
        Assert.NotNull(updatedHold);
        Assert.Equal(InventoryHoldStatus.Expired, updatedHold.Status);

        var updatedInventory = await verifyContext.StoreInventories.FindAsync(inventory.Id);
        Assert.NotNull(updatedInventory);
        // Stock restored from 3 back to 5
        Assert.Equal(5, updatedInventory.AvailableQuantity);
    }

    [Fact]
    public async Task PublicRegistration_Always_Assigns_Customer_Role_Ignoring_Client_Supplied_Role()
    {
        using var context = TestDbContextFactory.Create(nameof(PublicRegistration_Always_Assigns_Customer_Role_Ignoring_Client_Supplied_Role));
        var inMemorySettings = new Dictionary<string, string?> {
            {"Jwt:Key", "SuperSecretKeyForTestingProductionReadinessZooner2026!"},
            {"Jwt:Issuer", "TestIssuer"},
            {"Jwt:Audience", "TestAudience"}
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemorySettings).Build();
        var tokenService = new TokenService(config);
        var authService = new AuthService(context, tokenService, NullLogger<AuthService>.Instance);

        // Attempt privilege escalation to Admin via registration request
        var adminAttempt = await authService.RegisterAsync(new RegisterRequest
        {
            FullName = "Malicious Hacker",
            Email = "hacker@test.com",
            Password = "SecurePassword123!",
            Role = UserRoles.Admin
        });

        Assert.True(adminAttempt.Success);
        Assert.NotNull(adminAttempt.Data);
        // CRITICAL: Public registration must unconditionally ignore client-supplied role and assign Customer
        Assert.Equal(UserRoles.Customer, adminAttempt.Data.User.Role);

        var dbUser = await context.Users.FindAsync(adminAttempt.Data.User.Id);
        Assert.NotNull(dbUser);
        Assert.Equal(UserRoles.Customer, dbUser.Role);
        Assert.False(dbUser.HasVendorCapability);

        // Attempt privilege escalation to ShopOwner via registration request
        var vendorAttempt = await authService.RegisterAsync(new RegisterRequest
        {
            FullName = "Vendor Wannabe",
            Email = "vendor@test.com",
            Password = "SecurePassword123!",
            Role = "ShopOwner"
        });

        Assert.True(vendorAttempt.Success);
        Assert.Equal(UserRoles.Customer, vendorAttempt.Data!.User.Role);
    }

    [Fact]
    public async Task Unapproved_Store_Direct_Id_Lookup_Returns_404_For_Public_And_Success_For_Owner_Or_Admin()
    {
        using var context = TestDbContextFactory.Create(nameof(Unapproved_Store_Direct_Id_Lookup_Returns_404_For_Public_And_Success_For_Owner_Or_Admin));
        var shopService = new ShopService(context, _config, NullLogger<ShopService>.Instance);

        var owner = new User { Id = Guid.NewGuid(), FullName = "Shop Owner", Email = "owner@test.com", PasswordHash = "h" };
        var otherUser = new User { Id = Guid.NewGuid(), FullName = "Random User", Email = "other@test.com", PasswordHash = "h" };
        var pendingShop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = owner.Id,
            Name = "Pending Gadgets",
            Phone = "12345",
            Address = "Tech St",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true,
            IsLiveEnabled = true
        };

        context.Users.AddRange(owner, otherUser);
        context.Shops.Add(pendingShop);
        await context.SaveChangesAsync();

        // 1. Unauthenticated public caller -> 404
        var publicLookup = await shopService.GetShopByIdAsync(pendingShop.Id, userLat: null, userLon: null, requestingUserId: null, isAdmin: false);
        Assert.False(publicLookup.Success);
        Assert.Contains("unavailable", publicLookup.Message.ToLower());

        // 2. Different authenticated user -> 404
        var otherUserLookup = await shopService.GetShopByIdAsync(pendingShop.Id, userLat: null, userLon: null, requestingUserId: otherUser.Id, isAdmin: false);
        Assert.False(otherUserLookup.Success);

        // 3. Store owner -> 200 Success
        var ownerLookup = await shopService.GetShopByIdAsync(pendingShop.Id, userLat: null, userLon: null, requestingUserId: owner.Id, isAdmin: false);
        Assert.True(ownerLookup.Success);
        Assert.NotNull(ownerLookup.Data);
        Assert.Equal(pendingShop.Name, ownerLookup.Data.Name);

        // 4. Admin caller -> 200 Success
        var adminLookup = await shopService.GetShopByIdAsync(pendingShop.Id, userLat: null, userLon: null, requestingUserId: otherUser.Id, isAdmin: true);
        Assert.True(adminLookup.Success);
        Assert.NotNull(adminLookup.Data);
    }

    [Fact]
    public async Task Unapproved_Store_Inventory_Hidden_From_Public_Store_Query()
    {
        using var context = TestDbContextFactory.Create(nameof(Unapproved_Store_Inventory_Hidden_From_Public_Store_Query));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var ownerId = Guid.NewGuid();
        var pendingShop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = "Unapproved Shop",
            Phone = "123",
            Address = "Street",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = true,
            IsLiveEnabled = true
        };

        var product = new Product { Id = Guid.NewGuid(), Name = "Earbuds", NormalizedName = "earbuds", IsActive = true };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "White", IsActive = true };
        var inv = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = pendingShop.Id,
            ProductVariantId = variant.Id,
            Price = 999m,
            Quantity = 10,
            AvailableQuantity = 10,
            IsActive = true
        };

        context.Shops.Add(pendingShop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        // Public visitor cannot access inventory of unapproved store (returns error/unavailable)
        var publicInv = await inventoryService.GetStoreInventoryAsync(pendingShop.Id, search: null, categoryId: null, requestingUserId: null, isAdmin: false);
        Assert.False(publicInv.Success);
        Assert.Contains("unavailable", publicInv.Message.ToLower());

        // Another user cannot access inventory of unapproved store
        var otherUserInv = await inventoryService.GetStoreInventoryAsync(pendingShop.Id, search: null, categoryId: null, requestingUserId: Guid.NewGuid(), isAdmin: false);
        Assert.False(otherUserInv.Success);
        Assert.Contains("unavailable", otherUserInv.Message.ToLower());

        // Store owner CAN see inventory
        var ownerInv = await inventoryService.GetStoreInventoryAsync(pendingShop.Id, search: null, categoryId: null, requestingUserId: ownerId, isAdmin: false);
        Assert.True(ownerInv.Success);
        Assert.Single(ownerInv.Data!);

        // Admin CAN see inventory
        var adminInv = await inventoryService.GetStoreInventoryAsync(pendingShop.Id, search: null, categoryId: null, requestingUserId: null, isAdmin: true);
        Assert.True(adminInv.Success);
        Assert.Single(adminInv.Data!);
    }

    [Fact]
    public async Task Inventory_Cannot_Reduce_Total_Quantity_Below_Reserved_Quantity_And_Rejects_Negative_Values()
    {
        using var context = TestDbContextFactory.Create(nameof(Inventory_Cannot_Reduce_Total_Quantity_Below_Reserved_Quantity_And_Rejects_Negative_Values));
        var inventoryService = new InventoryService(context, NullLogger<InventoryService>.Instance);

        var ownerId = Guid.NewGuid();
        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = "Approved Shop",
            Phone = "123",
            Address = "Street",
            VerificationStatus = ShopVerificationStatus.Approved,
            IsActive = true,
            IsLiveEnabled = true
        };

        var product = new Product { Id = Guid.NewGuid(), Name = "Charger", NormalizedName = "charger", IsActive = true };
        var variant = new ProductVariant { Id = Guid.NewGuid(), ProductId = product.Id, VariantName = "65W", IsActive = true };

        var inv = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = shop.Id,
            ProductVariantId = variant.Id,
            Price = 100m,
            Quantity = 10,
            AvailableQuantity = 6, // 4 items are currently reserved / on hold
            IsActive = true
        };

        context.Shops.Add(shop);
        context.Products.Add(product);
        context.ProductVariants.Add(variant);
        context.StoreInventories.Add(inv);
        await context.SaveChangesAsync();

        // 1. Rejects negative price
        var negativePrice = await inventoryService.UpdateStoreInventoryAsync(shop.Id, inv.Id, ownerId, new UpdateStoreInventoryRequest
        {
            Price = -10m,
            Quantity = 10
        });
        Assert.False(negativePrice.Success);
        Assert.Contains("negative", negativePrice.Message.ToLower());

        // 2. Rejects negative quantity
        var negativeQty = await inventoryService.UpdateStoreInventoryAsync(shop.Id, inv.Id, ownerId, new UpdateStoreInventoryRequest
        {
            Price = 100m,
            Quantity = -2
        });
        Assert.False(negativeQty.Success);
        Assert.Contains("negative", negativeQty.Message.ToLower());

        // 3. Rejects reducing TotalQuantity (e.g. to 3) below currently reserved items (4 items)
        var belowReserved = await inventoryService.UpdateStoreInventoryAsync(shop.Id, inv.Id, ownerId, new UpdateStoreInventoryRequest
        {
            Price = 100m,
            Quantity = 3
        });
        Assert.False(belowReserved.Success);
        Assert.Contains("Cannot reduce total quantity", belowReserved.Message);

        // 4. Successfully updates quantity above reserved items (e.g. to 8)
        var validUpdate = await inventoryService.UpdateStoreInventoryAsync(shop.Id, inv.Id, ownerId, new UpdateStoreInventoryRequest
        {
            Price = 120m,
            Quantity = 8
        });
        Assert.True(validUpdate.Success);
        Assert.Equal(8, validUpdate.Data!.Quantity);
        // Available should be 8 - 4 reserved = 4
        Assert.Equal(4, validUpdate.Data.AvailableQuantity);
        Assert.Equal(120m, validUpdate.Data.Price);
    }

    [Fact]
    public async Task Admin_VerifyShop_Approves_And_Activates_Store()
    {
        using var context = TestDbContextFactory.Create(nameof(Admin_VerifyShop_Approves_And_Activates_Store));
        var adminService = new AdminService(context);

        var adminUser = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Admin User",
            Email = "admin@zooner.app",
            PasswordHash = "h",
            Role = "Admin"
        };
        var ownerUser = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Store Owner",
            Email = "owner@store.com",
            PasswordHash = "h",
            Role = "Customer"
        };
        var pendingShop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerUser.Id,
            Name = "New Electronics Store",
            Phone = "9876543210",
            Address = "100 Main St",
            VerificationStatus = ShopVerificationStatus.Pending,
            IsActive = false
        };

        context.Users.AddRange(adminUser, ownerUser);
        context.Shops.Add(pendingShop);
        await context.SaveChangesAsync();

        var res = await adminService.VerifyShopAsync(adminUser.Id, pendingShop.Id, new VerifyShopRequest
        {
            Status = ShopVerificationStatus.Approved
        });

        Assert.True(res.Success);

        var updatedShop = await context.Shops.FindAsync(pendingShop.Id);
        Assert.NotNull(updatedShop);
        Assert.Equal(ShopVerificationStatus.Approved, updatedShop.VerificationStatus);
        Assert.True(updatedShop.IsActive);

        var updatedOwner = await context.Users.FindAsync(ownerUser.Id);
        Assert.NotNull(updatedOwner);
        Assert.Equal("Vendor", updatedOwner.Role);

        var notification = await context.Notifications.FirstOrDefaultAsync(n => n.UserId == ownerUser.Id);
        Assert.NotNull(notification);
        Assert.Contains("Approved", notification.Message);

        var action = await context.AdminActions.FirstOrDefaultAsync(a => a.TargetId == pendingShop.Id.ToString());
        Assert.NotNull(action);
        Assert.Equal("VerifyShop", action.Action);
    }
}
