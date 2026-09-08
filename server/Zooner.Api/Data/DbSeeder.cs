using Microsoft.EntityFrameworkCore;
using Zooner.Api.Models;

namespace Zooner.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext context, ILogger logger)
    {
        try
        {
            await EnsureTablesExistAsync(context, logger);

            // 1. Seed Business Settings if not existing
            if (!await context.BusinessSettings.AnyAsync())
            {
                context.BusinessSettings.AddRange(
                    new BusinessSetting { Key = "RequestExpirationMinutes", Value = "30", Description = "Live request expiration time in minutes", UpdatedBy = "System" },
                    new BusinessSetting { Key = "MaxSearchRadiusKm", Value = "50", Description = "Maximum allowed search radius in kilometers", UpdatedBy = "System" },
                    new BusinessSetting { Key = "DefaultSearchRadiusKm", Value = "5", Description = "Default search radius in kilometers", UpdatedBy = "System" }
                );
                await context.SaveChangesAsync();
                logger.LogInformation("Seeded default business settings.");
            }

            // 2. Seed Default Admin User if not existing
            var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@locallive.com";
            var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD");
            
            if (!string.IsNullOrEmpty(adminPassword) && !await context.Users.AnyAsync(u => u.Email == adminEmail))
            {
                var admin = new User
                {
                    Id = Guid.NewGuid(),
                    FullName = "LocalLive Administrator",
                    Email = adminEmail,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
                    Role = UserRoles.Admin,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };
                context.Users.Add(admin);
                await context.SaveChangesAsync();
                logger.LogInformation("Seeded default administrator account: {Email}", adminEmail);
            }

            // 2b. Ensure designated super-admin accounts have Admin role
            var superAdminEmails = new[] { "surya50502001@gmail.com", "admin@zooner.app" };
            var usersToPromote = await context.Users
                .Where(u => superAdminEmails.Contains(u.Email.ToLower()) && u.Role != UserRoles.Admin)
                .ToListAsync();

            if (usersToPromote.Any())
            {
                foreach (var u in usersToPromote)
                {
                    u.Role = UserRoles.Admin;
                }
                await context.SaveChangesAsync();
                logger.LogInformation("Promoted {Count} designated super-admin user(s) in database to Admin role.", usersToPromote.Count);
            }

            // 3. Seed Initial Categories if database missing categories
            if (!await context.Categories.AnyAsync(c => c.Slug == "footwear-sports"))
            {
                var footwear = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Footwear & Sports",
                    Slug = "footwear-sports",
                    Description = "Running shoes, sneakers, athletic apparel, and sports gear",
                    Icon = "shoe",
                    DisplayOrder = 5,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var beauty = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Beauty & Personal Care",
                    Slug = "beauty-personal-care",
                    Description = "Skincare, cosmetics, perfumes, and grooming accessories",
                    Icon = "sparkles",
                    DisplayOrder = 6,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                context.Categories.AddRange(footwear, beauty);
                await context.SaveChangesAsync();
            }

            if (!await context.Categories.AnyAsync())
            {
                var clothing = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Clothing & Fashion",
                    Slug = "clothing-fashion",
                    Description = "Men's, women's, and children's apparel, footwear, and accessories",
                    Icon = "shirt",
                    DisplayOrder = 1,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };
                clothing.SubCategories.AddRange(new[]
                {
                    new SubCategory { Id = Guid.NewGuid(), CategoryId = clothing.Id, Name = "Men's Wear", Slug = "mens-wear", Icon = "shirt", DisplayOrder = 1 },
                    new SubCategory { Id = Guid.NewGuid(), CategoryId = clothing.Id, Name = "Women's Wear", Slug = "womens-wear", Icon = "dress", DisplayOrder = 2 },
                    new SubCategory { Id = Guid.NewGuid(), CategoryId = clothing.Id, Name = "Footwear", Slug = "footwear", Icon = "shoe", DisplayOrder = 3 }
                });

                var electronics = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Electronics & Gadgets",
                    Slug = "electronics-gadgets",
                    Description = "Mobile phones, laptops, accessories, and consumer appliances",
                    Icon = "smartphone",
                    DisplayOrder = 2,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };
                electronics.SubCategories.AddRange(new[]
                {
                    new SubCategory { Id = Guid.NewGuid(), CategoryId = electronics.Id, Name = "Mobile Accessories", Slug = "mobile-accessories", Icon = "cable", DisplayOrder = 1 },
                    new SubCategory { Id = Guid.NewGuid(), CategoryId = electronics.Id, Name = "Computers & Laptops", Slug = "computers-laptops", Icon = "laptop", DisplayOrder = 2 }
                });

                var grocery = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Grocery & Essentials",
                    Slug = "grocery-essentials",
                    Description = "Daily groceries, staples, and fresh produce",
                    Icon = "shopping-cart",
                    DisplayOrder = 3,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var pharmacy = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = "Pharmacy & Healthcare",
                    Slug = "pharmacy-healthcare",
                    Description = "Medications, wellness, and personal health supplies",
                    Icon = "pill",
                    DisplayOrder = 4,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                context.Categories.AddRange(clothing, electronics, grocery, pharmacy);
                await context.SaveChangesAsync();
                logger.LogInformation("Seeded initial categories and subcategories.");
            }

            // 4. Seed Sample Stores if database has no shops
            if (!await context.Shops.AnyAsync())
            {
                var adminUser = await context.Users.FirstOrDefaultAsync(u => u.Role == "Admin") ?? await context.Users.FirstAsync();

                var croma = new Shop
                {
                    Id = Guid.NewGuid(),
                    OwnerId = adminUser.Id,
                    Name = "Croma Electronics",
                    Description = "Authorized Electronics Store with live shelf stock",
                    Phone = "+91 422 254 8890",
                    Address = "142 DB Road, RS Puram, Coimbatore",
                    Latitude = 11.0118,
                    Longitude = 76.9525,
                    VerificationStatus = ShopVerificationStatus.Approved,
                    IsActive = true,
                    IsLiveEnabled = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var reliance = new Shop
                {
                    Id = Guid.NewGuid(),
                    OwnerId = adminUser.Id,
                    Name = "Reliance Digital",
                    Description = "Digital electronics and mobile store",
                    Phone = "+91 422 439 1234",
                    Address = "88 DB Road, RS Puram, Coimbatore",
                    Latitude = 11.0145,
                    Longitude = 76.9540,
                    VerificationStatus = ShopVerificationStatus.Approved,
                    IsActive = true,
                    IsLiveEnabled = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var nikeStore = new Shop
                {
                    Id = Guid.NewGuid(),
                    OwnerId = adminUser.Id,
                    Name = "Nike Flagship Store",
                    Description = "Official Nike footwear & sports apparel",
                    Phone = "+91 422 255 9900",
                    Address = "210 DB Road, RS Puram, Coimbatore",
                    Latitude = 11.0180,
                    Longitude = 76.9570,
                    VerificationStatus = ShopVerificationStatus.Approved,
                    IsActive = true,
                    IsLiveEnabled = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                context.Shops.AddRange(croma, reliance, nikeStore);
                await context.SaveChangesAsync();
                logger.LogInformation("Seeded initial sample stores.");
            }

            // 5. Seed Global Brands, Products, Variants, and Store Inventories if none exist
            if (!await context.Products.AnyAsync())
            {
                var electronicsCategory = await context.Categories.FirstOrDefaultAsync(c => c.Slug == "electronics-gadgets") ?? await context.Categories.FirstAsync();
                var footwearCategory = await context.Categories.FirstOrDefaultAsync(c => c.Slug == "footwear-sports") ?? await context.Categories.FirstAsync();

                // Brands
                var sonyBrand = new Brand { Id = Guid.NewGuid(), Name = "Sony", NormalizedName = "SONY", CreatedAtUtc = DateTime.UtcNow };
                var appleBrand = new Brand { Id = Guid.NewGuid(), Name = "Apple", NormalizedName = "APPLE", CreatedAtUtc = DateTime.UtcNow };
                var samsungBrand = new Brand { Id = Guid.NewGuid(), Name = "Samsung", NormalizedName = "SAMSUNG", CreatedAtUtc = DateTime.UtcNow };
                var nikeBrand = new Brand { Id = Guid.NewGuid(), Name = "Nike", NormalizedName = "NIKE", CreatedAtUtc = DateTime.UtcNow };
                var logitechBrand = new Brand { Id = Guid.NewGuid(), Name = "Logitech", NormalizedName = "LOGITECH", CreatedAtUtc = DateTime.UtcNow };

                context.Brands.AddRange(sonyBrand, appleBrand, samsungBrand, nikeBrand, logitechBrand);
                await context.SaveChangesAsync();

                // Products
                var sonyXm5 = new Product
                {
                    Id = Guid.NewGuid(),
                    BrandId = sonyBrand.Id,
                    CategoryId = electronicsCategory.Id,
                    Name = "Sony WH-1000XM5 Wireless Headphones",
                    NormalizedName = "SONY WH 1000XM5 WIRELESS HEADPHONES WH1000XM5 XM5",
                    Description = "Industry-leading noise canceling headphones with two processors and 8 microphones.",
                    ModelNumber = "WH-1000XM5",
                    GTIN = "4548736132580",
                    MPN = "WH1000XM5/B",
                    ImageUrl = "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var iphone15 = new Product
                {
                    Id = Guid.NewGuid(),
                    BrandId = appleBrand.Id,
                    CategoryId = electronicsCategory.Id,
                    Name = "Apple iPhone 15 (128GB)",
                    NormalizedName = "APPLE IPHONE 15 128GB IPHONE15 A3090",
                    Description = "Dynamic Island, 48MP Main camera, and USB-C in a durable color-infused glass design.",
                    ModelNumber = "A3090",
                    GTIN = "195949036507",
                    MPN = "MTP03HN/A",
                    ImageUrl = "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=600&q=80",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var nikeAirMax = new Product
                {
                    Id = Guid.NewGuid(),
                    BrandId = nikeBrand.Id,
                    CategoryId = footwearCategory.Id,
                    Name = "Nike Air Max 270 Sneakers",
                    NormalizedName = "NIKE AIR MAX 270 SNEAKERS AIRMAX270",
                    Description = "Boasts Nike's biggest heel Air unit yet for a super-soft ride that feels as impossible as it looks.",
                    ModelNumber = "AH8050",
                    GTIN = "0886737036495",
                    MPN = "AH8050-002",
                    ImageUrl = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var mxMaster = new Product
                {
                    Id = Guid.NewGuid(),
                    BrandId = logitechBrand.Id,
                    CategoryId = electronicsCategory.Id,
                    Name = "Logitech MX Master 3S Wireless Mouse",
                    NormalizedName = "LOGITECH MX MASTER 3S WIRELESS MOUSE MXM3S",
                    Description = "An iconic mouse remastered for ultimate feel, precision, and performance.",
                    ModelNumber = "MXM3S",
                    GTIN = "097855173783",
                    MPN = "910-006557",
                    ImageUrl = "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=600&q=80",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                context.Products.AddRange(sonyXm5, iphone15, nikeAirMax, mxMaster);

                // Variants
                var xm5VariantBlack = new ProductVariant { Id = Guid.NewGuid(), ProductId = sonyXm5.Id, VariantName = "Black", Color = "Black", GTIN = "4548736132580", SKU = "SNY-XM5-BLK" };
                var iphoneVariantBlack = new ProductVariant { Id = Guid.NewGuid(), ProductId = iphone15.Id, VariantName = "Black 128GB", Color = "Black", Storage = "128GB", GTIN = "195949036507", SKU = "APL-IP15-128-BLK" };
                var airMaxVariant9 = new ProductVariant { Id = Guid.NewGuid(), ProductId = nikeAirMax.Id, VariantName = "UK 9 / Black Red", Color = "Black/Red", Size = "UK 9", GTIN = "0886737036495", SKU = "NKE-AM270-UK9" };
                var mxMasterVariantGraphite = new ProductVariant { Id = Guid.NewGuid(), ProductId = mxMaster.Id, VariantName = "Graphite", Color = "Graphite", GTIN = "097855173783", SKU = "LOG-MX3S-GRP" };

                context.ProductVariants.AddRange(xm5VariantBlack, iphoneVariantBlack, airMaxVariant9, mxMasterVariantGraphite);
                await context.SaveChangesAsync();

                // Store Inventories
                var stores = await context.Shops.ToListAsync();
                var cromaStore = stores.FirstOrDefault(s => s.Name.Contains("Croma")) ?? stores.First();
                var relianceStore = stores.FirstOrDefault(s => s.Name.Contains("Reliance")) ?? stores.Last();
                var nikePhysicalStore = stores.FirstOrDefault(s => s.Name.Contains("Nike")) ?? stores.First();

                var inventories = new List<StoreInventory>
                {
                    // Sony XM5 in Croma & Reliance
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = cromaStore.Id, ProductVariantId = xm5VariantBlack.Id, Price = 26990m, Quantity = 3, AvailableQuantity = 3, ShelfLocation = "Headphones A12", SKU = "CRO-XM5-01", IsActive = true, UpdatedAtUtc = DateTime.UtcNow },
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = relianceStore.Id, ProductVariantId = xm5VariantBlack.Id, Price = 27490m, Quantity = 2, AvailableQuantity = 2, ShelfLocation = "Audio-Shelf-4", SKU = "REL-XM5-02", IsActive = true, UpdatedAtUtc = DateTime.UtcNow },

                    // iPhone 15 in Croma & Reliance
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = cromaStore.Id, ProductVariantId = iphoneVariantBlack.Id, Price = 69900m, Quantity = 5, AvailableQuantity = 5, ShelfLocation = "Mobile Counter 1", SKU = "CRO-IP15-128", IsActive = true, UpdatedAtUtc = DateTime.UtcNow },
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = relianceStore.Id, ProductVariantId = iphoneVariantBlack.Id, Price = 68990m, Quantity = 4, AvailableQuantity = 4, ShelfLocation = "Apple Bay 2", SKU = "REL-IP15-128", IsActive = true, UpdatedAtUtc = DateTime.UtcNow },

                    // Nike Air Max in Nike Store
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = nikePhysicalStore.Id, ProductVariantId = airMaxVariant9.Id, Price = 13495m, Quantity = 4, AvailableQuantity = 4, ShelfLocation = "Footwear Rack 07", SKU = "NKE-AM270-01", IsActive = true, UpdatedAtUtc = DateTime.UtcNow },

                    // MX Master 3S in Croma
                    new StoreInventory { Id = Guid.NewGuid(), StoreId = cromaStore.Id, ProductVariantId = mxMasterVariantGraphite.Id, Price = 9495m, Quantity = 6, AvailableQuantity = 6, ShelfLocation = "Accessories B03", SKU = "CRO-MX3S-01", IsActive = true, UpdatedAtUtc = DateTime.UtcNow }
                };

                context.StoreInventories.AddRange(inventories);
                await context.SaveChangesAsync();
                logger.LogInformation("Seeded canonical global products, variants, and store inventory records.");
            }

            // 6. Seed Timed Geo-Targeted Premium Advertisement if none exists
            if (!await context.PremiumAdvertisements.AnyAsync())
            {
                var sampleShop = await context.Shops.FirstOrDefaultAsync();
                if (sampleShop != null)
                {
                    context.PremiumAdvertisements.Add(new PremiumAdvertisement
                    {
                        Id = Guid.NewGuid(),
                        ShopId = sampleShop.Id,
                        Title = "Exclusive RS Puram Flash Sale: 25% Off In-Store",
                        Description = "Special timed walk-in offer for Zooner shoppers near RS Puram & Race Course.",
                        TargetCategory = "running-shoes",
                        TargetRadiusKm = 10.0,
                        StartTimeUtc = DateTime.UtcNow.AddMinutes(-30),
                        EndTimeUtc = DateTime.UtcNow.AddHours(3), // 3-hour timed deal
                        OfferTag = "PREMIUM 25% OFF",
                        IsActive = true,
                        IsPremiumMerchantOnly = true
                    });
                    await context.SaveChangesAsync();
                    logger.LogInformation("Seeded initial targeted timed premium advertisement.");
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error occurred during initial data seeding.");
        }
    }

    private static async Task EnsureTablesExistAsync(AppDbContext context, ILogger logger)
    {
        try
        {
            if (context.Database.IsNpgsql())
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""Brands"" (
                        ""Id"" uuid NOT NULL,
                        ""Name"" character varying(150) NOT NULL,
                        ""NormalizedName"" character varying(150) NOT NULL,
                        ""LogoUrl"" text,
                        ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                        CONSTRAINT ""PK_Brands"" PRIMARY KEY (""Id"")
                    );

                    CREATE TABLE IF NOT EXISTS ""Products"" (
                        ""Id"" uuid NOT NULL,
                        ""BrandId"" uuid NOT NULL,
                        ""CategoryId"" uuid NOT NULL,
                        ""Name"" character varying(200) NOT NULL,
                        ""Description"" character varying(2000),
                        ""ModelNumber"" character varying(100),
                        ""GTIN"" character varying(50),
                        ""MPN"" character varying(100),
                        ""ImageUrl"" text,
                        ""NormalizedName"" character varying(200) NOT NULL,
                        ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                        ""UpdatedAtUtc"" timestamp with time zone,
                        ""IsActive"" boolean NOT NULL DEFAULT TRUE,
                        CONSTRAINT ""PK_Products"" PRIMARY KEY (""Id""),
                        CONSTRAINT ""FK_Products_Brands_BrandId"" FOREIGN KEY (""BrandId"") REFERENCES ""Brands"" (""Id"") ON DELETE CASCADE,
                        CONSTRAINT ""FK_Products_Categories_CategoryId"" FOREIGN KEY (""CategoryId"") REFERENCES ""Categories"" (""Id"") ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS ""ProductVariants"" (
                        ""Id"" uuid NOT NULL,
                        ""ProductId"" uuid NOT NULL,
                        ""VariantName"" character varying(100) NOT NULL,
                        ""Color"" character varying(50),
                        ""Size"" character varying(50),
                        ""Storage"" character varying(50),
                        ""GTIN"" character varying(50),
                        ""SKU"" character varying(100),
                        ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                        ""UpdatedAtUtc"" timestamp with time zone,
                        ""IsActive"" boolean NOT NULL DEFAULT TRUE,
                        CONSTRAINT ""PK_ProductVariants"" PRIMARY KEY (""Id""),
                        CONSTRAINT ""FK_ProductVariants_Products_ProductId"" FOREIGN KEY (""ProductId"") REFERENCES ""Products"" (""Id"") ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS ""StoreInventories"" (
                        ""Id"" uuid NOT NULL,
                        ""StoreId"" uuid NOT NULL,
                        ""ProductVariantId"" uuid NOT NULL,
                        ""SKU"" character varying(100),
                        ""Price"" numeric(18,2) NOT NULL,
                        ""Quantity"" integer NOT NULL,
                        ""AvailableQuantity"" integer NOT NULL,
                        ""ShelfLocation"" character varying(100),
                        ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                        ""IsActive"" boolean NOT NULL DEFAULT TRUE,
                        CONSTRAINT ""PK_StoreInventories"" PRIMARY KEY (""Id""),
                        CONSTRAINT ""FK_StoreInventories_ProductVariants_ProductVariantId"" FOREIGN KEY (""ProductVariantId"") REFERENCES ""ProductVariants"" (""Id"") ON DELETE CASCADE,
                        CONSTRAINT ""FK_StoreInventories_Shops_StoreId"" FOREIGN KEY (""StoreId"") REFERENCES ""Shops"" (""Id"") ON DELETE CASCADE
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS ""IX_StoreInventories_StoreId_ProductVariantId"" ON ""StoreInventories"" (""StoreId"", ""ProductVariantId"");
                ");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Catalog schema verification completed.");
        }
    }
}
