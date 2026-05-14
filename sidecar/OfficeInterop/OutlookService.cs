using System.Text.Json;
using Azure.Identity;
using Microsoft.Graph;
using Microsoft.Graph.Models;

public static class OutlookService
{
    private static GraphServiceClient BuildClient(JsonElement args)
    {
        var tenantId = args.GetProperty("tenantId").GetString()!;
        var clientId = args.GetProperty("clientId").GetString()!;
        var secret = args.GetProperty("clientSecret").GetString()!;

        var cred = new ClientSecretCredential(tenantId, clientId, secret);
        return new GraphServiceClient(cred);
    }

    public static object SendEmail(JsonElement args)
    {
        var client = BuildClient(args);
        var to = args.GetProperty("to").GetString()!;
        var subject = args.GetProperty("subject").GetString()!;
        var bodyText = args.GetProperty("body").GetString()!;

        var message = new Message
        {
            Subject = subject,
            Body = new ItemBody
            {
                Content = bodyText,
                ContentType = BodyType.Text,
            },
            ToRecipients =
            [
                new Recipient { EmailAddress = new EmailAddress { Address = to } },
            ],
        };

        var body = new Microsoft.Graph.Me.SendMail.SendMailPostRequestBody
        {
            Message = message,
            SaveToSentItems = true,
        };

        if (args.TryGetProperty("mailbox", out var mb) && mb.ValueKind == JsonValueKind.String)
        {
            var mailbox = mb.GetString()!;
            var userBody = new Microsoft.Graph.Users.Item.SendMail.SendMailPostRequestBody
            {
                Message = message,
                SaveToSentItems = true,
            };
            client.Users[mailbox].SendMail.PostAsync(userBody).GetAwaiter().GetResult();
        }
        else
        {
            client.Me.SendMail.PostAsync(body).GetAwaiter().GetResult();
        }

        return new { sent = true };
    }

    public static object ListInbox(JsonElement args)
    {
        var client = BuildClient(args);
        var top = args.TryGetProperty("top", out var t) ? t.GetInt32() : 10;

        MessageCollectionResponse? messages;
        if (args.TryGetProperty("mailbox", out var mb) && mb.ValueKind == JsonValueKind.String)
        {
            var mailbox = mb.GetString()!;
            messages = client.Users[mailbox].Messages.GetAsync(requestConfiguration =>
            {
                requestConfiguration.QueryParameters.Top = top;
                requestConfiguration.QueryParameters.Select = ["subject", "from", "receivedDateTime", "isRead"];
                requestConfiguration.QueryParameters.Orderby = ["receivedDateTime DESC"];
            }).GetAwaiter().GetResult();
        }
        else
        {
            messages = client.Me.Messages.GetAsync(requestConfiguration =>
            {
                requestConfiguration.QueryParameters.Top = top;
                requestConfiguration.QueryParameters.Select = ["subject", "from", "receivedDateTime", "isRead"];
                requestConfiguration.QueryParameters.Orderby = ["receivedDateTime DESC"];
            }).GetAwaiter().GetResult();
        }

        var items = messages?.Value?.Select(m => new
        {
            subject = m.Subject,
            from = m.From?.EmailAddress?.Address,
            received = m.ReceivedDateTime?.ToString("o"),
            isRead = m.IsRead,
        }) ?? [];

        return new { messages = items };
    }
}
