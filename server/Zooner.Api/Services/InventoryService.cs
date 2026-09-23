using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Services;

public class InventoryService : IInventoryService
{
    private readonly AppDbContext _context;
    private readonly ILogger<InventoryService> _logger;

    public InventoryService(AppDbContext context, ILogger<InventoryService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<ApiResponse<List<StoreInventoryDetailDto>>> GetStoreInventoryAsync(
        Guid storeId,
        string? search,
        Guid? categoryId,
        Guid? requestingUserId = null,
        bool isAdmin = false,
        int page = 1,
        int pageSize = 50)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<List<StoreInventoryDetailDto>>.ErrorResponse("Store not found.");
        }

        bool isOwner = requestingUserId.HasValue && store.OwnerId == requestingUserId.Value;

        // Public visibility rules: Store must be Approved, Active, and LiveEnabled
        // UNLESS the caller is the store owner or an administrator.
        if (!isOwner && !isAdmin)
        {
            if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive || !store.IsLiveEnabled)
            {
                return ApiResponse<List<StoreInventoryDetailDto>>.ErrorResponse("Store not found or currently unavailable.");
            }
        }

        var dbQuery = _context.StoreInventories
            .Include(si => si.ProductVariant)
                .ThenInclude(pv => pv!.Product)
                    .ThenInclude(p => p!.Brand)
            .Where(si => si.StoreId == storeId && si.IsActive)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var cleanSearch = search.Trim().ToLower();
            dbQuery = dbQuery.Where(si =>
                (si.ProductVariant != null && si.ProductVariant.Product != null &&
                    (si.ProductVariant.Product.Name.ToLower().Contains(cleanSearch) ||
                     (si.ProductVariant.Product.Brand != null && si.ProductVariant.Product.Brand.Name.ToLower().Contains(cleanSearch)) ||
                     (si.ProductVariant.Product.ModelNumber != null && si.ProductVariant.Product.ModelNumber.ToLower().Contains(cleanSearch)))) ||
                (si.ShelfLocation != null && si.ShelfLocation.ToLower().Contains(cleanSearch)) ||
                (si.SKU != null && si.SKU.ToLower().Contains(cleanSearch))
            );
        }

        if (categoryId.HasValue)
        {
            dbQuery = dbQuery.Where(si => si.ProductVariant != null && 
                                          si.ProductVariant.Product != null && 
                                          si.ProductVariant.Product.CategoryId == categoryId.Value);
        }

        var clampedPage = Math.Max(1, page);
        var clampedPageSize = Math.Clamp(pageSize, 1, 100);

        var inventories = await dbQuery
            .OrderByDescending(si => si.UpdatedAtUtc)
            .Skip((clampedPage - 1) * clampedPageSize)
            .Take(clampedPageSize)
            .ToListAsync();

        var dtos = inventories.Select(inv => new StoreInventoryDetailDto
        {
            InventoryId = inv.Id,
            StoreId = inv.StoreId,
            StoreName = store.Name,
            StoreAddress = store.Address,
            StorePhone = store.Phone,
            Latitude = store.Latitude,
            Longitude = store.Longitude,
            IsStoreOpen = store.IsLiveEnabled,
            VariantId = inv.ProductVariantId,
            VariantName = inv.ProductVariant?.VariantName ?? "Default",
            Price = inv.Price,
            Quantity = inv.Quantity,
            AvailableQuantity = inv.AvailableQuantity,
            ShelfLocation = inv.ShelfLocation,
            UpdatedAtUtc = inv.UpdatedAtUtc
        }).ToList();

        return ApiResponse<List<StoreInventoryDetailDto>>.SuccessResponse(dtos);
    }

    public async Task<ApiResponse<StoreInventoryDetailDto>> AddStoreInventoryAsync(
        Guid storeId,
        Guid ownerUserId,
        AddStoreInventoryRequest request)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Store not found.");
        }

        // Verify Store Ownership and Status
        if (store.OwnerId != ownerUserId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == ownerUserId);
            if (user == null || !user.IsAdmin)
            {
                return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Unauthorized: You do not own this store.");
            }
        }
        else if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Store is not active or approved.");
        }

        var variant = await _context.ProductVariants
            .Include(pv => pv.Product)
            .FirstOrDefaultAsync(pv => pv.Id == request.ProductVariantId && pv.IsActive);

        if (variant == null)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Product variant not found.");
        }

        // Check if inventory already exists for this variant in this store
        var existing = await _context.StoreInventories
            .FirstOrDefaultAsync(si => si.StoreId == storeId && si.ProductVariantId == request.ProductVariantId);

        if (request.Price < 0)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Price cannot be negative.");
        }

        if (request.Quantity < 0)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Quantity cannot be negative.");
        }

        if (existing != null)
        {
            var reservedCount = Math.Max(0, existing.Quantity - existing.AvailableQuantity);
            if (request.Quantity < reservedCount)
            {
                return ApiResponse<StoreInventoryDetailDto>.ErrorResponse(
                    $"Cannot reduce total quantity ({request.Quantity}) below currently reserved quantity ({reservedCount}). Please fulfill or wait for active customer holds to expire first.");
            }

            existing.Price = request.Price;
            existing.Quantity = request.Quantity;
            existing.AvailableQuantity = request.Quantity - reservedCount;
            existing.ShelfLocation = request.ShelfLocation ?? existing.ShelfLocation;
            existing.SKU = request.SKU ?? existing.SKU;
            existing.IsActive = true;
            existing.UpdatedAtUtc = DateTime.UtcNow;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException ex)
            {
                _logger.LogWarning(ex, "Concurrency conflict updating inventory {InventoryId}", existing.Id);
                return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Inventory was modified concurrently by another process. Please refresh and try again.");
            }

            return ApiResponse<StoreInventoryDetailDto>.SuccessResponse(new StoreInventoryDetailDto
            {
                InventoryId = existing.Id,
                StoreId = store.Id,
                StoreName = store.Name,
                StoreAddress = store.Address,
                StorePhone = store.Phone,
                Latitude = store.Latitude,
                Longitude = store.Longitude,
                IsStoreOpen = store.IsLiveEnabled,
                VariantId = variant.Id,
                VariantName = variant.VariantName,
                Price = existing.Price,
                Quantity = existing.Quantity,
                AvailableQuantity = existing.AvailableQuantity,
                ShelfLocation = existing.ShelfLocation,
                UpdatedAtUtc = existing.UpdatedAtUtc
            }, "Updated existing store inventory.");
        }

        var inventory = new StoreInventory
        {
            Id = Guid.NewGuid(),
            StoreId = storeId,
            ProductVariantId = request.ProductVariantId,
            SKU = request.SKU,
            Price = request.Price,
            Quantity = request.Quantity,
            AvailableQuantity = request.Quantity, // Initially available equals total quantity
            ShelfLocation = request.ShelfLocation,
            IsActive = true,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _context.StoreInventories.Add(inventory);
        await _context.SaveChangesAsync();

        return ApiResponse<StoreInventoryDetailDto>.SuccessResponse(new StoreInventoryDetailDto
        {
            InventoryId = inventory.Id,
            StoreId = store.Id,
            StoreName = store.Name,
            StoreAddress = store.Address,
            StorePhone = store.Phone,
            Latitude = store.Latitude,
            Longitude = store.Longitude,
            IsStoreOpen = store.IsLiveEnabled,
            VariantId = variant.Id,
            VariantName = variant.VariantName,
            Price = inventory.Price,
            Quantity = inventory.Quantity,
            AvailableQuantity = inventory.AvailableQuantity,
            ShelfLocation = inventory.ShelfLocation,
            UpdatedAtUtc = inventory.UpdatedAtUtc
        }, "Added product to store inventory successfully.");
    }

    public async Task<ApiResponse<StoreInventoryDetailDto>> UpdateStoreInventoryAsync(
        Guid storeId,
        Guid inventoryId,
        Guid ownerUserId,
        UpdateStoreInventoryRequest request)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Store not found.");
        }

        if (store.OwnerId != ownerUserId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == ownerUserId);
            if (user == null || !user.IsAdmin)
            {
                return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Unauthorized: You do not own this store.");
            }
        }
        else if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Store is not active or approved.");
        }

        var inventory = await _context.StoreInventories
            .Include(si => si.ProductVariant)
            .FirstOrDefaultAsync(si => si.Id == inventoryId && si.StoreId == storeId);

        if (inventory == null)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Inventory record not found.");
        }

        if (request.Price < 0)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Price cannot be negative.");
        }

        if (request.Quantity < 0)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Quantity cannot be negative.");
        }

        var reservedCount = Math.Max(0, inventory.Quantity - inventory.AvailableQuantity);
        if (request.Quantity < reservedCount)
        {
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse(
                $"Cannot reduce total quantity ({request.Quantity}) below currently reserved quantity ({reservedCount}). Please fulfill or wait for active customer holds to expire first.");
        }

        inventory.Price = request.Price;
        inventory.Quantity = request.Quantity;
        inventory.AvailableQuantity = request.Quantity - reservedCount;
        inventory.ShelfLocation = request.ShelfLocation;
        inventory.IsActive = request.IsActive;
        inventory.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Concurrency conflict updating inventory {InventoryId}", inventoryId);
            return ApiResponse<StoreInventoryDetailDto>.ErrorResponse("Inventory was modified concurrently by another process. Please refresh and try again.");
        }

        return ApiResponse<StoreInventoryDetailDto>.SuccessResponse(new StoreInventoryDetailDto
        {
            InventoryId = inventory.Id,
            StoreId = store.Id,
            StoreName = store.Name,
            StoreAddress = store.Address,
            StorePhone = store.Phone,
            Latitude = store.Latitude,
            Longitude = store.Longitude,
            IsStoreOpen = store.IsLiveEnabled,
            VariantId = inventory.ProductVariantId,
            VariantName = inventory.ProductVariant?.VariantName ?? "Default",
            Price = inventory.Price,
            Quantity = inventory.Quantity,
            AvailableQuantity = inventory.AvailableQuantity,
            ShelfLocation = inventory.ShelfLocation,
            UpdatedAtUtc = inventory.UpdatedAtUtc
        }, "Updated store inventory successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteStoreInventoryAsync(Guid storeId, Guid inventoryId, Guid ownerUserId)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<bool>.ErrorResponse("Store not found.");
        }

        if (store.OwnerId != ownerUserId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == ownerUserId);
            if (user == null || !user.IsAdmin)
            {
                return ApiResponse<bool>.ErrorResponse("Unauthorized: You do not own this store.");
            }
        }
        else if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive)
        {
            return ApiResponse<bool>.ErrorResponse("Store is not active or approved.");
        }

        var inventory = await _context.StoreInventories.FirstOrDefaultAsync(si => si.Id == inventoryId && si.StoreId == storeId);
        if (inventory == null)
        {
            return ApiResponse<bool>.ErrorResponse("Inventory record not found.");
        }

        inventory.IsActive = false;
        inventory.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return ApiResponse<bool>.SuccessResponse(true, "Inventory record deactivated.");
    }

    public async Task<ApiResponse<InventoryHoldDto>> ReserveInventoryHoldAsync(
        Guid storeId,
        Guid inventoryId,
        Guid customerId,
        int quantityToHold = 1)
    {
        if (quantityToHold < 1 || quantityToHold > 5)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Quantity to hold must be between 1 and 5 items.");
        }

        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId && s.IsActive && s.IsLiveEnabled && s.VerificationStatus == ShopVerificationStatus.Approved);
        if (store == null)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Store is not active, verified, or live-enabled for reservations.");
        }

        var inventory = await _context.StoreInventories
            .Include(si => si.ProductVariant)
            .ThenInclude(pv => pv!.Product)
            .FirstOrDefaultAsync(si => si.Id == inventoryId && si.StoreId == storeId && si.IsActive);

        if (inventory == null)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Inventory record not found for this store.");
        }

        // Clean up any naturally expired holds for this inventory item before checking stock
        var expiredHolds = await _context.InventoryHolds
            .Where(ih => ih.StoreInventoryId == inventoryId && ih.Status == InventoryHoldStatus.Active && ih.ExpiresAtUtc <= DateTime.UtcNow)
            .ToListAsync();

        if (expiredHolds.Any())
        {
            foreach (var eh in expiredHolds)
            {
                eh.Status = InventoryHoldStatus.Expired;
                inventory.AvailableQuantity = Math.Min(inventory.Quantity, inventory.AvailableQuantity + eh.Quantity);
            }
            await _context.SaveChangesAsync();
        }

        // Prevent duplicate concurrent active holds by the same customer on the same product item
        var existingCustomerHold = await _context.InventoryHolds
            .AnyAsync(ih => ih.StoreInventoryId == inventoryId && ih.CustomerId == customerId && ih.Status == InventoryHoldStatus.Active && ih.ExpiresAtUtc > DateTime.UtcNow);

        if (existingCustomerHold)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("You already have an active hold pass for this item.");
        }

        if (inventory.AvailableQuantity < quantityToHold)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse($"Insufficient stock for 30-min hold. Available: {inventory.AvailableQuantity}");
        }

        // Atomic deduction
        inventory.AvailableQuantity -= quantityToHold;
        inventory.UpdatedAtUtc = DateTime.UtcNow;

        var holdCode = GenerateSecureHoldCode();
        var holdId = Guid.NewGuid();
        var secureBytes = new byte[16];
        System.Security.Cryptography.RandomNumberGenerator.Fill(secureBytes);
        var qrToken = $"zhold:{holdId}:{holdCode}:{Convert.ToHexString(secureBytes).ToLowerInvariant()}";
        var hold = new InventoryHold
        {
            Id = holdId,
            StoreInventoryId = inventory.Id,
            StoreId = store.Id,
            CustomerId = customerId,
            Quantity = quantityToHold,
            HoldCode = holdCode,
            QrToken = qrToken,
            Status = InventoryHoldStatus.Active,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30),
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.InventoryHolds.Add(hold);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(ex, "Concurrency conflict reserving inventory hold for item {InventoryId}", inventoryId);
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Item was just reserved by another customer or stock changed. Please refresh and try again.");
        }

        var dto = new InventoryHoldDto
        {
            HoldId = hold.Id,
            StoreInventoryId = inventory.Id,
            StoreId = store.Id,
            StoreName = store.Name,
            StoreAddress = store.Address,
            StorePhone = store.Phone,
            ProductName = inventory.ProductVariant?.Product?.Name ?? "Product Item",
            VariantName = inventory.ProductVariant?.VariantName ?? "Standard",
            Price = inventory.Price,
            Quantity = hold.Quantity,
            HoldCode = hold.HoldCode,
            QrToken = hold.QrToken,
            Status = hold.Status.ToString(),
            ExpiresAtUtc = hold.ExpiresAtUtc,
            CreatedAtUtc = hold.CreatedAtUtc
        };

        return ApiResponse<InventoryHoldDto>.SuccessResponse(dto, $"Reserved {quantityToHold} item(s) for 30 minutes with code {holdCode}.");
    }

    public async Task<ApiResponse<bool>> ReleaseInventoryHoldAsync(
        Guid storeId,
        Guid inventoryId,
        Guid holdId,
        Guid requestingUserId)
    {
        var hold = await _context.InventoryHolds
            .Include(ih => ih.Store)
            .Include(ih => ih.StoreInventory)
            .FirstOrDefaultAsync(ih => ih.Id == holdId && ih.StoreId == storeId && ih.StoreInventoryId == inventoryId);

        if (hold == null)
        {
            return ApiResponse<bool>.ErrorResponse("Hold reservation not found.");
        }

        // Authorization: Only the Customer who reserved it, the Store Owner, or an Admin can release it
        var isCustomer = hold.CustomerId == requestingUserId;
        var isStoreOwner = hold.Store?.OwnerId == requestingUserId;
        var isAdmin = await _context.Users.AnyAsync(u => u.Id == requestingUserId && u.Role == "Admin");


        if (!isCustomer && !isStoreOwner && !isAdmin)
        {
            return ApiResponse<bool>.ErrorResponse("Unauthorized: You do not have permission to release this hold pass.");
        }

        if (hold.Status != InventoryHoldStatus.Active)
        {
            return ApiResponse<bool>.ErrorResponse($"Hold is already in '{hold.Status}' status.");
        }

        hold.Status = InventoryHoldStatus.Released;
        hold.ReleasedAtUtc = DateTime.UtcNow;

        if (hold.StoreInventory != null)
        {
            hold.StoreInventory.AvailableQuantity = Math.Min(hold.StoreInventory.Quantity, hold.StoreInventory.AvailableQuantity + hold.Quantity);
            hold.StoreInventory.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return ApiResponse<bool>.SuccessResponse(true, "Hold pass released and inventory restored to available stock.");
    }

    public async Task<ApiResponse<List<InventoryHoldDto>>> GetActiveHoldsForCustomerAsync(Guid customerId)
    {
        // Expire any outdated holds first
        var expired = await _context.InventoryHolds
            .Include(ih => ih.StoreInventory)
            .Where(ih => ih.CustomerId == customerId && ih.Status == InventoryHoldStatus.Active && ih.ExpiresAtUtc <= DateTime.UtcNow)
            .ToListAsync();

        if (expired.Any())
        {
            foreach (var eh in expired)
            {
                eh.Status = InventoryHoldStatus.Expired;
                if (eh.StoreInventory != null)
                {
                    eh.StoreInventory.AvailableQuantity = Math.Min(eh.StoreInventory.Quantity, eh.StoreInventory.AvailableQuantity + eh.Quantity);
                }
            }
            await _context.SaveChangesAsync();
        }

        var activeHolds = await _context.InventoryHolds
            .Where(ih => ih.CustomerId == customerId && ih.Status == InventoryHoldStatus.Active)
            .Include(ih => ih.Store)
            .Include(ih => ih.StoreInventory)
                .ThenInclude(si => si!.ProductVariant)
                .ThenInclude(pv => pv!.Product)
            .OrderByDescending(ih => ih.CreatedAtUtc)
            .AsNoTracking()
            .ToListAsync();

        var dtos = activeHolds.Select(h => new InventoryHoldDto
        {
            HoldId = h.Id,
            StoreInventoryId = h.StoreInventoryId,
            StoreId = h.StoreId,
            StoreName = h.Store?.Name ?? string.Empty,
            StoreAddress = h.Store?.Address ?? string.Empty,
            StorePhone = h.Store?.Phone ?? string.Empty,
            ProductName = h.StoreInventory?.ProductVariant?.Product?.Name ?? "Product Item",
            VariantName = h.StoreInventory?.ProductVariant?.VariantName ?? "Standard",
            Price = h.StoreInventory?.Price ?? 0,
            Quantity = h.Quantity,
            HoldCode = h.HoldCode,
            QrToken = string.IsNullOrEmpty(h.QrToken) ? $"zhold:{h.Id}:{h.HoldCode}" : h.QrToken,
            Status = h.Status.ToString(),
            ExpiresAtUtc = h.ExpiresAtUtc,
            CreatedAtUtc = h.CreatedAtUtc
        }).ToList();

        return ApiResponse<List<InventoryHoldDto>>.SuccessResponse(dtos);
    }

    public async Task<ApiResponse<ValidateHoldQrResponse>> ValidateHoldQrAsync(
        Guid storeId,
        string qrTokenOrCode,
        Guid vendorUserId)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "Store not found."
            });
        }

        if (store.OwnerId != vendorUserId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == vendorUserId);
            if (user == null || !user.IsAdmin)
            {
                return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
                {
                    IsValid = false,
                    Message = "Unauthorized: You do not own this store."
                });
            }
        }
        var cleanToken = (qrTokenOrCode ?? string.Empty).Trim();
        var hold = await _context.InventoryHolds
            .Include(h => h.Store)
            .Include(h => h.StoreInventory)
                .ThenInclude(si => si!.ProductVariant)
                .ThenInclude(pv => pv!.Product)
            .FirstOrDefaultAsync(h => h.QrToken == cleanToken || h.HoldCode == cleanToken);

        if (hold == null)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "Invalid QR pass code: Reservation record not found."
            });
        }

        if (hold.StoreId != storeId)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = $"Hold reservation belongs to a different store ('{hold.Store?.Name}')."
            });
        }

        if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "Store is not active or approved."
            });
        }

        if (hold.Status == InventoryHoldStatus.Fulfilled)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "This hold pass has already been collected."
            });
        }

        if (hold.Status == InventoryHoldStatus.Released)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "This hold pass was cancelled or released."
            });
        }

        if (hold.ExpiresAtUtc <= DateTime.UtcNow || hold.Status == InventoryHoldStatus.Expired)
        {
            if (hold.Status == InventoryHoldStatus.Active)
            {
                hold.Status = InventoryHoldStatus.Expired;
                if (hold.StoreInventory != null)
                {
                    hold.StoreInventory.AvailableQuantity = Math.Min(hold.StoreInventory.Quantity, hold.StoreInventory.AvailableQuantity + hold.Quantity);
                }
                await _context.SaveChangesAsync();
            }

            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = "This hold pass has expired."
            });
        }

        if (hold.Status != InventoryHoldStatus.Active)
        {
            return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
            {
                IsValid = false,
                Message = $"Hold pass is in inactive status ({hold.Status})."
            });
        }

        var dto = new InventoryHoldDto
        {
            HoldId = hold.Id,
            StoreInventoryId = hold.StoreInventoryId,
            StoreId = hold.StoreId,
            StoreName = hold.Store?.Name ?? string.Empty,
            StoreAddress = hold.Store?.Address ?? string.Empty,
            StorePhone = hold.Store?.Phone ?? string.Empty,
            ProductName = hold.StoreInventory?.ProductVariant?.Product?.Name ?? "Product Item",
            VariantName = hold.StoreInventory?.ProductVariant?.VariantName ?? "Standard",
            Price = hold.StoreInventory?.Price ?? 0,
            Quantity = hold.Quantity,
            HoldCode = hold.HoldCode,
            QrToken = hold.QrToken,
            Status = hold.Status.ToString(),
            ExpiresAtUtc = hold.ExpiresAtUtc,
            CreatedAtUtc = hold.CreatedAtUtc
        };

        return ApiResponse<ValidateHoldQrResponse>.SuccessResponse(new ValidateHoldQrResponse
        {
            IsValid = true,
            Message = "Hold pass verified and active.",
            Hold = dto
        });
    }

    public async Task<ApiResponse<InventoryHoldDto>> CollectHoldAsync(
        Guid storeId,
        Guid holdId,
        Guid vendorUserId)
    {
        var store = await _context.Shops.FirstOrDefaultAsync(s => s.Id == storeId);
        if (store == null)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Store not found.");
        }

        if (store.OwnerId != vendorUserId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == vendorUserId);
            if (user == null || !user.IsAdmin)
            {
                return ApiResponse<InventoryHoldDto>.ErrorResponse("Unauthorized: You do not own this store.");
            }
        }
        else if (store.VerificationStatus != ShopVerificationStatus.Approved || !store.IsActive)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Store is not active or approved.");
        }

        var hold = await _context.InventoryHolds
            .Include(h => h.Store)
            .Include(h => h.StoreInventory)
                .ThenInclude(si => si!.ProductVariant)
                .ThenInclude(pv => pv!.Product)
            .FirstOrDefaultAsync(h => h.Id == holdId && h.StoreId == storeId);

        if (hold == null)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("Hold reservation not found.");
        }

        if (hold.Status == InventoryHoldStatus.Fulfilled)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("This hold pass has already been collected.");
        }

        if (hold.Status == InventoryHoldStatus.Released)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse("This hold pass was cancelled or released.");
        }

        if (hold.ExpiresAtUtc <= DateTime.UtcNow || hold.Status == InventoryHoldStatus.Expired)
        {
            if (hold.Status == InventoryHoldStatus.Active)
            {
                hold.Status = InventoryHoldStatus.Expired;
                if (hold.StoreInventory != null)
                {
                    hold.StoreInventory.AvailableQuantity = Math.Min(hold.StoreInventory.Quantity, hold.StoreInventory.AvailableQuantity + hold.Quantity);
                }
                await _context.SaveChangesAsync();
            }

            return ApiResponse<InventoryHoldDto>.ErrorResponse("This hold pass has expired.");
        }

        if (hold.Status != InventoryHoldStatus.Active)
        {
            return ApiResponse<InventoryHoldDto>.ErrorResponse($"Cannot collect hold pass in '{hold.Status}' status.");
        }

        // Mark as Fulfilled and deduct physical stock quantity
        hold.Status = InventoryHoldStatus.Fulfilled;
        hold.ReleasedAtUtc = DateTime.UtcNow;

        if (hold.StoreInventory != null)
        {
            // Total physical quantity decreases because item has been handed to customer
            hold.StoreInventory.Quantity = Math.Max(0, hold.StoreInventory.Quantity - hold.Quantity);
            // Ensure AvailableQuantity is capped at remaining total Quantity
            hold.StoreInventory.AvailableQuantity = Math.Min(hold.StoreInventory.Quantity, hold.StoreInventory.AvailableQuantity);
            hold.StoreInventory.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        var dto = new InventoryHoldDto
        {
            HoldId = hold.Id,
            StoreInventoryId = hold.StoreInventoryId,
            StoreId = hold.StoreId,
            StoreName = hold.Store?.Name ?? string.Empty,
            StoreAddress = hold.Store?.Address ?? string.Empty,
            StorePhone = hold.Store?.Phone ?? string.Empty,
            ProductName = hold.StoreInventory?.ProductVariant?.Product?.Name ?? "Product Item",
            VariantName = hold.StoreInventory?.ProductVariant?.VariantName ?? "Standard",
            Price = hold.StoreInventory?.Price ?? 0,
            Quantity = hold.Quantity,
            HoldCode = hold.HoldCode,
            QrToken = hold.QrToken,
            Status = hold.Status.ToString(),
            ExpiresAtUtc = hold.ExpiresAtUtc,
            CreatedAtUtc = hold.CreatedAtUtc
        };

        return ApiResponse<InventoryHoldDto>.SuccessResponse(dto, "Hold pass marked as collected successfully.");
    }

    private static string GenerateSecureHoldCode()
    {
        const string charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        var bytes = new byte[8];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        var sb = new System.Text.StringBuilder("H-", 10);
        for (int i = 0; i < 6; i++)
        {
            sb.Append(charset[bytes[i] % charset.Length]);
        }
        return sb.ToString();
    }
}
