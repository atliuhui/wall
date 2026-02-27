using Microsoft.AspNetCore.SignalR;

namespace MessageWall.Services
{
    public class MessageHub : Hub
    {
        internal enum ServerMethods
        {
            Join,
            SendMessage,
            SyncMessage,
        }
        internal enum ClientMethods
        {
            ReceiveMessage,
        }

        readonly StorageManager manager;

        public MessageHub(StorageManager storageManager)
        {
            manager = storageManager;
        }

        public async Task Join(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        }
        public async Task SyncMessage(string groupName)
        {
            var messages = manager.Download(groupName);
            foreach (var message in messages)
            {
                await ReceiveMessage(groupName, message);
            }
        }
        public async Task SendMessage(string user, string group, string? title, string content)
        {
            var upload = new MessageUploadModel
            {
                User = user,
                Title = title,
                Content = content,
            };
            var download = manager.Create(group, upload);

            await ReceiveMessage(group, download);
        }
        async Task ReceiveMessage(string group, MessageDownloadModel download)
        {
            await Clients.Group(group).SendAsync(nameof(ClientMethods.ReceiveMessage), download.User, group, download.Id, download.Created, download.Title, download.Base64Content, download.FormatContent);
        }
    }
}
