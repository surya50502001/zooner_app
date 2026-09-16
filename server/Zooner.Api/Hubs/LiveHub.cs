using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;

namespace Zooner.Api.Hubs;

[Authorize]
public class LiveHub : Hub
{
    private readonly AppDbContext _context;
    private readonly ILogger<LiveHub> _logger;

    public LiveHub(AppDbContext context, ILogger<LiveHub> logger)
    {
        _context = context;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId != null)
        {
            var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId.Value);
            if (user == null || !user.IsActive)
            {
                _logger.LogWarning("Inactive user {UserId} connected to LiveHub; aborting group registrations.", userId);
                Context.Abort();
                return;
            }

            // Add user to their personal notification group
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");

            // If user owns shops, add them to their shop groups automatically
            var shopIds = await _context.Shops
                .Where(s => s.OwnerId == userId.Value && s.IsActive)
                .Select(s => s.Id)
                .ToListAsync();

            foreach (var shopId in shopIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"shop_{shopId}");
            }

            _logger.LogInformation("Client connected: User {UserId} added to user and shop groups.", userId);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();
        if (userId != null)
        {
            _logger.LogInformation("Client disconnected: User {UserId}.", userId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinLiveRequestGroup(string requestId)
    {
        var userId = GetUserId();
        if (userId == null)
        {
            _logger.LogWarning("Anonymous or unauthenticated SignalR client attempted to join request group {RequestId}", requestId);
            return;
        }

        if (!Guid.TryParse(requestId, out var parsedRequestId))
        {
            _logger.LogWarning("Invalid request ID format in SignalR group join: {RequestId}", requestId);
            return;
        }

        // Verify user is active
        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (user == null || !user.IsActive)
        {
            _logger.LogWarning("Inactive or nonexistent user {UserId} attempted to join request group {RequestId}", userId, requestId);
            return;
        }

        // Authorization checks: Admin OR Request Owner OR Participating Vendor
        var isAdmin = user.Role.Equals(UserRoles.Admin, StringComparison.OrdinalIgnoreCase);

        if (!isAdmin)
        {
            var isCustomerOwner = await _context.LiveRequests
                .AsNoTracking()
                .AnyAsync(r => r.Id == parsedRequestId && r.CustomerId == userId.Value);

            var isParticipatingVendor = false;
            if (!isCustomerOwner)
            {
                isParticipatingVendor = await _context.ShopResponses
                    .AsNoTracking()
                    .AnyAsync(r => r.LiveRequestId == parsedRequestId && r.Shop != null && r.Shop.OwnerId == userId.Value && r.Shop.IsActive);
            }

            if (!isCustomerOwner && !isParticipatingVendor)
            {
                _logger.LogWarning("IDOR Prevention: User {UserId} denied joining request group request_{RequestId}", userId, requestId);
                return;
            }
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"request_{requestId}");
        _logger.LogInformation("User {UserId} authorized and joined request group request_{RequestId}", userId, requestId);
    }

    public async Task LeaveLiveRequestGroup(string requestId)
    {
        if (Guid.TryParse(requestId, out _))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"request_{requestId}");
        }
    }

    private Guid? GetUserId()
    {
        var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? Context.User?.FindFirst("sub")?.Value;

        return Guid.TryParse(claim, out var userId) ? userId : null;
    }
}
