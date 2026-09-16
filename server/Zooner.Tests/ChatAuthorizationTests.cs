using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Realtime;

namespace Zooner.Tests;

public class ChatAuthorizationTests
{
    private (ChatService service, AppDbContext context) CreateChatService(string dbName)
    {
        var context = TestDbContextFactory.Create(dbName);
        var mockNotifier = new Mock<IRealtimeNotifier>();
        var service = new ChatService(context, mockNotifier.Object, NullLogger<ChatService>.Instance);
        return (service, context);
    }

    [Fact]
    public async Task Customer_Can_Start_Conversation_With_Responding_Shop()
    {
        var (service, context) = CreateChatService(nameof(Customer_Can_Start_Conversation_With_Responding_Shop));

        var customer = new User { Id = Guid.NewGuid(), Email = "c1@test.com", Role = UserRoles.Customer };
        var vendor = new User { Id = Guid.NewGuid(), Email = "v1@test.com", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Mega Electronics", Phone = "123", Address = "Road", IsActive = true };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            RequestText = "Headphones",
            CategoryId = Guid.NewGuid()
        };

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            Status = ShopResponseStatus.Available
        };

        context.Users.AddRange(customer, vendor);
        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.ShopResponses.Add(response);
        await context.SaveChangesAsync();

        var result = await service.StartConversationAsync(customer.Id, new StartConversationRequest
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id
        });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(shop.Id, result.Data.ShopId);
        Assert.Equal(customer.Id, result.Data.CustomerId);
    }

    [Fact]
    public async Task Customer_Cannot_Start_Conversation_With_Non_Responding_Shop()
    {
        var (service, context) = CreateChatService(nameof(Customer_Cannot_Start_Conversation_With_Non_Responding_Shop));

        var customer = new User { Id = Guid.NewGuid(), Email = "c2@test.com", Role = UserRoles.Customer };
        var vendor = new User { Id = Guid.NewGuid(), Email = "v2@test.com", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Unrelated Shop", Phone = "123", Address = "Road", IsActive = true };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            RequestText = "Sneakers",
            CategoryId = Guid.NewGuid()
        };

        context.Users.AddRange(customer, vendor);
        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        // Note: shop has NOT responded to this request
        await context.SaveChangesAsync();

        var result = await service.StartConversationAsync(customer.Id, new StartConversationRequest
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id
        });

        Assert.False(result.Success);
        Assert.Contains("not responded", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Customer_Cannot_Start_Conversation_On_Another_Customers_Request()
    {
        var (service, context) = CreateChatService(nameof(Customer_Cannot_Start_Conversation_On_Another_Customers_Request));

        var customerA = new User { Id = Guid.NewGuid(), Email = "ca@test.com", Role = UserRoles.Customer };
        var customerB = new User { Id = Guid.NewGuid(), Email = "cb@test.com", Role = UserRoles.Customer };
        var vendor = new User { Id = Guid.NewGuid(), Email = "v3@test.com", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Shop 3", Phone = "123", Address = "Road", IsActive = true };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerA.Id, // Owned by Customer A
            RequestText = "Camera",
            CategoryId = Guid.NewGuid()
        };

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            Status = ShopResponseStatus.Available
        };

        context.Users.AddRange(customerA, customerB, vendor);
        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.ShopResponses.Add(response);
        await context.SaveChangesAsync();

        // Customer B attempts to start conversation on Customer A's request
        var result = await service.StartConversationAsync(customerB.Id, new StartConversationRequest
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id
        });

        Assert.False(result.Success);
        Assert.Contains("unauthorized", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Customer_Cannot_Start_Conversation_With_Own_Shop()
    {
        var (service, context) = CreateChatService(nameof(Customer_Cannot_Start_Conversation_With_Own_Shop));

        var vendor = new User { Id = Guid.NewGuid(), Email = "vendor_cust@test.com", Role = UserRoles.Vendor };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "My Own Shop", Phone = "123", Address = "Road", IsActive = true };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = vendor.Id,
            RequestText = "Test",
            CategoryId = Guid.NewGuid()
        };

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            Status = ShopResponseStatus.Available
        };

        context.Users.Add(vendor);
        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.ShopResponses.Add(response);
        await context.SaveChangesAsync();

        var result = await service.StartConversationAsync(vendor.Id, new StartConversationRequest
        {
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id
        });

        Assert.False(result.Success);
        Assert.Contains("own shop", result.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task Unrelated_User_Cannot_Access_Or_Send_Messages_In_Conversation()
    {
        var (service, context) = CreateChatService(nameof(Unrelated_User_Cannot_Access_Or_Send_Messages_In_Conversation));

        var customer = new User { Id = Guid.NewGuid(), Email = "c4@test.com", Role = UserRoles.Customer };
        var vendor = new User { Id = Guid.NewGuid(), Email = "v4@test.com", Role = UserRoles.Vendor };
        var unrelatedUser = new User { Id = Guid.NewGuid(), Email = "unrelated@test.com", Role = UserRoles.Customer };
        var shop = new Shop { Id = Guid.NewGuid(), OwnerId = vendor.Id, Name = "Shop 4", Phone = "123", Address = "Road", IsActive = true };

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            LiveRequestId = Guid.NewGuid(),
            CustomerId = customer.Id,
            ShopId = shop.Id,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        context.Users.AddRange(customer, vendor, unrelatedUser);
        context.Shops.Add(shop);
        context.Conversations.Add(conversation);
        await context.SaveChangesAsync();

        // Get messages should fail
        var getMsgResult = await service.GetConversationMessagesAsync(unrelatedUser.Id, conversation.Id);
        Assert.False(getMsgResult.Success);
        Assert.Contains("not a participant", getMsgResult.Message.ToLowerInvariant());

        // Send message should fail
        var sendMsgResult = await service.SendMessageAsync(unrelatedUser.Id, conversation.Id, new SendMessageRequest { MessageText = "Spam" });
        Assert.False(sendMsgResult.Success);
        Assert.Contains("not authorized", sendMsgResult.Message.ToLowerInvariant());
    }
}
