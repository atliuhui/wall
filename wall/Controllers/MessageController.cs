using MessageWall.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace MessageWall.Controllers
{
    [ApiController]
    [Route("api/messages")]
    public class MessageController : ControllerBase
    {
        readonly StorageManager manager;
        readonly IHubContext<MessageHub> context;

        public MessageController(StorageManager manager, IHubContext<MessageHub> context)
        {
            this.manager = manager;
            this.context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Index([FromQuery] string group)
        {
            var messages = manager.Download(group);
            return Ok(messages);
        }

        [HttpPost]
        public async Task<IActionResult> Upload([FromQuery] string group, [FromQuery] string user)
        {
            MessageUploadModel model;
            if (Request.Form.Files.Any())
            {
                var file = Request.Form.Files.First();
                using (var stream = new MemoryStream())
                {
                    file.CopyTo(stream);
                    model = new MessageUploadModel
                    {
                        User = user,
                        Title = file.FileName,
                        Content = Convert.ToBase64String(stream.ToArray()),
                    };
                }
            }
            else if (Request.Form.TryGetValue("content", out var content))
            {
                model = new MessageUploadModel
                {
                    User = user,
                    Title = null,
                    Content = content.ToString(),
                };
            }
            else
            {
                return NoContent();
            }

            var download = manager.Create(group, model);
            await context.Clients.Group(group).SendAsync(nameof(MessageHub.ClientMethods.ReceiveMessage), model.User, group, download.Id, download.Created, download.Title, download.Base64Content, download.FormatContent);

            //return Ok(download);
            return Ok();
        }

        [HttpGet("{group}/{id}")]
        public async Task<IActionResult> Download([FromRoute] string group, [FromRoute] string id)
        {
            var model = manager.Download(group, id);

            if (model != null)
            {
                return PhysicalFile(model.FilePath, model.ContentType, model.Title);
            }
            else
            {
                return NoContent();
            }
        }
    }
}
