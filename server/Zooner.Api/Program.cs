using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Zooner.Api.Data;
using Zooner.Api.Hubs;
using Zooner.Api.Models;
using Zooner.Api.Models.DTOs;
using Zooner.Api.Services;
using Zooner.Api.Services.Background;
using Zooner.Api.Services.Realtime;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Database Provider (SqlServer, PostgreSql, or Sqlite)
var dbProvider = builder.Configuration["DatabaseProvider"] ?? "SqlServer";
var connectionString = dbProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase)
    ? (builder.Configuration.GetConnectionString("SqlServer") ?? builder.Configuration.GetConnectionString("DefaultConnection"))
    : dbProvider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase)
        ? (builder.Configuration.GetConnectionString("PostgreSql") ?? builder.Configuration.GetConnectionString("DefaultConnection"))
        : builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=locallive.db";

// Support standard production DATABASE_URL environment variable if provided
var envDatabaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(envDatabaseUrl) && (envDatabaseUrl.StartsWith("postgres://") || envDatabaseUrl.StartsWith("postgresql://")))
{
    if (Uri.TryCreate(envDatabaseUrl, UriKind.Absolute, out var uri))
    {
        var userInfo = uri.UserInfo.Split(':');
        var npgsqlBuilder = new Npgsql.NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "",
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "",
            Database = uri.AbsolutePath.TrimStart('/'),
            SslMode = Npgsql.SslMode.Require
        };

        connectionString = npgsqlBuilder.ToString();
        dbProvider = "PostgreSql";
    }
}


builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (dbProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlServer(connectionString);
    }
    else if (dbProvider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

// 2. Register Application & Domain Services
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IGoogleTokenValidator, GoogleTokenValidator>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<IShopService, ShopService>();
builder.Services.AddScoped<ILiveRequestService, LiveRequestService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddScoped<IRealtimeNotifier, SignalRRealtimeNotifier>();

// 3. Register Background Services
builder.Services.AddHostedService<RequestExpirationWorker>();
builder.Services.AddHostedService<HoldExpirationWorker>();

// 4. Configure SignalR for Realtime Communication
builder.Services.AddSignalR();

// 5. Configure JWT Authentication (Supporting HTTP Bearer and SignalR WebSockets)
var jwtKey = builder.Configuration["Jwt:Key"];

// In Production, fail fast if secure secrets or production database configurations are missing
if (!builder.Environment.IsDevelopment())
{
    if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32 || jwtKey.StartsWith("Development", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException("Production startup failed: A secure, production JWT Key of at least 32 characters must be configured via the 'JWT__KEY' environment variable.");
    }

    if (dbProvider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase) || 
        string.IsNullOrWhiteSpace(connectionString) || 
        connectionString.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) || 
        connectionString.EndsWith(".db", StringComparison.OrdinalIgnoreCase) || 
        connectionString.Contains("locallive.db") || 
        connectionString.Contains("zooner_dev.db"))
    {
        throw new InvalidOperationException("Production startup failed: SQLite/Local database is not permitted in production. A valid PostgreSQL or SQL Server database connection string must be configured via 'DATABASE_URL' or 'ConnectionStrings:PostgreSql'.");
    }
}
else
{
    jwtKey ??= "DevelopmentSuperSecretJwtKeyForLocalTestingOnly2026!DoNotUseInProduction";
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "ZoonerApi";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "ZoonerClient";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // Extract JWT token from Query String for SignalR WebSocket connections and validate active status
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        },
        OnTokenValidated = async context =>
        {
            var dbContext = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var userIdClaim = context.Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                              ?? context.Principal?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;

            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                context.Fail("Invalid token identity.");
                return;
            }

            var securityStampClaim = context.Principal?.FindFirst("security_stamp")?.Value;

            var userState = await dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new { u.IsActive, u.SecurityStamp })
                .FirstOrDefaultAsync();

            if (userState == null || !userState.IsActive)
            {
                context.Fail("User account is deactivated or does not exist.");
                return;
            }

            if (!string.IsNullOrEmpty(securityStampClaim) && !string.IsNullOrEmpty(userState.SecurityStamp) && userState.SecurityStamp != securityStampClaim)
            {
                context.Fail("Token security stamp has been invalidated.");
                return;
            }
        }
    };
});

// Centralized Authorization Policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminPolicy", policy => policy.RequireRole(UserRoles.Admin));
    options.AddPolicy("AdminOnly", policy => policy.RequireRole(UserRoles.Admin));
    options.AddPolicy("VendorPolicy", policy => policy.RequireRole(UserRoles.Vendor, UserRoles.Admin, "ShopOwner"));
    options.AddPolicy("CustomerPolicy", policy => policy.RequireRole(UserRoles.Customer, UserRoles.Vendor, UserRoles.Admin));
    options.AddPolicy("ShopOwnerOnly", policy => policy.RequireRole(UserRoles.Vendor, UserRoles.Admin));
});

// 6. Configure CORS with strict explicit allowlist (no wildcards)
var configOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
var envOrigins = Environment.GetEnvironmentVariable("CORS_ORIGINS")?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];
var allowedOrigins = configOrigins.Concat(envOrigins).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

if (builder.Environment.IsDevelopment())
{
    if (allowedOrigins.Count == 0)
    {
        allowedOrigins.AddRange(["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]);
    }
}
else
{
    if (allowedOrigins.Count == 0)
    {
        throw new InvalidOperationException(
            "Production startup failed: An explicit CORS origin allowlist must be configured via 'Cors:AllowedOrigins' or 'CORS_ORIGINS' environment variable. Wildcard or unconfigured origins with credentials are strictly prohibited.");
    }
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClientApp", policy =>
    {
        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});


// 6.1 Configure Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("auth-limit", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_auth",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 15,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("hold-limit", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_hold",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("waitlist-limit", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_waitlist",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "global",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 200,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// 7. Add Controllers & Swagger with Bearer Support
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "LocalLive Web API",
        Version = "v1",
        Description = "Hyperlocal Live Request & Available Shop Discovery Platform Backend"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter JWT access token. Format: {token}"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// 8. Global Centralized Exception Handler
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";

        var exceptionHandlerPathFeature = context.Features.Get<IExceptionHandlerPathFeature>();
        var ex = exceptionHandlerPathFeature?.Error;

        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Unhandled exception occurred while processing request.");

        var response = ApiResponse.Fail("An unexpected error occurred while processing your request.");
        await context.Response.WriteAsJsonAsync(response);
    });
});

// 9. Database Migrations & Environment-Aware Initial Data Seeding
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    var dbContext = services.GetRequiredService<AppDbContext>();

    try
    {
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.MigrateAsync();
        }

        // Seed essential initial business settings and master categories if tables are empty
        await DbSeeder.SeedAsync(dbContext, logger, app.Configuration, app.Environment.IsDevelopment());
    }
    catch (Exception ex)
    {
        logger.LogCritical(ex, "An error occurred while running database migrations or seeding.");
        if (!app.Environment.IsDevelopment())
        {
            // Fail startup immediately in Production rather than running on a failed/corrupted schema
            throw;
        }
    }
}

// 10. HTTP Pipeline (Configure forwarded headers for reverse proxies / load balancers)
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "LocalLive Web API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseCors("AllowClientApp");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<LiveHub>("/hubs/live");

app.Run();

public partial class Program { }

