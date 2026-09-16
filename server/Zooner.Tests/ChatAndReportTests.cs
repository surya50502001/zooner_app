using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Realtime;

namespace Zooner.Tests;

public class ChatAndReportTests
{
    [Fact]
    public async Task Chat_Enforces_Participant_Authorization()
    {
        using var context = TestDbContextFactory.Create(nameof(Chat_Enforces_Participant_Authorization));
        var notifierMock = new Mock<IRealtimeNotifier>();
        var chatService = new ChatService(context, notifierMock.Object, NullLogger<ChatService>.Instance);

        var customer = new User { Id = Guid.NewGuid(), FullName = "Customer", Email = "c@test.com", PasswordHash = "h" };
        var shopOwner = new User { Id = Guid.NewGuid(), FullName = "Owner", Email = "o@test.com", PasswordHash = "h" };
        var eavesdropper = new User { Id = Guid.NewGuid(), FullName = "Eavesdropper", Email = "e@test.com", PasswordHash = "h" };

        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = shopOwner.Id, Name = "Shop", Phone = "1", Address = "A", IsActive = true, VerificationStatus = ShopVerificationStatus.Approved };
        var liveRequest = new LiveRequest { Id = Guid.NewGuid(), CustomerId = customer.Id, CategoryId = Guid.NewGuid(), RequestText = "Item" };

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            CustomerId = customer.Id,
            ShopId = shop.Id,
            CreatedAtUtc = DateTime.UtcNow
        };

        context.Users.AddRange(customer, shopOwner, eavesdropper);
        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.Conversations.Add(conversation);
        await context.SaveChangesAsync();

        // Customer sends message -> Success
        var msgRes = await chatService.SendMessageAsync(customer.Id, conversation.Id, new SendMessageRequest { MessageText = "Is this in stock?" });
        Assert.True(msgRes.Success);
        Assert.Equal("Is this in stock?", msgRes.Data!.MessageText);

        // Eavesdropper tries to send message -> Fail
        var badSend = await chatService.SendMessageAsync(eavesdropper.Id, conversation.Id, new SendMessageRequest { MessageText = "Spying" });
        Assert.False(badSend.Success);
        Assert.Contains("not authorized", badSend.Message.ToLower());

        // Eavesdropper tries to view messages -> Fail
        var badView = await chatService.GetConversationMessagesAsync(eavesdropper.Id, conversation.Id);
        Assert.False(badView.Success);
    }

    [Fact]
    public async Task Report_Creation_And_Admin_Resolution()
    {
        using var context = TestDbContextFactory.Create(nameof(Report_Creation_And_Admin_Resolution));
        var adminService = new AdminService(context);

        var reporter = new User { Id = Guid.NewGuid(), FullName = "Reporter", Email = "r@test.com", PasswordHash = "h" };
        var admin = new User { Id = Guid.NewGuid(), FullName = "Admin", Email = "a@test.com", PasswordHash = "h", Role = "Admin" };
        context.Users.AddRange(reporter, admin);
        await context.SaveChangesAsync();

        // 1. User submits report
        var reportRes = await adminService.CreateReportAsync(reporter.Id, new CreateReportRequest
        {
            TargetType = "Shop",
            TargetId = Guid.NewGuid(),
            Reason = "Misleading inventory",
            Description = "Said available but closed."
        });

        Assert.True(reportRes.Success);
        Assert.Equal("Pending", reportRes.Data!.Status);

        // 2. Admin resolves report
        var resolveRes = await adminService.ResolveReportAsync(admin.Id, reportRes.Data.Id, new ResolveReportRequest
        {
            Status = ReportStatus.Resolved,
            AdminNotes = "Warned the store owner."
        });

        Assert.True(resolveRes.Success);
        Assert.Equal("Resolved", resolveRes.Data!.Status);

        // 3. Verify admin action was recorded
        var adminAction = context.AdminActions.FirstOrDefault(a => a.TargetId == reportRes.Data.Id.ToString());
        Assert.NotNull(adminAction);
        Assert.Equal("ResolveReport", adminAction.Action);
    }
}
