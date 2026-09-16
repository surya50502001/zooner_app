using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services.Realtime;

namespace Zooner.Api.Services;

public class ChatService : IChatService
{
    private readonly AppDbContext _context;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly ILogger<ChatService> _logger;

    public ChatService(AppDbContext context, IRealtimeNotifier realtimeNotifier, ILogger<ChatService> logger)
    {
        _context = context;
        _realtimeNotifier = realtimeNotifier;
        _logger = logger;
    }

    public async Task<ApiResponse<List<ConversationDto>>> GetConversationsForUserAsync(Guid userId)
    {
        // User could be the Customer OR the Shop Owner
        var userShopIds = await _context.Shops
            .Where(s => s.OwnerId == userId)
            .Select(s => s.Id)
            .ToListAsync();

        var conversations = await _context.Conversations
            .Where(c => c.CustomerId == userId || userShopIds.Contains(c.ShopId))
            .OrderByDescending(c => c.UpdatedAtUtc)
            .Include(c => c.Customer)
            .Include(c => c.Shop)
            .Include(c => c.LiveRequest)
            .Include(c => c.Messages.OrderByDescending(m => m.CreatedAtUtc).Take(1))
            .AsNoTracking()
            .ToListAsync();

        var results = conversations.Select(c =>
        {
            var lastMsg = c.Messages.FirstOrDefault();
            return new ConversationDto
            {
                Id = c.Id,
                LiveRequestId = c.LiveRequestId,
                LiveRequestText = c.LiveRequest?.RequestText ?? string.Empty,
                CustomerId = c.CustomerId,
                CustomerName = c.Customer?.FullName ?? string.Empty,
                ShopId = c.ShopId,
                ShopName = c.Shop?.Name ?? string.Empty,
                CreatedAtUtc = c.CreatedAtUtc,
                UpdatedAtUtc = c.UpdatedAtUtc,
                LastMessage = lastMsg != null ? new ChatMessageDto
                {
                    Id = lastMsg.Id,
                    ConversationId = lastMsg.ConversationId,
                    SenderId = lastMsg.SenderId,
                    MessageText = lastMsg.MessageText,
                    IsRead = lastMsg.IsRead,
                    CreatedAtUtc = lastMsg.CreatedAtUtc
                } : null,
                UnreadCount = c.Messages.Count(m => !m.IsRead && m.SenderId != userId)
            };
        }).ToList();

        return ApiResponse<List<ConversationDto>>.Ok(results);
    }

    public async Task<ApiResponse<List<ChatMessageDto>>> GetConversationMessagesAsync(Guid userId, Guid conversationId, int page = 1, int pageSize = 50)
    {
        var conversation = await _context.Conversations
            .Include(c => c.Shop)
            .FirstOrDefaultAsync(c => c.Id == conversationId);

        if (conversation == null)
        {
            return ApiResponse<List<ChatMessageDto>>.Fail("Conversation not found.");
        }

        // Authorization check
        var user = await _context.Users.FindAsync(userId);
        var isAdmin = user != null && user.Role.Equals(UserRoles.Admin, StringComparison.OrdinalIgnoreCase);
        var isAuthorized = conversation.CustomerId == userId || conversation.Shop?.OwnerId == userId || isAdmin;
        if (!isAuthorized)
        {
            return ApiResponse<List<ChatMessageDto>>.Fail("You are not a participant in this conversation.");
        }

        var messages = await _context.ChatMessages
            .Where(m => m.ConversationId == conversationId)
            .OrderByDescending(m => m.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(m => m.Sender)
            .AsNoTracking()
            .ToListAsync();

        // Mark unread messages as read
        var unread = await _context.ChatMessages
            .Where(m => m.ConversationId == conversationId && !m.IsRead && m.SenderId != userId)
            .ToListAsync();

        if (unread.Any())
        {
            foreach (var msg in unread)
            {
                msg.IsRead = true;
            }
            await _context.SaveChangesAsync();
        }

        var results = messages
            .OrderBy(m => m.CreatedAtUtc)
            .Select(m => new ChatMessageDto
            {
                Id = m.Id,
                ConversationId = m.ConversationId,
                SenderId = m.SenderId,
                SenderName = m.Sender?.FullName ?? string.Empty,
                MessageText = m.MessageText,
                IsRead = m.IsRead,
                CreatedAtUtc = m.CreatedAtUtc
            }).ToList();

        return ApiResponse<List<ChatMessageDto>>.Ok(results);
    }

    public async Task<ApiResponse<ChatMessageDto>> SendMessageAsync(Guid senderId, Guid conversationId, SendMessageRequest request)
    {
        var conversation = await _context.Conversations
            .Include(c => c.Shop)
            .FirstOrDefaultAsync(c => c.Id == conversationId);

        if (conversation == null)
        {
            return ApiResponse<ChatMessageDto>.Fail("Conversation not found.");
        }

        // Authorization check: sender must be customer or shop owner
        var isCustomer = conversation.CustomerId == senderId;
        var isShopOwner = conversation.Shop?.OwnerId == senderId;

        if (!isCustomer && !isShopOwner)
        {
            return ApiResponse<ChatMessageDto>.Fail("You are not authorized to send messages in this conversation.");
        }

        if (conversation.Shop == null || !conversation.Shop.IsActive || conversation.Shop.VerificationStatus != ShopVerificationStatus.Approved)
        {
            return ApiResponse<ChatMessageDto>.Fail("Cannot send messages for an inactive or unverified shop.");
        }

        var sender = await _context.Users.FindAsync(senderId);

        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = senderId,
            MessageText = request.MessageText.Trim(),
            IsRead = false,
            CreatedAtUtc = DateTime.UtcNow
        };

        conversation.UpdatedAtUtc = DateTime.UtcNow;
        _context.ChatMessages.Add(message);
        await _context.SaveChangesAsync();

        var messageDto = new ChatMessageDto
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = sender?.FullName ?? string.Empty,
            MessageText = message.MessageText,
            IsRead = false,
            CreatedAtUtc = message.CreatedAtUtc
        };

