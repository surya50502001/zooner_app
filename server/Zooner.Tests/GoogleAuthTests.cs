using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Xunit;
using Zooner.Api.Controllers;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class GoogleAuthTests
{
    private AppDbContext CreateInMemoryDbContext(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        return new AppDbContext(options);
    }

    private (AuthService authService, Mock<IGoogleTokenValidator> mockValidator, AppDbContext context) CreateAuthService(string dbName)
    {
        var context = CreateInMemoryDbContext(dbName);
        var mockValidator = new Mock<IGoogleTokenValidator>();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Jwt:Key", "SuperSecretTestingJwtKeyThatIsLongEnoughForHmacSha256!2026" },
                { "Jwt:Issuer", "ZoonerTestApi" },
                { "Jwt:Audience", "ZoonerTestClient" },
                { "Jwt:AccessTokenExpiryMinutes", "60" },
                { "Jwt:RefreshTokenExpiryDays", "7" }
            })
            .Build();

        var tokenService = new TokenService(configuration);
        var authService = new AuthService(context, tokenService, mockValidator.Object, NullLogger<AuthService>.Instance);

        return (authService, mockValidator, context);
    }

    [Fact]
    public async Task GoogleLogin_MissingCredential_ReturnsFail()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, _, _) = CreateAuthService(dbName);

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "" });

        Assert.False(result.Success);
        Assert.Equal("Google credential is required.", result.Message);
    }

    [Fact]
    public async Task GoogleLogin_InvalidToken_ReturnsFailWithSpecificError()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, _) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("invalid_token"))
            .ReturnsAsync(GoogleValidationResult.Fail("Google authentication token signature verification failed."));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "invalid_token" });

        Assert.False(result.Success);
        Assert.Equal("Google authentication token signature verification failed.", result.Message);
    }

    [Fact]
    public async Task GoogleLogin_AudienceMismatch_ReturnsInformativeError()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, _) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("wrong_aud_token"))
            .ReturnsAsync(GoogleValidationResult.Fail("Google token audience mismatch. Verify that GOOGLE_CLIENT_ID on Render matches VITE_GOOGLE_CLIENT_ID on Vercel."));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "wrong_aud_token" });

        Assert.False(result.Success);
        Assert.Contains("audience mismatch", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GoogleLogin_ExpiredToken_ReturnsExpiredError()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, _) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("expired_token"))
            .ReturnsAsync(GoogleValidationResult.Fail("Google authentication token has expired. Please sign in again."));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "expired_token" });

        Assert.False(result.Success);
        Assert.Contains("expired", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GoogleLogin_InvalidIssuer_ReturnsIssuerError()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, _) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("wrong_issuer_token"))
            .ReturnsAsync(GoogleValidationResult.Fail("Google token issuer is invalid."));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "wrong_issuer_token" });

        Assert.False(result.Success);
        Assert.Contains("issuer is invalid", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GoogleLogin_NewUser_CreatesCustomerUserAndIssuesJwt()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        var googleSubject = "google_sub_123456";
        var googleEmail = "newshopper@gmail.com";
        var googleName = "New Shopper";

        mockValidator.Setup(v => v.ValidateAsync("valid_google_token"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = googleSubject,
                Email = googleEmail,
                EmailVerified = true,
                Name = googleName
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "valid_google_token" }, "127.0.0.1");

        Assert.True(result.Success, result.Message);
        Assert.NotNull(result.Data);
        Assert.False(string.IsNullOrWhiteSpace(result.Data.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(result.Data.RefreshToken));
        Assert.Equal(UserRoles.Customer, result.Data.User.Role);
        Assert.Equal(googleEmail, result.Data.User.Email);
        Assert.Equal(googleName, result.Data.User.FullName);

        // Verify user created in DB with Customer role and GoogleSubject
        var savedUser = await context.Users.FirstOrDefaultAsync(u => u.GoogleSubject == googleSubject);
        Assert.NotNull(savedUser);
        Assert.Equal(UserRoles.Customer, savedUser.Role);
        Assert.Null(savedUser.PasswordHash);
    }

    [Fact]
    public async Task GoogleLogin_ExistingGoogleSubject_SignsInAndPreservesRole()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Email = "merchant@gmail.com",
            FullName = "Existing Merchant",
            GoogleSubject = "google_sub_vendor_999",
            Role = UserRoles.Vendor,
            CreatedAtUtc = DateTime.UtcNow
        };
        context.Users.Add(existingUser);
        await context.SaveChangesAsync();

        mockValidator.Setup(v => v.ValidateAsync("token_vendor"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "google_sub_vendor_999",
                Email = "merchant@gmail.com",
                EmailVerified = true,
                Name = "Existing Merchant"
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "token_vendor" });

        Assert.True(result.Success);
        Assert.Equal(existingUser.Id, result.Data!.User.Id);
        // Ensure Vendor capability is preserved!
        Assert.Equal(UserRoles.Vendor, result.Data.User.Role);
    }

    [Fact]
    public async Task GoogleLogin_ExistingEmail_VerifiedEmail_LinksAccountSuccessfully()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        // User registered with password earlier, no GoogleSubject yet
        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Email = "user@gmail.com",
            FullName = "Standard User",
            PasswordHash = "hashed_pw",
            GoogleSubject = null,
            Role = UserRoles.Customer,
            CreatedAtUtc = DateTime.UtcNow
        };
        context.Users.Add(existingUser);
        await context.SaveChangesAsync();

        mockValidator.Setup(v => v.ValidateAsync("token_user"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "google_sub_newlink_111",
                Email = "user@gmail.com",
                EmailVerified = true,
                Name = "Standard User"
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "token_user" });

        Assert.True(result.Success);
        Assert.Equal(existingUser.Id, result.Data!.User.Id);

        // Verify GoogleSubject was linked in DB
        var updatedUser = await context.Users.FindAsync(existingUser.Id);
        Assert.Equal("google_sub_newlink_111", updatedUser!.GoogleSubject);
    }

    [Fact]
    public async Task GoogleLogin_ExistingEmail_UnverifiedEmail_RejectsAccountLinking()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Email = "target@victim.com",
            FullName = "Target User",
            PasswordHash = "hashed_pw",
            GoogleSubject = null,
            Role = UserRoles.Customer,
            CreatedAtUtc = DateTime.UtcNow
        };
        context.Users.Add(existingUser);
        await context.SaveChangesAsync();

        // Attacker creates Google account with unverified email matching victim
        mockValidator.Setup(v => v.ValidateAsync("token_unverified"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "attacker_sub_999",
                Email = "target@victim.com",
                EmailVerified = false, // UNVERIFIED
                Name = "Attacker"
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "token_unverified" });

        Assert.False(result.Success);
        Assert.Contains("not verified", result.Message);

        // Ensure existing account was NOT hijacked
        var userInDb = await context.Users.FindAsync(existingUser.Id);
        Assert.Null(userInDb!.GoogleSubject);
    }

    [Fact]
    public async Task GoogleLogin_DuplicateGoogleSubject_Mismatch_RejectsConflictingLink()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        // User already linked to GoogleSubject "original_sub"
        var existingUser = new User
        {
            Id = Guid.NewGuid(),
            Email = "user@example.com",
            FullName = "Linked User",
            GoogleSubject = "original_sub",
            Role = UserRoles.Customer,
            CreatedAtUtc = DateTime.UtcNow
        };
        context.Users.Add(existingUser);
        await context.SaveChangesAsync();

        // A different Google account tries to log into the same email
        mockValidator.Setup(v => v.ValidateAsync("token_conflict"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "different_sub",
                Email = "user@example.com",
                EmailVerified = true,
                Name = "Linked User"
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "token_conflict" });

        Assert.False(result.Success);
        Assert.Contains("already linked", result.Message);
    }

    [Fact]
    public async Task GoogleLogin_CannotSelfAssign_PrivilegedRoles()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, context) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("token_normal"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "sub_normal_123",
                Email = "normal@gmail.com",
                EmailVerified = true,
                Name = "Normal Person"
            }));

        var result = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "token_normal" });

        Assert.True(result.Success);
        Assert.Equal(UserRoles.Customer, result.Data!.User.Role);
        Assert.NotEqual(UserRoles.Admin, result.Data.User.Role);
        Assert.NotEqual(UserRoles.Vendor, result.Data.User.Role);
    }

    [Fact]
    public async Task AuthController_GoogleLogin_SetsHttpOnlyCookie_ForBrowserClients()
    {
        var dbName = Guid.NewGuid().ToString();
        var (authService, mockValidator, _) = CreateAuthService(dbName);

        mockValidator.Setup(v => v.ValidateAsync("token_browser"))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "sub_browser_555",
                Email = "browser@gmail.com",
                EmailVerified = true,
                Name = "Browser User"
            }));

        var mockEnv = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        mockEnv.Setup(e => e.EnvironmentName).Returns("Development");

        var controller = new AuthController(authService, NullLogger<AuthController>.Instance, mockEnv.Object);
        var httpContext = new DefaultHttpContext();
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        var actionResult = await controller.GoogleLogin(new GoogleLoginRequest { Credential = "token_browser" });

        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var apiResponse = Assert.IsType<ApiResponse<AuthResponse>>(okResult.Value);

        Assert.True(apiResponse.Success);
        // Refresh token removed from JSON for browser clients (HttpOnly cookie used instead)
        Assert.Equal(string.Empty, apiResponse.Data!.RefreshToken);

        // Verify Set-Cookie header contains refreshToken
        var cookies = httpContext.Response.Headers["Set-Cookie"].ToString();
        Assert.Contains("refreshToken=", cookies);
        Assert.Contains("httponly", cookies, StringComparison.OrdinalIgnoreCase);
    }
}

