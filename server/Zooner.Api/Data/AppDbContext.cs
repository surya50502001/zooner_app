using Microsoft.EntityFrameworkCore;
using Zooner.Api.Models;

namespace Zooner.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<SubCategory> SubCategories => Set<SubCategory>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<StoreInventory> StoreInventories => Set<StoreInventory>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<ShopCategory> ShopCategories => Set<ShopCategory>();
    public DbSet<ShopOperatingHour> ShopOperatingHours => Set<ShopOperatingHour>();
    public DbSet<LiveRequest> LiveRequests => Set<LiveRequest>();
    public DbSet<ShopResponse> ShopResponses => Set<ShopResponse>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<BusinessSetting> BusinessSettings => Set<BusinessSetting>();
    public DbSet<AdminAction> AdminActions => Set<AdminAction>();
    public DbSet<PremiumAdvertisement> PremiumAdvertisements => Set<PremiumAdvertisement>();
    public DbSet<InventoryHold> InventoryHolds => Set<InventoryHold>();
    public DbSet<WaitlistEntry> WaitlistEntries => Set<WaitlistEntry>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        base.ConfigureConventions(configurationBuilder);
        // Ensure compatibility for providers like SQLite where Guids/DateTimes need consistent string representation
        if (Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite")
        {
            configurationBuilder.Properties<Guid>().HaveConversion<string>();
            configurationBuilder.Properties<DateTime>().HaveConversion<string>();
            configurationBuilder.Properties<DateTime?>().HaveConversion<string>();
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.HasIndex(u => u.Email).IsUnique();
            entity.HasIndex(u => u.GoogleSubject);
            entity.Property(u => u.Email).IsRequired().HasMaxLength(256);
            entity.Property(u => u.FullName).IsRequired().HasMaxLength(100);
            entity.Property(u => u.GoogleSubject).HasMaxLength(256);
            entity.Property(u => u.Role).HasMaxLength(50).HasDefaultValue("Customer");
        });

        // RefreshToken
        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(rt => rt.Id);
            entity.HasIndex(rt => rt.Token).IsUnique();
            entity.Property(rt => rt.Token).IsRequired();

            entity.HasOne(rt => rt.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(rt => rt.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Category
        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasIndex(c => c.Name).IsUnique();
            entity.HasIndex(c => c.Slug).IsUnique();
            entity.HasIndex(c => new { c.IsActive, c.DisplayOrder });
            entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
            entity.Property(c => c.Slug).IsRequired().HasMaxLength(120);
        });

        // SubCategory
        modelBuilder.Entity<SubCategory>(entity =>
        {
            entity.HasKey(sc => sc.Id);
            entity.HasIndex(sc => new { sc.CategoryId, sc.Slug }).IsUnique();
            entity.HasIndex(sc => new { sc.IsActive, sc.DisplayOrder });
            entity.Property(sc => sc.Name).IsRequired().HasMaxLength(100);
            entity.Property(sc => sc.Slug).IsRequired().HasMaxLength(120);

            entity.HasOne(sc => sc.Category)
                .WithMany(c => c.SubCategories)
                .HasForeignKey(sc => sc.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Shop
        modelBuilder.Entity<Shop>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.HasIndex(s => s.OwnerId);
            entity.HasIndex(s => new { s.Latitude, s.Longitude });
            entity.HasIndex(s => new { s.IsActive, s.IsLiveEnabled, s.VerificationStatus });
            entity.Property(s => s.Name).IsRequired().HasMaxLength(150);
            entity.Property(s => s.Phone).IsRequired().HasMaxLength(20);
            entity.Property(s => s.Address).IsRequired().HasMaxLength(300);

            entity.HasOne(s => s.Owner)
                .WithMany(u => u.Shops)
                .HasForeignKey(s => s.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ShopCategory (Many-to-Many join table)
        modelBuilder.Entity<ShopCategory>(entity =>
        {
            entity.HasKey(sc => new { sc.ShopId, sc.CategoryId });

            entity.HasOne(sc => sc.Shop)
                .WithMany(s => s.ShopCategories)
                .HasForeignKey(sc => sc.ShopId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(sc => sc.Category)
                .WithMany(c => c.ShopCategories)
                .HasForeignKey(sc => sc.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ShopOperatingHour
        modelBuilder.Entity<ShopOperatingHour>(entity =>
        {
            entity.HasKey(soh => soh.Id);
            entity.HasIndex(soh => new { soh.ShopId, soh.DayOfWeek });

            entity.HasOne(soh => soh.Shop)
                .WithMany(s => s.OperatingHours)
                .HasForeignKey(soh => soh.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // LiveRequest
        modelBuilder.Entity<LiveRequest>(entity =>
        {
            entity.HasKey(lr => lr.Id);
            entity.HasIndex(lr => lr.CustomerId);
            entity.HasIndex(lr => lr.CategoryId);
            entity.HasIndex(lr => new { lr.Latitude, lr.Longitude });
            entity.HasIndex(lr => new { lr.Status, lr.ExpiresAtUtc });

            entity.Property(lr => lr.RequestText).IsRequired().HasMaxLength(500);

            entity.HasOne(lr => lr.Customer)
                .WithMany(u => u.LiveRequests)
                .HasForeignKey(lr => lr.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(lr => lr.Category)
                .WithMany(c => c.LiveRequests)
                .HasForeignKey(lr => lr.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(lr => lr.SubCategory)
                .WithMany(sc => sc.LiveRequests)
                .HasForeignKey(lr => lr.SubCategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(lr => lr.SelectedShop)
                .WithMany()
                .HasForeignKey(lr => lr.SelectedShopId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ShopResponse (AVAILABLE responses with uniqueness constraint)
        modelBuilder.Entity<ShopResponse>(entity =>
        {
            entity.HasKey(sr => sr.Id);
            // CRITICAL: Prevent duplicate responses from the same shop for the same live request
            entity.HasIndex(sr => new { sr.LiveRequestId, sr.ShopId }).IsUnique();

            entity.HasOne(sr => sr.LiveRequest)
                .WithMany(lr => lr.Responses)
                .HasForeignKey(sr => sr.LiveRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(sr => sr.Shop)
                .WithMany(s => s.Responses)
                .HasForeignKey(sr => sr.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Notification
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(n => n.Id);
            entity.HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAtUtc });

            entity.Property(n => n.Title).IsRequired().HasMaxLength(150);
            entity.Property(n => n.Message).IsRequired().HasMaxLength(500);

            entity.HasOne(n => n.User)
                .WithMany(u => u.Notifications)
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Conversation
        modelBuilder.Entity<Conversation>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasIndex(c => c.LiveRequestId);
            entity.HasIndex(c => new { c.CustomerId, c.ShopId });

            entity.HasOne(c => c.LiveRequest)
                .WithMany(lr => lr.Conversations)
                .HasForeignKey(c => c.LiveRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.Customer)
                .WithMany()
                .HasForeignKey(c => c.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.Shop)
                .WithMany(s => s.Conversations)
                .HasForeignKey(c => c.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ChatMessage
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(cm => cm.Id);
            entity.HasIndex(cm => new { cm.ConversationId, cm.CreatedAtUtc });

            entity.Property(cm => cm.MessageText).IsRequired().HasMaxLength(2000);

            entity.HasOne(cm => cm.Conversation)
                .WithMany(c => c.Messages)
                .HasForeignKey(cm => cm.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(cm => cm.Sender)
                .WithMany()
                .HasForeignKey(cm => cm.SenderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Report
        modelBuilder.Entity<Report>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.HasIndex(r => r.ReporterId);
            entity.HasIndex(r => new { r.TargetType, r.TargetId });
            entity.HasIndex(r => r.Status);

            entity.Property(r => r.TargetType).IsRequired().HasMaxLength(50);
            entity.Property(r => r.Reason).IsRequired().HasMaxLength(100);

            entity.HasOne(r => r.Reporter)
                .WithMany(u => u.ReportsFiled)
                .HasForeignKey(r => r.ReporterId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // BusinessSetting
        modelBuilder.Entity<BusinessSetting>(entity =>
        {
            entity.HasKey(bs => bs.Key);
            entity.Property(bs => bs.Key).HasMaxLength(100);
            entity.Property(bs => bs.Value).IsRequired().HasMaxLength(500);
        });

        // AdminAction
        modelBuilder.Entity<AdminAction>(entity =>
        {
            entity.HasKey(al => al.Id);
            entity.HasIndex(al => new { al.TargetEntity, al.TargetId });
            entity.HasIndex(al => al.TimestampUtc);

            entity.Property(al => al.Action).IsRequired().HasMaxLength(100);
            entity.Property(al => al.TargetEntity).IsRequired().HasMaxLength(100);

            entity.HasOne(al => al.AdminUser)
                .WithMany()
                .HasForeignKey(al => al.AdminUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Brand
        modelBuilder.Entity<Brand>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.HasIndex(b => b.Name);
            entity.HasIndex(b => b.NormalizedName).IsUnique();
        });

        // Product
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.HasIndex(p => p.Name);
            entity.HasIndex(p => p.NormalizedName);
            entity.HasIndex(p => p.GTIN);
            entity.HasIndex(p => p.ModelNumber);
            entity.HasIndex(p => new { p.CategoryId, p.IsActive });

            entity.HasOne(p => p.Brand)
                .WithMany(b => b.Products)
                .HasForeignKey(p => p.BrandId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(p => p.Category)
                .WithMany()
                .HasForeignKey(p => p.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ProductVariant
        modelBuilder.Entity<ProductVariant>(entity =>
        {
            entity.HasKey(pv => pv.Id);
            entity.HasIndex(pv => pv.ProductId);
            entity.HasIndex(pv => pv.GTIN);
            entity.HasIndex(pv => pv.SKU);

            entity.HasOne(pv => pv.Product)
                .WithMany(p => p.Variants)
                .HasForeignKey(pv => pv.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // StoreInventory
        modelBuilder.Entity<StoreInventory>(entity =>
        {
            entity.HasKey(si => si.Id);
            entity.HasIndex(si => new { si.StoreId, si.ProductVariantId }).IsUnique();
            entity.HasIndex(si => new { si.IsActive, si.Price });
            entity.HasIndex(si => si.AvailableQuantity);

            entity.HasOne(si => si.Store)
                .WithMany()
                .HasForeignKey(si => si.StoreId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(si => si.ProductVariant)
                .WithMany(pv => pv.Inventories)
                .HasForeignKey(si => si.ProductVariantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // InventoryHold
        modelBuilder.Entity<InventoryHold>(entity =>
        {
            entity.HasKey(ih => ih.Id);
            entity.HasIndex(ih => new { ih.CustomerId, ih.Status });
            entity.HasIndex(ih => new { ih.StoreInventoryId, ih.Status });
            entity.HasIndex(ih => ih.ExpiresAtUtc);

            entity.HasOne(ih => ih.StoreInventory)
                .WithMany()
                .HasForeignKey(ih => ih.StoreInventoryId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ih => ih.Store)
                .WithMany()
                .HasForeignKey(ih => ih.StoreId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ih => ih.Customer)
                .WithMany()
                .HasForeignKey(ih => ih.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // WaitlistEntry
        modelBuilder.Entity<WaitlistEntry>(entity =>
        {
            entity.HasKey(w => w.Id);
            entity.HasIndex(w => w.Email).IsUnique();
            entity.HasIndex(w => w.CreatedAtUtc);
            entity.Property(w => w.Email).IsRequired().HasMaxLength(256);
            entity.Property(w => w.City).HasMaxLength(100);
            entity.Property(w => w.UserType).IsRequired().HasMaxLength(50);
            entity.Property(w => w.IpAddress).HasMaxLength(45);
            entity.Property(w => w.CreatedAtUtc).IsRequired();
        });
    }
}

