using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth-limit")]
public class AuthController : ControllerBase

{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public AuthController(IAuthService authService, ILogger<AuthController> logger, IWebHostEnvironment environment, IConfiguration configuration)
    {
        _authService = authService;
        _logger = logger;
        _environment = environment;
        _configuration = configuration;
    }

    /// <summary>
    /// Register a new user (Customer or Retailer)
    /// </summary>
    [HttpPost("register")]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<AuthResponse>.Fail("Validation failed", errors));
        }

        var ipAddress = GetClientIpAddress();
        var response = await _authService.RegisterAsync(request, ipAddress);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        PrepareAuthResponse(response);
        return Ok(response);
    }

    /// <summary>
    /// Authenticate user credentials and return JWT Access Token and Refresh Token
    /// </summary>
    [HttpPost("login")]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<AuthResponse>.Fail("Validation failed", errors));
        }

        var ipAddress = GetClientIpAddress();
        var response = await _authService.LoginAsync(request, ipAddress);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        PrepareAuthResponse(response);
        return Ok(response);
    }

    /// <summary>
    /// Authenticate via Google ID Token credential
    /// </summary>
    [HttpPost("google")]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<AuthResponse>.Fail("Validation failed", errors));
        }

        var ipAddress = GetClientIpAddress();
        var response = await _authService.GoogleLoginAsync(request, ipAddress);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        PrepareAuthResponse(response);
        return Ok(response);
    }

    /// <summary>
    /// Sign out by revoking the active refresh token and clearing authentication cookies
    /// </summary>
    [HttpPost("logout")]
    [HttpPost("signout")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Logout([FromBody] RevokeTokenRequest? request = null)
    {
        if (!IsOriginTrusted())
        {
            _logger.LogWarning("Rejected logout from untrusted origin");
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponse.Fail("Untrusted request origin."));
        }

        // Token can be sent in request body or retrieved from HttpOnly cookie
        var token = request?.RefreshToken ?? Request.Cookies["refreshToken"];

        if (!string.IsNullOrEmpty(token))
        {
            var ipAddress = GetClientIpAddress();
            await _authService.RevokeTokenAsync(token, ipAddress);
        }

        // Clear refresh token cookie safely
        var isDev = _environment.IsDevelopment();
        Response.Cookies.Delete("refreshToken", new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDev || Request.IsHttps,
            SameSite = isDev ? SameSiteMode.Lax : SameSiteMode.None,
            Path = "/"
        });

        return Ok(ApiResponse.Ok("Successfully signed out."));
    }

    /// <summary>
    /// Refresh an expired JWT access token using a valid refresh token
    /// </summary>
    [HttpPost("refresh-token")]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest? request = null)
    {
        if (!IsOriginTrusted())
        {
            _logger.LogWarning("Rejected refresh-token from untrusted origin");
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<AuthResponse>.Fail("Untrusted request origin."));
        }

        var token = request?.RefreshToken ?? Request.Cookies["refreshToken"];

        if (string.IsNullOrEmpty(token))
        {
            return BadRequest(ApiResponse<AuthResponse>.Fail("Refresh token is required."));
        }

        var ipAddress = GetClientIpAddress();
        var response = await _authService.RefreshTokenAsync(token, ipAddress);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        PrepareAuthResponse(response);
        return Ok(response);
    }

    /// <summary>
    /// Get the profile of the currently authenticated user (Requires valid JWT Bearer token)
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(ApiResponse<UserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<UserDto>.Fail("User is not authenticated."));
        }

        var response = await _authService.GetCurrentUserAsync(userId);
        if (!response.Success)
        {
            return NotFound(response);
        }

        return Ok(response);
    }

    /// <summary>
    /// Enable Vendor capability on the current authenticated user identity
    /// </summary>
    [Authorize]
    [HttpPost("become-vendor")]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<AuthResponse>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> BecomeVendor()
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(ApiResponse<AuthResponse>.Fail("User is not authenticated."));
        }

        var ipAddress = GetClientIpAddress();
        var response = await _authService.BecomeVendorAsync(userId, ipAddress);
        if (!response.Success)
        {
            return BadRequest(response);
        }

        PrepareAuthResponse(response);
        return Ok(response);
    }

    private bool IsNativeClient()
    {
        return Request.Headers.TryGetValue("X-Client-Platform", out var platform) && 
               platform.ToString().Equals("native", StringComparison.OrdinalIgnoreCase);
    }

    private void PrepareAuthResponse(ApiResponse<AuthResponse> response)
    {
        if (response.Data != null && !string.IsNullOrEmpty(response.Data.RefreshToken))
        {
            SetRefreshTokenCookie(response.Data.RefreshToken);

            // For browser clients, do NOT leak the refresh token into JSON bodies; rely exclusively on the HttpOnly cookie
            if (!IsNativeClient())
            {
                response.Data.RefreshToken = string.Empty;
            }
        }
    }

    private void SetRefreshTokenCookie(string token)
    {
        var isDev = _environment.IsDevelopment();
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Expires = DateTime.UtcNow.AddDays(7),
            Secure = !isDev || Request.IsHttps,
            SameSite = isDev ? SameSiteMode.Lax : SameSiteMode.None,
            Path = "/"
        };
        Response.Cookies.Append("refreshToken", token, cookieOptions);
    }

    private string? GetClientIpAddress()
    {
        if (Request.Headers.TryGetValue("X-Forwarded-For", out var forwardedFor))
        {
            return forwardedFor.FirstOrDefault()?.Split(',')[0].Trim();
        }
        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }

    private bool IsOriginTrusted()
    {
        if (!Request.Headers.TryGetValue("Origin", out var originHeader) || string.IsNullOrEmpty(originHeader))
        {
            return true; // Native clients or requests without Origin header
        }

        var origin = originHeader.ToString().TrimEnd('/');
        var isDev = _environment.IsDevelopment();
        if (isDev && (origin.StartsWith("http://localhost:") || origin.StartsWith("https://localhost:")))
        {
            return true;
        }

        var configuredOrigins = _configuration["Cors:AllowedOrigins"] 
            ?? Environment.GetEnvironmentVariable("CORS_ORIGINS") 
            ?? "https://zooner.app,https://www.zooner.app";

        var allowedList = configuredOrigins.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(o => o.Trim().TrimEnd('/'));

        return allowedList.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