        // Determine recipient
        var recipientUserId = isCustomer ? conversation.Shop!.OwnerId : conversation.CustomerId;

        // Broadcast realtime chat message
        await _realtimeNotifier.NotifyChatMessageAsync(recipientUserId, messageDto);

        return ApiResponse<ChatMessageDto>.Ok(messageDto, "Message sent.");
    }

    public async Task<ApiResponse<ConversationDto>> StartConversationAsync(Guid customerId, StartConversationRequest request)
    {
        var liveRequest = await _context.LiveRequests
            .Include(r => r.Responses)
            .FirstOrDefaultAsync(r => r.Id == request.LiveRequestId);

        if (liveRequest == null)
        {
            return ApiResponse<ConversationDto>.Fail("Live request not found.");
        }

        if (liveRequest.CustomerId != customerId)
        {
            return ApiResponse<ConversationDto>.Fail("Unauthorized.");
        }

        var shop = await _context.Shops.FindAsync(request.ShopId);
        if (shop == null)
        {
            return ApiResponse<ConversationDto>.Fail("Shop not found.");
        }

        if (shop.OwnerId == customerId)
        {
            return ApiResponse<ConversationDto>.Fail("Customer cannot start conversation with their own shop.");
        }

        if (!shop.IsActive || shop.VerificationStatus != ShopVerificationStatus.Approved)
        {
            return ApiResponse<ConversationDto>.Fail("Shop is not currently active or verified.");
        }

        // Verify shop legitimately participated / responded to this live request
        var hasResponded = liveRequest.Responses.Any(r => r.ShopId == request.ShopId);
        if (!hasResponded)
        {
            return ApiResponse<ConversationDto>.Fail("Shop has not responded to this live request.");
        }

        var existing = await _context.Conversations
            .Include(c => c.Customer)
            .Include(c => c.Shop)
            .Include(c => c.LiveRequest)
            .FirstOrDefaultAsync(c => c.LiveRequestId == request.LiveRequestId && c.ShopId == request.ShopId);

        if (existing != null)
        {
            return ApiResponse<ConversationDto>.Ok(new ConversationDto
            {
                Id = existing.Id,
                LiveRequestId = existing.LiveRequestId,
                LiveRequestText = existing.LiveRequest?.RequestText ?? string.Empty,
                CustomerId = existing.CustomerId,
                CustomerName = existing.Customer?.FullName ?? string.Empty,
                ShopId = existing.ShopId,
                ShopName = existing.Shop?.Name ?? string.Empty,
                CreatedAtUtc = existing.CreatedAtUtc,
                UpdatedAtUtc = existing.UpdatedAtUtc
            });
        }

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            LiveRequestId = request.LiveRequestId,
            CustomerId = customerId,
            ShopId = request.ShopId,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _context.Conversations.Add(conversation);
        await _context.SaveChangesAsync();

        var customer = await _context.Users.FindAsync(customerId);

        return ApiResponse<ConversationDto>.Ok(new ConversationDto
        {
            Id = conversation.Id,
            LiveRequestId = conversation.LiveRequestId,
            LiveRequestText = liveRequest.RequestText,
            CustomerId = customerId,
            CustomerName = customer?.FullName ?? string.Empty,
            ShopId = shop.Id,
            ShopName = shop.Name,
            CreatedAtUtc = conversation.CreatedAtUtc,
            UpdatedAtUtc = conversation.UpdatedAtUtc
        }, "Conversation started.");
    }
}
