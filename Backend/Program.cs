using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
// Load .env before building configuration
DotNetEnv.Env.Load(System.IO.Path.Combine(System.IO.Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<Backend.Services.IVaultWriteLocker, Backend.Services.VaultWriteLocker>();
builder.Services.AddSingleton<Backend.Services.IVaultPathProvider, Backend.Services.VaultPathProvider>();
builder.Services.AddSingleton<Backend.Services.IGeminiService, Backend.Services.GeminiService>();
builder.Services.AddSingleton<Backend.Services.IVaultCacheService, Backend.Services.VaultCacheService>();
builder.Services.AddSingleton<Backend.Services.IPlacesEnrichmentService, Backend.Services.PlacesEnrichmentService>();
builder.Services.AddOpenApi();
builder.Services.AddHostedService<Backend.Services.VaultWatcherService>();

// Add CORS policy to allow Vite frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy => policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors("AllowFrontend");

app.MapControllers();

app.Run();
