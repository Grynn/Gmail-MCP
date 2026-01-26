---
name: gmail-mcp
description: Gmail operations via IMAP/SMTP using app password authentication. Provides 7 tools: listMessages, findMessage, sendMessage, getMessage, downloadAttachments, peekMessage, and headMessage. Use when: (1) Reading/retrieving emails from inbox, (2) Searching Gmail with advanced queries, (3) Sending emails with attachments support, (4) Downloading email attachments by Message-ID/UID, (5) Peeking at message metadata without marking as read, (6) Fetching message bodies in HTML/text/raw formats with optional .eml export. Requires Docker MCP Gateway with gmail-mcp server configured and email app password stored as secret.
---

# Gmail MCP

Gmail Model Context Protocol server providing email operations via IMAP/SMTP with app password authentication.

## Prerequisites

### Docker MCP Gateway Setup

The gmail-mcp server must be running via Docker MCP Gateway with these configured:

1. **Server enabled** in `~/.docker/mcp/config.yaml`:
   ```yaml
   gmail-mcp:
     email_address: your-email@gmail.com
   ```

2. **Secret stored** in Docker Desktop:
   - Secret name: `gmail-mcp.email_password`
   - Value: Your 16-character Gmail app password

3. **Docker MCP Gateway running**:
   ```bash
   docker mcp gateway run --servers gmail-mcp
   ```

### Creating Gmail App Password

If you don't have an app password:
1. Visit https://myaccount.google.com/apppasswords
2. Sign in with your Google account
3. Select "Mail" for app
4. Generate and copy the 16-character password
5. Store it as Docker secret: `echo "xxxx xxxx xxxx xxxx" | docker mcp secret set gmail-mcp.email_password`

## Available Tools

### List Recent Messages

**Tool:** `listMessages`

Retrieve the most recent emails from inbox.

```json
{
  "count": 10
}
```

**Parameters:**
- `count` (optional): Number of messages (default: 10, max: 100)

**Example:** List last 20 messages
```json
{
  "count": 20
}
```

### Search Messages

**Tool:** `findMessage`

Search Gmail using advanced search syntax.

```json
{
  "query": "from:john@example.com attachment:pdf"
}
```

**Parameters:**
- `query` (required): Search query using Gmail search syntax

**Search Operators:**
- `from:` - Specific sender
- `to:` - Specific recipient
- `subject:` - Subject keywords
- `has:attachment` - Messages with attachments
- `filename:` - Specific attachment name
- `before:`, `after:` - Date range
- `is:unread`, `is:starred` - Status filters
- Boolean operators: `AND`, `OR`, `-` (exclude)

**Examples:**
```json
// Unread messages from last week
{"query": "is:unread after:2025-01-20"}

// PDF attachments from boss
{"query": "from:boss@company.com filename:pdf"}

// Messages with "invoice" excluding newsletters
{"query": "invoice -from:newsletter@example.com"}
```

### Send Message

**Tool:** `sendMessage`

Send emails with optional CC/BCC.

```json
{
  "to": "recipient@example.com",
  "subject": "Report attached",
  "body": "Please find the report attached."
}
```

**Parameters:**
- `to` (required): Recipient email address
- `subject` (required): Email subject
- `body` (required): Email message body
- `cc` (optional): CC recipient
- `bcc` (optional): BCC recipient

**Example:** Send with CC
```json
{
  "to": "primary@example.com",
  "subject": "Meeting notes",
  "body": "Here are the notes from today's meeting.",
  "cc": "manager@example.com"
}
```

### Get Message Body

**Tool:** `getMessage`

Fetch full message body in various formats with optional raw export.

```json
{
  "id": "12345",
  "format": "html"
}
```

**Parameters:**
- `id` (required): Message UID or Message-ID
- `format` (optional): Output format - `html`, `text`, or `raw` (default: `text`)
- `saveRawToFile` (optional): If `true` and format is `raw`, saves as `.eml` file

**Formats:**
- `html`: Full HTML body (recommended for rich formatting)
- `text`: Plain text body
- `raw`: Complete raw message with headers (use with `saveRawToFile: true` for .eml export)

**Examples:**
```json
// Get HTML body
{"id": "12345", "format": "html"}

// Export as .eml file
{"id": "12345", "format": "raw", "saveRawToFile": true}
```

### Download Attachments

**Tool:** `downloadAttachments`

Download attachments from one or more messages with filtering support.

```json
{
  "messageIds": ["abc123@example.com", "def456@example.com"],
  "idType": "message-id",
  "filter": {
    "nameContains": "invoice",
    "mimeTypes": ["application/pdf"]
  }
}
```

