using System.Collections.Concurrent;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Zooner.Api.Data;

namespace Zooner.Tests;

public static class TestDbContextFactory
{
    private static readonly ConcurrentDictionary<string, SqliteConnection> _connections = new();

    public static AppDbContext Create(string? dbName = null)
    {
        var name = string.IsNullOrWhiteSpace(dbName) ? Guid.NewGuid().ToString("N") : string.Concat(dbName.Select(c => char.IsLetterOrDigit(c) ? c : '_'));
        var connectionString = $"Data Source={name};Mode=Memory;Cache=Shared;Foreign Keys=False";

        _connections.GetOrAdd(name, n =>
        {
            var conn = new SqliteConnection($"Data Source={n};Mode=Memory;Cache=Shared;Foreign Keys=False");
            conn.Open();
            return conn;
        });

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connectionString)
            .Options;

        var context = new AppDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }
}
