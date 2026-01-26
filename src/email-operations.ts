import { ImapService } from './imap-service.js';
import { SmtpService } from './smtp-service.js';
import {
  EmailMessage,
  SearchResult,
  SendResult,
  MessageContentResult,
  MessageAttachmentsResult,
  ListMessagesParams,
  FindMessageParams,
  SendMessageParams,
  GetMessageParams,
  DownloadAttachmentsParams,
  PeekMessageParams,
  MessagePeekResult,
} from './types.js';

export class EmailOperations {
  constructor(
    private imapService: ImapService,
    private smtpService: SmtpService
  ) {}

  /**
   * List recent messages from email inbox
   */
  async listMessages(params: ListMessagesParams): Promise<EmailMessage[]> {
    try {
      return await this.imapService.listMessages(params.count);
    } catch (error) {
      throw new Error(`Failed to list messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for messages containing specific words
   */
  async findMessages(params: FindMessageParams): Promise<SearchResult> {
    try {
      return await this.imapService.searchMessages(params.query);
    } catch (error) {
      throw new Error(`Failed to search messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send an email message
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    try {
      return await this.smtpService.sendMessage(params);
    } catch (error) {
      return {
        messageId: '',
        success: false,
        message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Fetch a message body as HTML or raw, optionally saving the raw message to a temp file.
   */
  async getMessage(params: GetMessageParams): Promise<MessageContentResult> {
    try {
      return await this.imapService.getMessageContent(
        params.id,
        params.format,
        params.saveRawToFile,
        params.mailbox
      );
    } catch (error) {
      throw new Error(`Failed to fetch message content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download attachments for one or more message IDs.
   */
  async downloadAttachments(params: DownloadAttachmentsParams): Promise<MessageAttachmentsResult[]> {
    try {
      return await this.imapService.downloadAttachments(
        params.messageIds,
        params.idType,
        params.filter,
        params.mailbox
      );
    } catch (error) {
      throw new Error(`Failed to download attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Peek message headers/body metadata and attachment summaries.
   */
  async peekMessages(params: PeekMessageParams): Promise<MessagePeekResult[]> {
    try {
      return await this.imapService.peekMessages(
        params.messageIds,
        params.idType,
        params.mailbox
      );
    } catch (error) {
      throw new Error(`Failed to peek messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
