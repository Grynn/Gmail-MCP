import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { ImapService } from './imap-service.js';
import { SmtpService } from './smtp-service.js';
import { EmailOperations } from './email-operations.js';
import { 
  ListMessagesSchema, 
  FindMessageSchema, 
  SendMessageSchema,
  GetMessageSchema,
  DownloadAttachmentsSchema,
  PeekMessageSchema,
} from './types.js';

// Load environment variables
dotenv.config();

type EmailMcpEnvConfig = {
  emailAddress: string;
  emailPassword: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

function readSecretFile(path: string): string {
  const value = readFileSync(path, 'utf-8').trim();
  if (!value) {
    throw new Error(`Secret file is empty: ${path}`);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requirePassword(): string {
  const direct = process.env.EMAIL_PASSWORD?.trim();
  if (direct) return direct;

  const filePath = process.env.EMAIL_PASSWORD_FILE?.trim();
  if (filePath) return readSecretFile(filePath);

  throw new Error('Missing EMAIL_PASSWORD or EMAIL_PASSWORD_FILE');
}

function loadConfigFromEnv(): EmailMcpEnvConfig {
  const emailAddress = requireEnv('EMAIL_ADDRESS');
  const emailPassword = requirePassword();

  const imapHost = process.env.IMAP_HOST || 'imap.gmail.com';
  const imapPort = Number.parseInt(process.env.IMAP_PORT || '993', 10);
  if (!Number.isFinite(imapPort) || imapPort <= 0) {
    throw new Error(`Invalid IMAP_PORT: ${process.env.IMAP_PORT}`);
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
  }

  return {
    emailAddress,
    emailPassword,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
  };
}

class EmailMCPServer {
  private server: Server;
  private emailOperations: EmailOperations;

  constructor(cfg: EmailMcpEnvConfig) {
    this.server = new Server(
      {
        name: 'gmail-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize IMAP and SMTP services
    const imapConfig = {
      host: cfg.imapHost,
      port: cfg.imapPort,
      user: cfg.emailAddress,
      password: cfg.emailPassword,
      tls: true,
    };

    const smtpConfig = {
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      user: cfg.emailAddress,
      password: cfg.emailPassword,
    };

    const imapService = new ImapService(imapConfig);
    const smtpService = new SmtpService(smtpConfig);
    this.emailOperations = new EmailOperations(imapService, smtpService);

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'listMessages',
            description: 'List recent messages from Gmail inbox',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: 'Number of messages to retrieve (default: 10, max: 100)',
                  minimum: 1,
                  maximum: 100,
                  default: 10,
                },
              },
            },
          },
          {
            name: 'findMessage',
            description: 'Search for messages containing specific words or phrases',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (supports Gmail search syntax)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'sendMessage',
            description: 'Send an email message',
            inputSchema: {
              type: 'object',
              properties: {
                to: {
                  type: 'string',
                  description: 'Recipient email address',
                  format: 'email',
                },
                subject: {
                  type: 'string',
                  description: 'Email subject',
                },
                body: {
                  type: 'string',
                  description: 'Email message body',
                },
                cc: {
                  type: 'string',
                  description: 'CC email address (optional)',
                  format: 'email',
                },
                bcc: {
                  type: 'string',
                  description: 'BCC email address (optional)',
                  format: 'email',
                },
              },
              required: ['to', 'subject', 'body'],
            },
          },
          {
            name: 'getMessage',
            description: 'Fetch a single message body as HTML, text, or raw, optionally saving the raw message to a temp file',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Message UID from listMessages/findMessage results',
                },
                format: {
                  type: 'string',
                  description: 'Body format to return',
                  enum: ['html', 'text', 'raw'],
                  default: 'html',
                },
                saveRawToFile: {
                  type: 'boolean',
                  description: 'If true, write the raw RFC822 message to a temp file and return its path',
                  default: false,
                },
                mailbox: {
                  type: 'string',
                  description: 'Mailbox to open (default: INBOX)',
                  default: 'INBOX',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'downloadAttachments',
            description: 'Download attachments for one or more message IDs',
            inputSchema: {
              type: 'object',
              properties: {
                messageIds: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' }, minItems: 1 }
                  ],
                  description: 'Message-ID header value(s) or UID(s) depending on idType',
                },
                idType: {
                  type: 'string',
                  enum: ['message-id', 'uid'],
                  default: 'message-id',
                  description: 'Whether messageIds are Message-ID headers or UIDs',
                },
                mailbox: {
                  type: 'string',
                  description: 'Mailbox to open (default: INBOX)',
                  default: 'INBOX',
                },
                filter: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Exact filename match' },
                    nameContains: { type: 'string', description: 'Substring filename match' },
                    nameRegex: { type: 'string', description: 'Regex filename match' },
                    nameRegexFlags: { type: 'string', description: 'Regex flags (e.g. i)' },
                    mimeTypes: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Exact MIME types or wildcard entries like image/*',
                    },
                  },
                },
              },
              required: ['messageIds'],
            },
          },
          {
            name: 'peekMessage',
            description: 'Peek message headers/body metadata and attachment summaries',
            inputSchema: {
              type: 'object',
              properties: {
                messageIds: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' }, minItems: 1 }
                  ],
                  description: 'Message-ID header value(s) or UID(s) depending on idType',
                },
                idType: {
                  type: 'string',
                  enum: ['message-id', 'uid'],
                  default: 'message-id',
                  description: 'Whether messageIds are Message-ID headers or UIDs',
                },
                mailbox: {
                  type: 'string',
                  description: 'Mailbox to open (default: INBOX)',
                  default: 'INBOX',
                },
              },
              required: ['messageIds'],
            },
          },
          {
            name: 'headMessage',
            description: 'Alias for peekMessage: message headers/body metadata and attachment summaries',
            inputSchema: {
              type: 'object',
              properties: {
                messageIds: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' }, minItems: 1 }
                  ],
                  description: 'Message-ID header value(s) or UID(s) depending on idType',
                },
                idType: {
                  type: 'string',
                  enum: ['message-id', 'uid'],
                  default: 'message-id',
                  description: 'Whether messageIds are Message-ID headers or UIDs',
                },
                mailbox: {
                  type: 'string',
                  description: 'Mailbox to open (default: INBOX)',
                  default: 'INBOX',
                },
              },
              required: ['messageIds'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'listMessages': {
            const params = ListMessagesSchema.parse(args || {});
            const messages = await this.emailOperations.listMessages(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    count: messages.length,
                    messages: messages.map(msg => ({
                      id: msg.id,
                      subject: msg.subject,
                      from: msg.from,
                      date: msg.date,
                      snippet: msg.snippet,
                    })),
                  }, null, 2),
                },
              ],
            };
          }

          case 'findMessage': {
            const params = FindMessageSchema.parse(args);
            const result = await this.emailOperations.findMessages(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    query: result.query,
                    totalCount: result.totalCount,
                    foundMessages: result.messages.length,
                    messages: result.messages.map(msg => ({
                      id: msg.id,
                      subject: msg.subject,
                      from: msg.from,
                      date: msg.date,
                      snippet: msg.snippet,
                    })),
                  }, null, 2),
                },
              ],
            };
          }

          case 'sendMessage': {
            const params = SendMessageSchema.parse(args);
            const result = await this.emailOperations.sendMessage(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: result.success,
                    messageId: result.messageId,
                    message: result.message,
                  }, null, 2),
                },
              ],
            };
          }

          case 'getMessage': {
            const params = GetMessageSchema.parse(args);
            const result = await this.emailOperations.getMessage(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    id: result.id,
                    format: result.format,
                    mailbox: result.mailbox,
                    body: result.body,
                    rawFilePath: result.rawFilePath,
                    rawSize: result.rawSize,
                    hasHtml: result.hasHtml,
                    hasText: result.hasText,
                  }, null, 2),
                },
              ],
            };
          }

          case 'downloadAttachments': {
            const params = DownloadAttachmentsSchema.parse(args);
            const result = await this.emailOperations.downloadAttachments(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    results: result,
                  }, null, 2),
                },
              ],
            };
          }

          case 'peekMessage': {
            const params = PeekMessageSchema.parse(args);
            const result = await this.emailOperations.peekMessages(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    results: result,
                  }, null, 2),
                },
              ],
            };
          }

          case 'headMessage': {
            const params = PeekMessageSchema.parse(args);
            const result = await this.emailOperations.peekMessages(params);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    results: result,
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Gmail MCP server running on stdio');
  }
}

// Start the server
let cfg: EmailMcpEnvConfig;
try {
  cfg = loadConfigFromEnv();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Failed to load config from environment:', message);
  console.error('Required: EMAIL_ADDRESS and (EMAIL_PASSWORD or EMAIL_PASSWORD_FILE).');
  process.exit(1);
}

const server = new EmailMCPServer(cfg);
server.run().catch((error) => {
  console.error('Failed to start server:', error instanceof Error ? error.message : error);
  process.exit(1);
});
