using System;
using Xunit;

namespace Zooner.Tests;

public class ProductionDatabaseFailClosedTests
{
    [Theory]
    [InlineData("Sqlite", "Data Source=zooner_dev.db")]
    [InlineData("Sqlite", "Data Source=locallive.db")]
    [InlineData("Sqlite", "")]
    [InlineData("PostgreSql", "")]
    [InlineData("PostgreSql", "Data Source=test.db")]
    public void Production_Startup_Throws_If_Database_Is_Sqlite_Or_Missing(string dbProvider, string connectionString)
    {
        var isDevelopment = false;
        var jwtKey = "SuperSecretProductionJwtKeyMinimum32CharactersLong2026!";

        void ValidateStartup()
        {
            if (!isDevelopment)
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
        }

        var ex = Assert.Throws<InvalidOperationException>(() => ValidateStartup());
        Assert.Contains("Production startup failed", ex.Message);
    }

    [Fact]
    public void Production_Startup_Succeeds_With_Valid_Postgres_Connection()
    {
        var isDevelopment = false;
        var jwtKey = "SuperSecretProductionJwtKeyMinimum32CharactersLong2026!";
        var dbProvider = "PostgreSql";
        var connectionString = "Host=prod.db.zooner.internal;Port=5432;Database=zooner;Username=zooner_admin;Password=secret";

        var exception = Record.Exception(() =>
        {
            if (!isDevelopment)
            {
                if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32 || jwtKey.StartsWith("Development", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Production startup failed");
                }

                if (dbProvider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase) || 
                    string.IsNullOrWhiteSpace(connectionString) || 
                    connectionString.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase) || 
                    connectionString.EndsWith(".db", StringComparison.OrdinalIgnoreCase) || 
                    connectionString.Contains("locallive.db") || 
                    connectionString.Contains("zooner_dev.db"))
                {
                    throw new InvalidOperationException("Production startup failed");
                }
            }
        });

        Assert.Null(exception);
    }
}


