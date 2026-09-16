using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;

    public ProductsController(IProductService productService)
    {
        _productService = productService;
    }

    /// <summary>
    /// Global normalized Product Catalog search (Name, Brand, ModelNumber, GTIN, MPN, SKU)
    /// Example: GET /api/products/search?q=sony+xm5
    /// </summary>
    [HttpGet("search")]
    [ProducesResponseType(typeof(ApiResponse<List<ProductSearchResultDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SearchProducts(
        [FromQuery] string? q,
        [FromQuery] string? category,
        [FromQuery] double? userLat,
        [FromQuery] double? userLon,
        [FromQuery] double? radiusKm = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var response = await _productService.SearchProductsAsync(q, category, userLat, userLon, radiusKm, page, pageSize);
        return Ok(response);
    }

    /// <summary>
    /// Retrieve canonical product details by ID with stores carrying it
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ProductSearchResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ProductSearchResultDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProductById(
        Guid id,
        [FromQuery] double? userLat,
        [FromQuery] double? userLon)
    {
        var response = await _productService.GetProductByIdAsync(id, userLat, userLon);
        return response.Success ? Ok(response) : NotFound(response);
    }

    /// <summary>
    /// Retrieve stores carrying this product sorted by distance/price
    /// </summary>
    [HttpGet("{id:guid}/stores")]
    [ProducesResponseType(typeof(ApiResponse<List<StoreInventoryDetailDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetProductStores(
        Guid id,
        [FromQuery] double? userLat,
        [FromQuery] double? userLon)
    {
        var response = await _productService.GetProductStoresAsync(id, userLat, userLon);
        return Ok(response);
    }

    /// <summary>
    /// Check for duplicate products before vendor creates a new product
    /// </summary>
    [HttpGet("check-duplicate")]
    [ProducesResponseType(typeof(ApiResponse<DuplicateCheckResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckDuplicate(
        [FromQuery] string? gtin,
        [FromQuery] string? brandName,
        [FromQuery] string? modelNumber,
        [FromQuery] string? name)
    {
        var response = await _productService.CheckDuplicateProductAsync(gtin, brandName, modelNumber, name);
        return Ok(response);
    }

    /// <summary>
    /// Add a new canonical product to the global catalog (Administrator Only)
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "AdminPolicy")]
    [ProducesResponseType(typeof(ApiResponse<ProductSearchResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ProductSearchResultDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateGlobalProduct([FromBody] CreateProductRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ApiResponse<ProductSearchResultDto>.ErrorResponse("Invalid product metadata provided."));
        }

        var response = await _productService.CreateGlobalProductAsync(request);
        return Ok(response);
    }
}
