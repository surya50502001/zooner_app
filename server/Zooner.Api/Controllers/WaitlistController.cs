using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("waitlist-limit")]
public class WaitlistController : ControllerBase
{
    private const string SuccessMessage = "Thanks! We'll notify you when Zooner launches.";
    private readonly AppDbContext _context;
    private readonly ILogger<WaitlistController> _logger;

    public WaitlistController(AppDbContext context, ILogger<WaitlistController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Join the Zooner early access waitlist for city launches and updates
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<WaitlistConfirmationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WaitlistConfirmationDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<WaitlistConfirmationDto>), StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> JoinWaitlist([FromBody] JoinWaitlistRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<WaitlistConfirmationDto>.Fail("Validation failed", errors));
        }

        // Validate and normalize UserType strictly server-side
        var rawUserType = request.UserType?.Trim();
        string normalizedUserType;
        if (string.Equals(rawUserType, "Shopper", StringComparison.OrdinalIgnoreCase))
        {
            normalizedUserType = "Shopper";
        }
        else if (string.Equals(rawUserType, "Retailer", StringComparison.OrdinalIgnoreCase))
        {
            normalizedUserType = "Retailer";
        }
        else
        {
            return BadRequest(ApiResponse<WaitlistConfirmationDto>.Fail(
                "Invalid user type. Allowed values are 'Shopper' or 'Retailer'.",
                new List<string> { "UserType must be either 'Shopper' or 'Retailer'." }));
        }

        // Normalize email: trim whitespace and lowercase
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        // City is optional: never invent geographic fallback, preserve null if not provided
        var normalizedCity = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();

        // Client IP captured safely for bot/abuse protection (max 45 chars for IPv6)
        var clientIp = HttpContext?.Connection.RemoteIpAddress?.ToString();
        if (clientIp != null && clientIp.Length > 45)
        {
            clientIp = clientIp.Substring(0, 45);
        }

        // Idempotent check: if already subscribed, return clean generic success without leaking membership details or DB IDs
        var existing = await _context.WaitlistEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Email.ToLower() == normalizedEmail);

        if (existing != null)
        {
            return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
                new WaitlistConfirmationDto
                {
                    Email = normalizedEmail,
                    City = normalizedCity,
                    UserType = normalizedUserType
                },
                SuccessMessage));
        }

        var entry = new WaitlistEntry
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            City = normalizedCity,
            UserType = normalizedUserType,
            IpAddress = clientIp,
            CreatedAtUtc = DateTime.UtcNow
        };

        try
        {
            _context.WaitlistEntries.Add(entry);
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            if (IsUniqueConstraintViolation(ex))
            {
                // Concurrent race condition: another request just inserted this email
                _logger.LogInformation("Concurrent duplicate waitlist registration handled idempotently for: {Email}", normalizedEmail);
                return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
                    new WaitlistConfirmationDto
                    {
                        Email = normalizedEmail,
                        City = normalizedCity,
                        UserType = normalizedUserType
                    },
                    SuccessMessage));
            }

            // Real unexpected database failure (e.g. connection outage, disk error, schema failure)
            _logger.LogError(ex, "Unexpected database error during waitlist registration for {Email}", normalizedEmail);
            return StatusCode(StatusCodes.Status500InternalServerError,
                ApiResponse<WaitlistConfirmationDto>.Fail("An unexpected database error occurred while registering. Please try again later."));
        }

        _logger.LogInformation("New waitlist subscriber registered: {Email} (UserType: {UserType})", normalizedEmail, normalizedUserType);

        return Ok(ApiResponse<WaitlistConfirmationDto>.Ok(
            new WaitlistConfirmationDto
            {
                Email = normalizedEmail,
                City = normalizedCity,
                UserType = normalizedUserType
            },
            SuccessMessage));
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        var message = ex.InnerException?.Message ?? ex.Message;

        // Check PostgreSQL
        if (ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505")
        {
            return true;
        }

        // Check SQLite
        if (ex.InnerException is Microsoft.Data.Sqlite.SqliteException sqliteEx &&
            (sqliteEx.SqliteErrorCode == 19 || sqliteEx.SqliteExtendedErrorCode == 2067))
        {
            return true;
        }

        // Check SQL Server
        if (ex.InnerException?.GetType().Name == "SqlException")
        {
            dynamic sqlEx = ex.InnerException;
            if (sqlEx.Number == 2601 || sqlEx.Number == 2627)
            {
                return true;
            }
        }

        return message.Contains("IX_WaitlistEntries_Email", StringComparison.OrdinalIgnoreCase);
    }
}
