using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using System.ComponentModel.DataAnnotations;
using Zooner.Api.Controllers;
using Zooner.Api.Models.DTOs;

namespace Zooner.Tests;

public class WaitlistTests
{
    private static void ValidateModel(object model, ControllerBase controller)
    {
        var validationContext = new ValidationContext(model, null, null);
        var validationResults = new List<ValidationResult>();
        Validator.TryValidateObject(model, validationContext, validationResults, true);
        foreach (var validationResult in validationResults)
        {
            controller.ModelState.AddModelError(validationResult.MemberNames.FirstOrDefault() ?? string.Empty, validationResult.ErrorMessage ?? string.Empty);
        }
    }

    [Fact]
    public async Task JoinWaitlist_ValidEmail_RegistersSuccessfully()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_ValidEmail_RegistersSuccessfully));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "shopper@zooner.test",
            City = "Bangalore",
            UserType = "Shopper"
        };
        ValidateModel(request, controller);

        var result = await controller.JoinWaitlist(request);
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(okResult.Value);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("shopper@zooner.test", response.Data.Email);
        Assert.Equal("Bangalore", response.Data.City);
        Assert.Equal("Shopper", response.Data.UserType);

        var dbEntry = await context.WaitlistEntries.FirstOrDefaultAsync(w => w.Email == "shopper@zooner.test");
        Assert.NotNull(dbEntry);
        Assert.Equal("Bangalore", dbEntry.City);
        Assert.Equal("Shopper", dbEntry.UserType);
    }

    [Fact]
    public async Task JoinWaitlist_InvalidEmail_ReturnsBadRequest()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_InvalidEmail_ReturnsBadRequest));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "not-an-email",
            City = "Mumbai",
            UserType = "Shopper"
        };
        ValidateModel(request, controller);

        var result = await controller.JoinWaitlist(request);
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(badRequest.Value);
        Assert.False(response.Success);
        Assert.NotNull(response.Errors);
        Assert.Contains(response.Errors, e => e.Contains("email", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task JoinWaitlist_MissingRequiredEmail_ReturnsBadRequest()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_MissingRequiredEmail_ReturnsBadRequest));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "",
            City = "Chennai",
            UserType = "Shopper"
        };
        ValidateModel(request, controller);

        var result = await controller.JoinWaitlist(request);
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(badRequest.Value);
        Assert.False(response.Success);
    }

    [Fact]
    public async Task JoinWaitlist_MissingRequiredUserType_ReturnsBadRequest()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_MissingRequiredUserType_ReturnsBadRequest));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "tester@zooner.test",
            City = "Delhi",
            UserType = ""
        };
        ValidateModel(request, controller);

        var result = await controller.JoinWaitlist(request);
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(badRequest.Value);
        Assert.False(response.Success);
    }

    [Theory]
    [InlineData("Hacker")]
    [InlineData("Admin")]
    [InlineData("RandomType")]
    public async Task JoinWaitlist_InvalidUserType_ReturnsBadRequest(string invalidUserType)
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_InvalidUserType_ReturnsBadRequest) + invalidUserType);
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request = new JoinWaitlistRequest
        {
            Email = "tester@zooner.test",
            City = "Delhi",
            UserType = invalidUserType
        };
        ValidateModel(request, controller);

        var result = await controller.JoinWaitlist(request);
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(badRequest.Value);
        Assert.False(response.Success);
        Assert.Contains("user type", response.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task JoinWaitlist_DuplicateEmail_IsIdempotentAndDoesNotDuplicateInDb()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_DuplicateEmail_IsIdempotentAndDoesNotDuplicateInDb));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var request1 = new JoinWaitlistRequest
        {
            Email = "existing@zooner.test",
            City = "Kochi",
            UserType = "Retailer"
        };
        var res1 = await controller.JoinWaitlist(request1);
        Assert.IsType<OkObjectResult>(res1);

        var request2 = new JoinWaitlistRequest
        {
            Email = "existing@zooner.test",
            City = "Kochi",
            UserType = "Retailer"
        };
        var res2 = await controller.JoinWaitlist(request2);
        var ok2 = Assert.IsType<OkObjectResult>(res2);
        var response2 = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(ok2.Value);
        Assert.True(response2.Success);
        Assert.Equal("Thanks! We'll notify you when Zooner launches.", response2.Message);

        var count = await context.WaitlistEntries.CountAsync(w => w.Email == "existing@zooner.test");
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task JoinWaitlist_DuplicateEmail_DifferentCasing_NormalizesAndPreventsDuplicate()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_DuplicateEmail_DifferentCasing_NormalizesAndPreventsDuplicate));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var res1 = await controller.JoinWaitlist(new JoinWaitlistRequest
        {
            Email = "case.test@zooner.test",
            City = "Pune",
            UserType = "Shopper"
        });
        Assert.IsType<OkObjectResult>(res1);

        var res2 = await controller.JoinWaitlist(new JoinWaitlistRequest
        {
            Email = "  CASE.TEST@ZOONER.TEST  ",
            City = "Pune",
            UserType = "Shopper"
        });
        var ok2 = Assert.IsType<OkObjectResult>(res2);
        var response2 = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(ok2.Value);
        Assert.True(response2.Success);

        var count = await context.WaitlistEntries.CountAsync(w => w.Email == "case.test@zooner.test");
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task JoinWaitlist_OptionalCity_NullWhenOmittedOrWhitespace_DoesNotDefaultToHardcodedCity()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_OptionalCity_NullWhenOmittedOrWhitespace_DoesNotDefaultToHardcodedCity));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var result = await controller.JoinWaitlist(new JoinWaitlistRequest
        {
            Email = "nocity@zooner.test",
            City = "   ",
            UserType = "Shopper"
        });

        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(okResult.Value);
        Assert.NotNull(response.Data);
        Assert.Null(response.Data.City);

        var dbEntry = await context.WaitlistEntries.FirstOrDefaultAsync(w => w.Email == "nocity@zooner.test");
        Assert.NotNull(dbEntry);
        Assert.Null(dbEntry.City);
    }

    [Fact]
    public async Task JoinWaitlist_Response_DoesNotExposeSensitiveInternalFields()
    {
        using var context = TestDbContextFactory.Create(nameof(JoinWaitlist_Response_DoesNotExposeSensitiveInternalFields));
        var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);

        var result = await controller.JoinWaitlist(new JoinWaitlistRequest
        {
            Email = "security.check@zooner.test",
            City = "Hyderabad",
            UserType = "Shopper"
        });

        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(okResult.Value);
        Assert.NotNull(response.Data);

        // Verify that WaitlistConfirmationDto does not contain Database ID, CreatedAtUtc or IpAddress
        var properties = typeof(WaitlistConfirmationDto).GetProperties().Select(p => p.Name).ToList();
        Assert.DoesNotContain("Id", properties);
        Assert.DoesNotContain("CreatedAtUtc", properties);
        Assert.DoesNotContain("IpAddress", properties);
    }

    [Fact]
    public async Task JoinWaitlist_ConcurrentDuplicateRequests_SucceedsCleanlyWithoutExceptions()
    {
        var dbName = nameof(JoinWaitlist_ConcurrentDuplicateRequests_SucceedsCleanlyWithoutExceptions);
        
        var tasks = Enumerable.Range(0, 5).Select(async _ =>
        {
            using var context = TestDbContextFactory.Create(dbName);
            var controller = new WaitlistController(context, NullLogger<WaitlistController>.Instance);
            return await controller.JoinWaitlist(new JoinWaitlistRequest
            {
                Email = "concurrent.racer@zooner.test",
                City = "Chennai",
                UserType = "Shopper"
            });
        });

        var results = await Task.WhenAll(tasks);
        foreach (var res in results)
        {
            var ok = Assert.IsType<OkObjectResult>(res);
            var apiRes = Assert.IsType<ApiResponse<WaitlistConfirmationDto>>(ok.Value);
            Assert.True(apiRes.Success);
        }

        using var finalContext = TestDbContextFactory.Create(dbName);
        var totalEntries = await finalContext.WaitlistEntries.CountAsync(w => w.Email == "concurrent.racer@zooner.test");
        Assert.Equal(1, totalEntries);
    }
}
