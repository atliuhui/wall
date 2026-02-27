using MessageWall.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10 MB
});
builder.Services.AddSingleton(provider =>
{
    return new StorageManager("spaces");
});

var app = builder.Build();

// Configure the HTTP request pipeline.
//app.UseAuthorization();
app.MapControllers();
app.MapHub<MessageHub>("/hub");
app.UseFileServer(false);
app.UseRouting();

app.Run();
