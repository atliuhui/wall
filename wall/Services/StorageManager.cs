using Microsoft.AspNetCore.StaticFiles;
using System.Collections.Concurrent;
using System.IO.Hashing;
using System.Text;
using System.Text.Json;

namespace MessageWall.Services
{
    public class StorageManager
    {
        readonly DirectoryInfo root;

        readonly FileExtensionContentTypeProvider provider;
        readonly ConcurrentDictionary<string, MessageIndexModel> indices;

        public StorageManager(string rootPath)
        {
            root = new DirectoryInfo(rootPath);
            if (!root.Exists)
            {
                root.Create();
            }

            provider = new FileExtensionContentTypeProvider();
            indices = new ConcurrentDictionary<string, MessageIndexModel>();
            Load();
        }

        void Save()
        {
            lock (this)
            {
                var path = Path.Combine(root.FullName, "indices.json");
                var text = JsonSerializer.Serialize(indices.Values);
                File.WriteAllText(path, text, Encoding.UTF8);
            }
        }
        void Load()
        {
            lock (this)
            {
                var path = Path.Combine(root.FullName, "indices.json");
                if (File.Exists(path))
                {
                    var text = File.ReadAllText(path, Encoding.UTF8);
                    var models = JsonSerializer.Deserialize<List<MessageIndexModel>>(text);
                    if (models != null)
                    {
                        indices.Clear();
                        foreach (var model in models)
                        {
                            indices.TryAdd(model.Id, model);
                        }
                    }
                }
            }
        }
        public IEnumerable<MessageDownloadModel> Download(string space)
        {
            var messages = indices.Values
                .Where(item => item.SpaceName == space)
                .OrderBy(item => item.Created)
                .Select(ConvertTo);

            return messages;
        }
        public MessageIndexModel? Download(string space, string id)
        {
            var message = indices.Values
                .Where(item => item.SpaceName == space && item.Id == id)
                .FirstOrDefault();

            return message;
        }
        public MessageDownloadModel Create(string space, MessageUploadModel model)
        {
            var index = ConvertTo(space, model);
            var file = new FileInfo(index.FilePath);
            if (file.Directory?.Exists == false) file.Directory.Create();

            switch (index.ContentType)
            {
                case "text/plain":
                    File.WriteAllText(index.FilePath, model.Content, Encoding.UTF8);
                    break;
                default:
                    File.WriteAllBytes(index.FilePath, Convert.FromBase64String(model.Content));
                    break;
            }
            indices.AddOrUpdate(index.Id, index, (_, _) => index);
            Save();

            return ConvertTo(index);
        }
        public void Delete(string id)
        {
            if (indices.TryRemove(id, out var index))
            {
                if (File.Exists(index.FilePath))
                {
                    File.Delete(index.FilePath);
                }
                Save();
            }
        }
        public void CleanupExpiredMessage(DateTime time)
        {
            var expired = indices.Values.Where(item => item.Created < time).ToList();
            foreach (var item in expired)
            {
                Delete(item.Id);
            }
        }
        MessageIndexModel ConvertTo(string space, MessageUploadModel upload)
        {
            var id = Guid.NewGuid().ToString("N");
            var extension = Path.GetExtension(upload.Title ?? ".txt");
            if (!provider.TryGetContentType(extension, out var contentType))
            {
                contentType = "application/octet-stream";
            }

            var index = new MessageIndexModel
            {
                Id = id,
                Created = DateTime.Now,
                Title = upload.Title ?? $"{XxHash32.HashToUInt32(Encoding.UTF8.GetBytes(upload.Content)).ToString("X8")}{extension}",
                ContentType = contentType,
                User = upload.User,
                SpaceName = space,
                FileName = $"{id}{extension}",
                FilePath = Path.Combine(root.FullName, space, $"{id}{extension}"),
            };

            return index;
        }
        MessageDownloadModel ConvertTo(MessageIndexModel index)
        {
            var download = new MessageDownloadModel
            {
                Id = index.Id,
                Created = index.Created,
                Title = index.Title,
                User = index.User,
                Base64Content = $"data:{index.ContentType};base64,{Convert.ToBase64String(File.ReadAllBytes(index.FilePath))}",
            };
            switch (index.ContentType)
            {
                case "text/plain":
                    download.FormatContent = File.ReadAllText(index.FilePath, Encoding.UTF8);
                    break;
                default:
                    download.FormatContent = index.Title;
                    break;
            }
            return download;
        }
    }

    public class MessageIndexModel
    {
        public string Id { get; set; }
        public DateTime Created { get; set; }
        public string Title { get; set; }
        public string ContentType { get; set; }
        public string User { get; set; }
        public string SpaceName { get; set; }
        public string FileName { get; set; }
        public string FilePath { get; set; }
    }

    public class MessageUploadModel
    {
        public string? Title { get; set; }
        public string Content { get; set; }
        public string User { get; set; }
    }
    public class MessageDownloadModel
    {
        public string Id { get; set; }
        public DateTime Created { get; set; }
        public string Title { get; set; }
        public string Base64Content { get; set; }
        public string FormatContent { get; set; }
        public string User { get; set; }
    }
}
