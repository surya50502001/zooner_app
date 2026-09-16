using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Zooner.Tests;

public class CorsSecurityTests
{
    private readonly ICorsService _corsService;
    private readonly CorsPolicy _policy;

    public CorsSecurityTests()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var allowedOrigins = new[] { "https://zooner.app", "https://www.zooner.app", "http://localhost:5173" };

        services.AddCors(options =>
        {
            options.AddPolicy("AllowClientApp", builder =>
            {
                builder.WithOrigins(allowedOrigins)
                       .AllowAnyHeader()
                       .AllowAnyMethod()
                       .AllowCredentials();
            });
        });

        var sp = services.BuildServiceProvider();
        _corsService = sp.GetRequiredService<ICorsService>();
        var corsPolicyProvider = sp.GetRequiredService<ICorsPolicyProvider>();
        _policy = corsPolicyProvider.GetPolicyAsync(new DefaultHttpContext(), "AllowClientApp").GetAwaiter().GetResult()!;
    }

    [Theory]
    [InlineData("https://zooner.app", true)]
    [InlineData("https://www.zooner.app", true)]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.com", false)]
    [InlineData("https://malicious.vercel.app", false)]
    [InlineData("https://untrusted.zooner.app.attacker.com", false)]
    [InlineData("https://subdomain.zooner.app", false)]
    public void Exact_Origin_Matching_Is_Enforced(string requestOrigin, bool shouldBeAllowed)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["Origin"] = requestOrigin;

        var corsResult = _corsService.EvaluatePolicy(httpContext, _policy);

        if (shouldBeAllowed)
        {
            Assert.True(corsResult.IsOriginAllowed);
            Assert.Equal(requestOrigin, corsResult.AllowedOrigin);
            Assert.True(corsResult.SupportsCredentials);
        }
        else
        {
            Assert.False(corsResult.IsOriginAllowed);
        }
    }
}

