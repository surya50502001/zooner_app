using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using Zooner.Api.Data;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;

namespace Zooner.Tests;

public class NoEmailBasedAdminTests
{
    private readonly IConfiguration _config;
    private readonly ITokenService _tokenService;

    public NoEmailBasedAdminTests()
    {
        _config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Jwt:Key", "SuperSecretTestingJwtKeyMinimum32CharactersLong2026!" },
                { "Jwt:Issuer", "ZoonerApiTest" },
                { "Jwt:Audience", "ZoonerClientTest" },
                { "Jwt:AccessTokenExpiryMinutes", "15" },
                { "Jwt:RefreshTokenExpiryDays", "7" }
            })
            .Build();

        _tokenService = new TokenService(_config);
    }

    [Fact]
    public async Task Public_Registration_Never_Grants_Admin_Role_Regardless_Of_Email()
    {
        using var context = TestDbContextFactory.Create(nameof(Public_Registration_Never_Grants_Admin_Role_Regardless_Of_Email));
        var authService = new AuthService(context, _tokenService, NullLogger<AuthService>.Instance);

        var regReq = new RegisterRequest
        {
            FullName = "Candidate Admin",
            Email = "admin@zooner.app", // Attempts to use admin email
            Password = "SecureUserPassword123!"
        };

        var res = await authService.RegisterAsync(regReq);
        Assert.True(res.Success);
        Assert.NotNull(res.Data);

        // Role in returned DTO must be Customer, never Admin
        Assert.Equal(UserRoles.Customer, res.Data.User.Role);

        // Role persisted in database must be Customer
        var dbUser = await context.Users.FirstOrDefaultAsync(u => u.Email == "admin@zooner.app");
        Assert.NotNull(dbUser);
        Assert.Equal(UserRoles.Customer, dbUser.Role);
        Assert.False(dbUser.IsAdmin);
    }

    [Fact]
    public async Task Google_Login_Never_Grants_Admin_Role_To_New_User()
    {
        using var context = TestDbContextFactory.Create(nameof(Google_Login_Never_Grants_Admin_Role_To_New_User));
        var validatorMock = new Mock<IGoogleTokenValidator>();
        validatorMock.Setup(v => v.ValidateAsync(It.IsAny<string>()))
            .ReturnsAsync(GoogleValidationResult.Success(new GoogleTokenPayload
            {
                Subject = "google-sub-999",
                Email = "superadmin@google.com",
                Name = "Google Admin Applicant",
                EmailVerified = true
            }));

        var authService = new AuthService(context, _tokenService, validatorMock.Object, NullLogger<AuthService>.Instance);

        var res = await authService.GoogleLoginAsync(new GoogleLoginRequest { Credential = "valid-token" });
        Assert.True(res.Success);
        Assert.NotNull(res.Data);

        Assert.Equal(UserRoles.Customer, res.Data.User.Role);

        var dbUser = await context.Users.FirstOrDefaultAsync(u => u.GoogleSubject == "google-sub-999");
        Assert.NotNull(dbUser);
        Assert.Equal(UserRoles.Customer, dbUser.Role);
        Assert.False(dbUser.IsAdmin);
    }

    [Fact]
    public void TokenService_Emits_Admin_Claim_Only_When_User_Role_Is_Admin_In_Database()
    {
        var regularUserWithAdminEmail = new User
        {
            Id = Guid.NewGuid(),
            FullName = "Impostor",
            Email = "admin@zooner.app",
            Role = UserRoles.Customer
        };

        var regularToken = _tokenService.GenerateAccessToken(regularUserWithAdminEmail);
        var handler = new JwtSecurityTokenHandler();
        var parsedRegular = handler.ReadJwtToken(regularToken);
        var roles = parsedRegular.Claims.Where(c => c.Type == ClaimTypes.Role || c.Type == "role").Select(c => c.Value).ToList();

        // Must NOT contain Admin claim
        Assert.DoesNotContain(UserRoles.Admin, roles);
        Assert.Contains(UserRoles.Customer, roles);

        var realAdminUser = new User
        {
            Id = Guid.NewGuid(),
            FullName = "True Admin",
            Email = "admin@company.internal",
            Role = UserRoles.Admin
        };

        var adminToken = _tokenService.GenerateAccessToken(realAdminUser);
        var parsedAdmin = handler.ReadJwtToken(adminToken);
        var adminRoles = parsedAdmin.Claims.Where(c => c.Type == ClaimTypes.Role || c.Type == "role").Select(c => c.Value).ToList();

        // Must contain Admin claim
        Assert.Contains(UserRoles.Admin, adminRoles);
    }
}

