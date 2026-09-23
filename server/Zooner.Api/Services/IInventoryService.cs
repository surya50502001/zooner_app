using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Services;

public interface IInventoryService
{
    Task<ApiResponse<List<StoreInventoryDetailDto>>> GetStoreInventoryAsync(
        Guid storeId,
        string? search,
        Guid? categoryId,
        Guid? requestingUserId = null,
        bool isAdmin = false,
        int page = 1,
        int pageSize = 50
    );

    Task<ApiResponse<StoreInventoryDetailDto>> AddStoreInventoryAsync(
        Guid storeId,
        Guid ownerUserId,
        AddStoreInventoryRequest request
    );

    Task<ApiResponse<StoreInventoryDetailDto>> UpdateStoreInventoryAsync(
        Guid storeId,
        Guid inventoryId,
        Guid ownerUserId,
        UpdateStoreInventoryRequest request
    );

    Task<ApiResponse<bool>> DeleteStoreInventoryAsync(
        Guid storeId,
        Guid inventoryId,
        Guid ownerUserId
    );

    Task<ApiResponse<InventoryHoldDto>> ReserveInventoryHoldAsync(
        Guid storeId,
        Guid inventoryId,
        Guid customerId,
        int quantityToHold = 1
    );

    Task<ApiResponse<bool>> ReleaseInventoryHoldAsync(
        Guid storeId,
        Guid inventoryId,
        Guid holdId,
        Guid requestingUserId
    );

    Task<ApiResponse<List<InventoryHoldDto>>> GetActiveHoldsForCustomerAsync(
        Guid customerId,
        int page = 1,
        int pageSize = 20
    );

    Task<ApiResponse<ValidateHoldQrResponse>> ValidateHoldQrAsync(
        Guid storeId,
        string qrTokenOrCode,
        Guid vendorUserId
    );

    Task<ApiResponse<InventoryHoldDto>> CollectHoldAsync(
        Guid storeId,
        Guid holdId,
        Guid vendorUserId
    );
}

