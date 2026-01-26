import { z } from 'zod';

// Validation schemas
export const ListMessagesSchema = z.object({
  count: z.number().min(1).max(100).optional().default(10),
});

export const FindMessageSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
});

export const SendMessageSchema = z.object({
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject cannot be empty'),
  body: z.string().min(1, 'Message body cannot be empty'),
  cc: z.string().email().optional(),
  bcc: z.string().email().optional(),
});

export const GetMessageSchema = z.object({
  id: z.string().min(1, 'Message id cannot be empty'),
  format: z.enum(['html', 'text', 'raw']).optional().default('html'),
  saveRawToFile: z.boolean().optional().default(false),
  mailbox: z.string().min(1).optional().default('INBOX'),
});

export const AttachmentFilterSchema = z.object({
  name: z.string().min(1).optional(),
  nameContains: z.string().min(1).optional(),
  nameRegex: z.string().min(1).optional(),
  nameRegexFlags: z.string().optional(),
  mimeTypes: z.array(z.string().min(1)).optional(),
});

export const DownloadAttachmentsSchema = z.object({
  messageIds: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1),
  ]),
  idType: z.enum(['message-id', 'uid']).optional().default('message-id'),
  mailbox: z.string().min(1).optional().default('INBOX'),
  filter: AttachmentFilterSchema.optional(),
});

export const PeekMessageSchema = z.object({
  messageIds: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1),
  ]),
  idType: z.enum(['message-id', 'uid']).optional().default('message-id'),
  mailbox: z.string().min(1).optional().default('INBOX'),
});

export type ListMessagesParams = z.infer<typeof ListMessagesSchema>;
export type FindMessageParams = z.infer<typeof FindMessageSchema>;
export type SendMessageParams = z.infer<typeof SendMessageSchema>;
export type GetMessageParams = z.infer<typeof GetMessageSchema>;
export type AttachmentFilterParams = z.infer<typeof AttachmentFilterSchema>;
export type DownloadAttachmentsParams = z.infer<typeof DownloadAttachmentsSchema>;
export type PeekMessageParams = z.infer<typeof PeekMessageSchema>;

// Response types
export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

export interface SearchResult {
  messages: EmailMessage[];
  totalCount: number;
  query: string;
}

export interface SendResult {
  messageId: string;
  success: boolean;
  message: string;
}

export interface MessageContentResult {
  id: string;
  format: 'html' | 'text' | 'raw';
  body: string;
  mailbox: string;
  rawFilePath?: string;
  rawSize?: number;
  hasHtml?: boolean;
  hasText?: boolean;
}

export interface AttachmentResult {
  filename?: string;
  contentType: string;
  size: number;
  contentDisposition?: string;
  contentId?: string;
  savedTo?: string;
  inlineContent?: string;
}

export interface MessageAttachmentsResult {
  id: string;
  idType: 'message-id' | 'uid';
  mailbox: string;
  found: boolean;
  uid?: string;
  attachments: AttachmentResult[];
  error?: string;
}

export interface AttachmentMeta {
  filename?: string;
  contentType: string;
  size: number;
  contentDisposition?: string;
  contentId?: string;
}

export interface MessagePeekResult {
  id: string;
  idType: 'message-id' | 'uid';
  mailbox: string;
  found: boolean;
  uid?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  messageId?: string;
  hasHtml?: boolean;
  hasText?: boolean;
  htmlSize?: number;
  textSize?: number;
  attachmentCount: number;
  attachments: AttachmentMeta[];
  error?: string;
}