**Parameters:**
- `messageIds` (required): Array of message IDs or UIDs
- `idType` (required): Identifier type - `message-id` or `uid`
- `outputDir` (optional): Download directory (default: current directory)
- `filter` (optional): Attachment filters
  - `nameContains`: Match filename (case-insensitive)
  - `mimeTypes`: Array of MIME types to include
  - `minSize`: Minimum file size in bytes
  - `maxSize`: Maximum file size in bytes

**MIME Type Examples:**
- `application/pdf` - PDF documents
- `image/jpeg`, `image/png` - Images
- `application/zip` - ZIP archives
- `application/vnd.ms-excel` - Excel files

**Examples:**
```json
// Download all PDF attachments from message
{
  "messageIds": ["12345"],
  "idType": "uid",
  "filter": {
    "mimeTypes": ["application/pdf"]
  }
}

// Download large images from multiple messages
{
  "messageIds": ["msg1@example.com", "msg2@example.com"],
  "idType": "message-id",
  "filter": {
    "mimeTypes": ["image/jpeg", "image/png"],
    "minSize": 1048576
  },
  "outputDir": "./downloads"
}
```

### Peek Message Metadata

**Tools:** `peekMessage` or `headMessage`

Inspect message headers, body metadata, and attachment summaries WITHOUT marking as read.

```json
{
  "messageIds": "abc123@example.com",
  "idType": "message-id"
}
```

**Parameters:**
- `messageIds` (required): Single Message-ID/UID as string, or array for multiple
- `idType` (required): Identifier type - `message-id` or `uid`

**Returns:**
- Full headers (From, To, Subject, Date, Message-ID)
- Body metadata (size, line count, preview)
- Attachment list (filename, size, MIME type)
- **Does NOT mark message as read** (uses PEEK instead of FETCH)

**Examples:**
```json
// Peek single message
{"messageIds": "12345", "idType": "uid"}

// Peek multiple messages
{
  "messageIds": ["msg1@example.com", "msg2@example.com"],
  "idType": "message-id"
}
```

## Common Errors & Solutions

### Error: "gmail-mcp.email_password secret not found"

**Cause:** Email app password secret not configured in Docker Desktop.

**Solution:**
```bash
echo "xxxx xxxx xxxx xxxx" | docker mcp secret set gmail-mcp.email_password
```

Replace `xxxx xxxx xxxx xxxx` with your actual 16-character Gmail app password.

### Error: "Authentication failed: Invalid credentials"

**Cause:** Incorrect app password or email address mismatch.

**Solutions:**
1. Verify app password is correct (16 characters, spaces included)
2. Check `~/.docker/mcp/config.yaml` has correct `email_address`
3. Regenerate app password if needed (old passwords may expire)

### Error: "Cannot start gmail-mcp: failed to connect"

**Cause:** Docker MCP Gateway not running or server not properly configured.

**Solutions:**
1. Ensure Docker Desktop is running
2. Verify server is enabled in `~/.docker/mcp/config.yaml`
3. Check Docker image is available: `docker pull ghcr.io/grynn/imap-mcp:latest`
4. Restart gateway: `docker mcp gateway run --servers gmail-mcp`

### Error: "IMAP connection timeout"

**Cause:** Network issues or Gmail IMAP not enabled.

**Solutions:**
1. Check internet connection
2. Ensure IMAP is enabled in Gmail Settings > See all settings > Forwarding and POP/IMAP
3. Verify firewall allows IMAP port 993

### Error: "Message not found" or "No such message"

**Cause:** Invalid message ID, UID, or message deleted.

**Solutions:**
1. Use `findMessage` or `listMessages` to get valid IDs first
2. Check if using correct ID type (`message-id` vs `uid`)
3. Message may have been deleted

### Error: "No attachments found"

**Cause:** Message has no attachments or filter too restrictive.

**Solutions:**
1. Use `peekMessage` to verify attachments exist
2. Check filter criteria (try without filters first)
3. Ensure correct MIME type in filter

## Best Practices

1. **Use `peekMessage` before downloading** - Inspect metadata without marking as read
2. **Batch downloads with `downloadAttachments`** - Pass multiple message IDs for efficiency
3. **Leverage Gmail search syntax** - Use advanced operators in `findMessage` queries
4. **Prefer `message-id` over `uid`** - Message-IDs are stable across sessions
5. **Export with `saveRawToFile`** - Use `format: "raw"` with `saveRawToFile: true` for .eml archives

## Testing Configuration

Verify your setup with this quick test:

```json
// Test 1: List messages
{"count": 1}

// Test 2: Peek at message
{"messageIds": "<first-message-id-from-list>", "idType": "message-id"}

// Test 3: Search
{"query": "is:unread"}
```

If all three succeed, your gmail-mcp server is properly configured.
