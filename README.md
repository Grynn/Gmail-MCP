# Email MCP Server

A Model Context Protocol (MCP) server for email operations using IMAP/SMTP with app password authentication.

## Features

- **listMessages**: List the last 10 messages (or more if specified)
- **findMessage**: Search for messages containing specific words or phrases  
- **sendMessage**: Send emails with specified recipient and message body

## Simple Setup (No OAuth Required!)

### 1. Gmail App Password Setup

1. **Enable 2-Factor Authentication** on your Gmail account
2. Go to **Google Account Settings** → **Security** → **App passwords**
3. Generate an **App password** for "Mail"
4. Copy the 16-character app password

### 2. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```env
   EMAIL_ADDRESS=your_email@gmail.com
   EMAIL_PASSWORD=your_16_char_app_password
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   ```

3. Build and start:
   ```bash
   npm run build
   npm start
   ```

### 3. Docker Usage

1. Create your `.env` file (as above)

2. Build and run:
   ```bash
   npm run docker:build
   docker run --rm -i --env-file .env email-mcp-server
   ```

## MCP Client Integration

### Simple Docker Configuration

Add this to your MCP client settings:

```json
{
  "mcpServers": {
    "email": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--env-file", ".env",
        "email-mcp-server"
      ]
    }
  }
}
```

### Using with Docker Compose

```json
{
  "mcpServers": {
    "email": {
      "command": "docker-compose",
      "args": ["run", "--rm", "email-mcp-server"]
    }
  }
}
```

## Supported Email Providers

### Gmail (Default)
- IMAP: `imap.gmail.com:993` (SSL)
- SMTP: `smtp.gmail.com:587` (TLS)
- **Requires**: App password (not regular password)

### Outlook/Hotmail
Update `.env`:
```env
IMAP_HOST=outlook.office365.com
SMTP_HOST=smtp-mail.outlook.com
```

### Other Providers
Just update the IMAP/SMTP settings in your `.env` file!

## Usage Examples

### List Recent Messages
```json
{
  "count": 20
}
```

### Search Messages
```json
{
  "query": "important meeting"
}
```

### Send Email
```json
{
  "to": "recipient@example.com",
  "subject": "Hello from MCP!",
  "body": "This email was sent via the Email MCP Server"
}
```

## Why IMAP/SMTP vs Gmail API?

✅ **IMAP/SMTP Advantages:**
- Simple app password authentication
- Works with any email provider
- No OAuth2 complexity
- No Google Cloud Console setup
- Immediate setup (2 minutes)

❌ **Gmail API Disadvantages:**
- Complex OAuth2 flow
- Google Cloud Console configuration
- Token management and refresh
- Gmail-only (vendor lock-in)

## Usage with Claude Desktop

### Configuration
1. Add the MCP server configuration to your Claude Desktop config file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add this configuration:
```json
{
  "mcpServers": {
    "email-server": {
      "command": "node",
      "args": ["C:\\path\\to\\your\\emailMCP\\dist\\index.js"],
      "cwd": "C:\\path\\to\\your\\emailMCP",
      "env": {
        "NODE_ENV": "production",
        "EMAIL_ADDRESS": "your-email@gmail.com",
        "EMAIL_PASSWORD": "your-app-password",
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587"
      }
    }
  }
}
```

3. Update the paths and credentials with your actual values
4. Restart Claude Desktop
5. Test with commands like:
   - "List my recent emails"
   - "Search for emails from john@example.com"
   - "Send an email to test@example.com with subject 'Test' and message 'Hello!'"

### Docker Usage
```bash
npm run docker:build
npm run docker:up
# Check logs:
npm run docker:logs
```

## Troubleshooting

### Authentication Errors
- Ensure 2FA is enabled on Gmail
- Use App Password, not your regular password
- Check that IMAP is enabled in Gmail settings

### Connection Issues
- Verify IMAP/SMTP settings for your provider
- Check firewall/network restrictions
- Ensure ports 993 (IMAP) and 587 (SMTP) are open

### Docker Issues
- Make sure `.env` file exists and is properly formatted
- Build the image first: `npm run docker:build`
- Check Docker logs: `npm run docker:logs`

## Usage

The server provides three main tools:

### listMessages
Lists recent messages from your Gmail inbox.
- Parameters: 
  - `count` (optional, default: 10, max: 100) - Number of messages to retrieve

Example:
```json
{
  "count": 20
}
```

### findMessage  
Searches for messages containing specific words.
- Parameters: 
  - `query` (required) - Search query using Gmail search syntax

Example:
```json
{
  "query": "from:example@gmail.com subject:important"
}
```

### sendMessage
Sends an email message.
- Parameters: 
  - `to` (required) - Recipient email address
  - `subject` (required) - Email subject
  - `body` (required) - Email message body
  - `cc` (optional) - CC email address
  - `bcc` (optional) - BCC email address

Example:
```json
{
  "to": "recipient@example.com",
  "subject": "Hello from MCP Server",
  "body": "This is a test message sent from the Email MCP Server!"
}
```

## Gmail Search Syntax

The `findMessage` tool supports Gmail's advanced search syntax:
- `from:sender@example.com` - Find emails from specific sender
- `to:recipient@example.com` - Find emails to specific recipient
- `subject:keyword` - Find emails with keyword in subject
- `has:attachment` - Find emails with attachments
- `is:unread` - Find unread emails
- `after:2023/01/01` - Find emails after specific date
- `before:2023/12/31` - Find emails before specific date

## Development

Run in development mode:
```bash
npm run dev
```

Watch for changes:
```bash
npm run watch
```

## Troubleshooting

### Authentication Errors
- Ensure 2FA is enabled on Gmail
- Use App Password, not your regular password
- Check that IMAP is enabled in Gmail settings

### Connection Issues
- Verify IMAP/SMTP settings for your provider
- Check firewall/network restrictions
- Ensure ports 993 (IMAP) and 587 (SMTP) are open

### Docker Issues
- Make sure `.env` file exists and is properly formatted
- Build the image first: `npm run docker:build`
- Check Docker logs: `npm run docker:logs`