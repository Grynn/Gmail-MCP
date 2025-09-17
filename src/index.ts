import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { ImapService } from './imap-service.js';
import { SmtpService } from './smtp-service.js';
import { EmailOperations } from './email-operations.js';
import { 
  ListMessagesSchema, 
  FindMessageSchema, 
  SendMessageSchema,
  ListMessagesParams,
  FindMessageParams,
  SendMessageParams
} from './types.js';

// Load environment variables
dotenv.config();

class EmailMCPServer {
  private server: Server;
  private emailOperations: EmailOperations;

  constructor() {
    this.server = new Server(
      {
        name: 'email-mcp-server',
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
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      user: process.env.EMAIL_ADDRESS!,
      password: process.env.EMAIL_PASSWORD!,
      tls: true,
    };

    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.EMAIL_ADDRESS!,
      password: process.env.EMAIL_PASSWORD!,
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
    // Check if environment variables are set
    if (!process.env.EMAIL_ADDRESS || !process.env.EMAIL_PASSWORD) {
      console.error('Missing required environment variables. Please check your .env file.');
      console.error('Required variables: EMAIL_ADDRESS, EMAIL_PASSWORD');
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Email MCP server running on stdio');
  }
}

// Start the server
const server = new EmailMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});