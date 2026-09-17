using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;

namespace Zooner.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth-limit")]
public class WaitlistController : ControllerBase
{
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
    [ProducesResponseType(typeof(ApiResponse<WaitlistEntryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WaitlistEntryDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> JoinWaitlist([FromBody] JoinWaitlistRequest request)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToList();
            return BadRequest(ApiResponse<WaitlistEntryDto>.Fail("Validation failed", errors));
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var clientIp = HttpContext?.Connection.RemoteIpAddress?.ToString();

        // Idempotent: If already subscribed, return friendly confirmation without creating duplicate entries
        var existing = await _context.WaitlistEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Email.ToLower() == normalizedEmail);

        if (existing != null)
        {
            return Ok(ApiResponse<WaitlistEntryDto>.Ok(new WaitlistEntryDto
            {
                Id = existing.Id,
                Email = existing.Email,
                City = existing.City,
                UserType = existing.UserType,
                CreatedAtUtc = existing.CreatedAtUtc
            }, "You are already on the Zooner early access waitlist! We'll notify you as soon as we launch in your area."));
        }

        var entry = new WaitlistEntry
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            City = string.IsNullOrWhiteSpace(request.City) ? "Coimbatore" : request.City.Trim(),
            UserType = string.IsNullOrWhiteSpace(request.UserType) ? "Shopper" : request.UserType.Trim(),
            IpAddress = clientIp,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.WaitlistEntries.Add(entry);
        await _context.SaveChangesAsync();

        _logger.LogInformation("New waitlist subscription registered: {Email} ({City}, {UserType})", normalizedEmail, entry.City, entry.UserType);

        return Ok(ApiResponse<WaitlistEntryDto>.Ok(new WaitlistEntryDto
        {
            Id = entry.Id,
            Email = entry.Email,
            City = entry.City,
            UserType = entry.UserType,
            CreatedAtUtc = entry.CreatedAtUtc
        }, "Welcome to Zooner! You're on the early access waitlist."));
    }
}
