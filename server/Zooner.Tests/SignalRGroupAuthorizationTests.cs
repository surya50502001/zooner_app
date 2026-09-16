using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Hubs;
using Zooner.Api.Models;

namespace Zooner.Tests;

public class SignalRGroupAuthorizationTests
{
    private (LiveHub hub, Mock<IGroupManager> groupMock, AppDbContext context) CreateHub(
        string dbName, Guid? userId, string role = UserRoles.Customer, bool isActive = true)
    {
        var context = TestDbContextFactory.Create(dbName);
        var hub = new LiveHub(context, NullLogger<LiveHub>.Instance);

        var claims = new List<Claim>();
        if (userId.HasValue)
        {
            claims.Add(new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString()));
            claims.Add(new Claim(ClaimTypes.Role, role));

            var user = new User
            {
                Id = userId.Value,
                Email = $"{userId.Value}@test.com",
                FullName = "Test User",
                Role = role,
                IsActive = isActive
            };
            context.Users.Add(user);
            context.SaveChanges();
        }

        var identity = new ClaimsIdentity(claims, userId.HasValue ? "TestAuth" : null);
        var principal = new ClaimsPrincipal(identity);

        var mockContext = new Mock<HubCallerContext>();
        mockContext.Setup(c => c.ConnectionId).Returns("conn-xyz");
        mockContext.Setup(c => c.User).Returns(principal);

        var mockGroups = new Mock<IGroupManager>();

        hub.Context = mockContext.Object;
        hub.Groups = mockGroups.Object;

        return (hub, mockGroups, context);
    }

    [Fact]
    public async Task Customer_Owner_Is_Allowed_To_Join_Own_Request_Group()
    {
        var customerId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Customer_Owner_Is_Allowed_To_Join_Own_Request_Group), customerId, UserRoles.Customer);

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need headphones",
            CategoryId = Guid.NewGuid()
        };
        context.LiveRequests.Add(liveRequest);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", $"request_{liveRequest.Id}", default), Times.Once);
    }

    [Fact]
    public async Task Participating_Vendor_Is_Allowed_To_Join_Request_Group()
    {
        var vendorId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Participating_Vendor_Is_Allowed_To_Join_Request_Group), vendorId, UserRoles.Vendor);

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorId,
            Name = "Audio Mart",
            Phone = "123",
            Address = "Road",
            IsActive = true
        };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need headphones",
            CategoryId = Guid.NewGuid()
        };

        var response = new ShopResponse
        {
            Id = Guid.NewGuid(),
            LiveRequestId = liveRequest.Id,
            ShopId = shop.Id,
            Status = ShopResponseStatus.Available
        };

        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        context.ShopResponses.Add(response);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", $"request_{liveRequest.Id}", default), Times.Once);
    }

    [Fact]
    public async Task Admin_Is_Allowed_To_Join_Any_Request_Group()
    {
        var adminId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Admin_Is_Allowed_To_Join_Any_Request_Group), adminId, UserRoles.Admin);

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need headphones",
            CategoryId = Guid.NewGuid()
        };
        context.LiveRequests.Add(liveRequest);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", $"request_{liveRequest.Id}", default), Times.Once);
    }

    [Fact]
    public async Task Unrelated_Customer_Is_Denied_Joining_Other_Customer_Request_Group()
    {
        var customerAId = Guid.NewGuid();
        var customerBId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Unrelated_Customer_Is_Denied_Joining_Other_Customer_Request_Group), customerBId, UserRoles.Customer);

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerAId, // belongs to Customer A
            RequestText = "Need shoes",
            CategoryId = Guid.NewGuid()
        };
        context.LiveRequests.Add(liveRequest);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        // Must be rejected - not added to group
        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", It.IsAny<string>(), default), Times.Never);
    }

    [Fact]
    public async Task Unrelated_Vendor_Is_Denied_Joining_Unresponded_Request_Group()
    {
        var vendorAId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Unrelated_Vendor_Is_Denied_Joining_Unresponded_Request_Group), vendorAId, UserRoles.Vendor);

        var shop = new Shop
        {
            Id = Guid.NewGuid(),
            OwnerId = vendorAId,
            Name = "Unrelated Shop",
            Phone = "123",
            Address = "Road",
            IsActive = true
        };

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need shoes",
            CategoryId = Guid.NewGuid()
        };

        context.Shops.Add(shop);
        context.LiveRequests.Add(liveRequest);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        // Must be rejected
        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", It.IsAny<string>(), default), Times.Never);
    }

    [Fact]
    public async Task Nonexistent_Request_Is_Safely_Denied()
    {
        var customerId = Guid.NewGuid();
        var (hub, groupMock, _) = CreateHub(nameof(Nonexistent_Request_Is_Safely_Denied), customerId, UserRoles.Customer);

        var nonExistentRequestId = Guid.NewGuid();

        await hub.JoinLiveRequestGroup(nonExistentRequestId.ToString());

        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", It.IsAny<string>(), default), Times.Never);
    }

    [Fact]
    public async Task Inactive_User_Is_Denied_Joining_Request_Group()
    {
        var customerId = Guid.NewGuid();
        var (hub, groupMock, context) = CreateHub(nameof(Inactive_User_Is_Denied_Joining_Request_Group), customerId, UserRoles.Customer, isActive: false);

        var liveRequest = new LiveRequest
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            RequestText = "Need headphones",
            CategoryId = Guid.NewGuid()
        };
        context.LiveRequests.Add(liveRequest);
        await context.SaveChangesAsync();

        await hub.JoinLiveRequestGroup(liveRequest.Id.ToString());

        groupMock.Verify(g => g.AddToGroupAsync("conn-xyz", It.IsAny<string>(), default), Times.Never);
    }
}
