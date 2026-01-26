import Imap from 'imap';
import { simpleParser } from 'mailparser';
import type { Attachment } from 'mailparser';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EmailMessage,
  SearchResult,
  MessageContentResult,
  AttachmentFilterParams,
  MessageAttachmentsResult,
  AttachmentResult,
  MessagePeekResult,
  AttachmentMeta,
} from './types.js';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export class ImapService {
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  private normalizeMessageIds(messageIds: string | string[]): string[] {
    return Array.isArray(messageIds) ? messageIds : [messageIds];
  }

  private buildMessageIdCandidates(messageId: string): string[] {
    const trimmed = messageId.trim();
    if (!trimmed) return [];

    const hasBrackets = trimmed.startsWith('<') && trimmed.endsWith('>');
    if (hasBrackets) {
      const stripped = trimmed.slice(1, -1);
      return stripped ? [trimmed, stripped] : [trimmed];
    }
    return [`<${trimmed}>`, trimmed];
  }

  private buildAttachmentPredicate(filter?: AttachmentFilterParams) {
    if (!filter) {
      return () => true;
    }

    let nameRegex: RegExp | null = null;
    if (filter.nameRegex) {
      try {
        nameRegex = new RegExp(filter.nameRegex, filter.nameRegexFlags || '');
      } catch (error) {
        throw new Error(`Invalid nameRegex: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    const normalizedName = filter.name?.toLowerCase();
    const normalizedContains = filter.nameContains?.toLowerCase();
    const normalizedMimeTypes = filter.mimeTypes?.map((entry) => entry.toLowerCase()) || [];

    return (attachment: Attachment) => {
      if (normalizedName || normalizedContains || nameRegex) {
        const filename = attachment.filename || '';
        const lowerFilename = filename.toLowerCase();

        if (normalizedName && lowerFilename !== normalizedName) {
          return false;
        }

        if (normalizedContains && !lowerFilename.includes(normalizedContains)) {
          return false;
        }

        if (nameRegex && !nameRegex.test(filename)) {
          return false;
        }
      }

      if (normalizedMimeTypes.length > 0) {
        const contentType = attachment.contentType?.toLowerCase() || '';
        const matches = normalizedMimeTypes.some((mime) => {
          if (mime.endsWith('/*')) {
            return contentType.startsWith(mime.slice(0, -2));
          }
          return contentType === mime;
        });
        if (!matches) return false;
      }

      return true;
    };
  }

  private shouldInlineTextAttachment(contentType: string, content: Buffer): boolean {
    const normalized = contentType.toLowerCase();
    const isText = normalized.startsWith('text/');
    const isMarkdown = normalized.startsWith('text/markdown') || normalized.startsWith('text/x-markdown') || normalized.startsWith('text/md');
    const isOtherInline =
      normalized === 'application/json' ||
      normalized === 'application/xml' ||
      normalized === 'text/xml' ||
      normalized === 'application/yaml' ||
      normalized === 'application/x-yaml';

    if (!isText && !isMarkdown && !isOtherInline) return false;

    const text = content.toString('utf8');
    return text.length < 1000;
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .trim();
  }

  private async writeAttachmentToTemp(content: Buffer, filename: string, uid: string): Promise<string> {
    const token = randomBytes(6).toString('hex');
    const safeName = filename.replace(/[\\\/]/g, '_') || `attachment-${uid}-${token}`;
    const filePath = join(tmpdir(), `${token}-${safeName}`);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  private fetchRawByUid(imap: Imap, uid: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let found = false;

      const fetch = imap.fetch([uid], {
        bodies: '',
        struct: false,
        markSeen: false,
      });

      fetch.on('message', (msg: any) => {
        found = true;
        msg.on('body', (stream: any) => {
          stream.on('data', (chunk: any) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
        });
      });

      fetch.once('error', (err: any) => {
        reject(err);
      });

      fetch.once('end', () => {
        if (!found) {
          reject(new Error(`Message not found for UID: ${uid}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }

  private searchUidsByHeader(imap: Imap, header: string, value: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      imap.search([['HEADER', header, value]], (err: any, results: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results || []);
      });
    });
  }

  private async resolveUidForMessageId(imap: Imap, messageId: string): Promise<number | null> {
    const candidates = this.buildMessageIdCandidates(messageId);
    for (const candidate of candidates) {
      const results = await this.searchUidsByHeader(imap, 'MESSAGE-ID', candidate);
      if (results.length > 0) {
        return results[0];
      }
    }
    return null;
  }

  private async writeRawToTemp(raw: Buffer, uid: number): Promise<{ path: string; size: number }> {
    const token = randomBytes(6).toString('hex');
    const filename = `message-${uid}-${token}.eml`;
    const filePath = join(tmpdir(), filename);
    await fs.writeFile(filePath, raw);
    return { path: filePath, size: raw.length };
  }

  /**
   * List recent messages from INBOX
   */
  async listMessages(count: number = 10): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      const messages: EmailMessage[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err: any, box: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Get the most recent messages
          const total = box.messages.total;
          const start = Math.max(1, total - count + 1);
          const range = `${start}:${total}`;

          const fetch = imap.seq.fetch(range, {
            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
            struct: true
          });

          fetch.on('message', (msg: any, seqno: any) => {
            let header = '';
            
            msg.on('body', (stream: any) => {
              stream.on('data', (chunk: any) => {
                header += chunk.toString('ascii');
              });
            });

            msg.once('attributes', (attrs: any) => {
              const uid = attrs.uid;
              const date = attrs.date;
              
              msg.once('end', () => {
                try {
                  const lines = header.split('\r\n');
                  const headers: any = {};
                  
                  lines.forEach(line => {
                    if (line.includes(':')) {
                      const [key, ...valueParts] = line.split(':');
                      headers[key.toLowerCase().trim()] = valueParts.join(':').trim();
                    }
                  });

                  const message: EmailMessage = {
                    id: uid.toString(),
                    threadId: uid.toString(),
                    subject: headers.subject || '(No Subject)',
                    from: headers.from || '',
                    to: [headers.to || ''],
                    date: date?.toISOString() || new Date().toISOString(),
                    snippet: `${headers.subject || '(No Subject)'} - ${headers.from || 'Unknown sender'}`,
                    labels: ['INBOX']
                  };

                  messages.push(message);
                } catch (error) {
                  console.error('Error parsing message:', error);
                }
              });
            });
          });

          fetch.once('error', (err: any) => {
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();
            // Sort by date (newest first) and return
            messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            resolve(messages);
          });
        });
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Search for messages containing specific terms
   */
  async searchMessages(query: string): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      const messages: EmailMessage[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err: any, box: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Search for messages containing the query
          imap.search(['ALL', ['TEXT', query]], (err: any, results: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (results.length === 0) {
              resolve({
                messages: [],
                totalCount: 0,
                query
              });
              return;
            }

            // Limit results to avoid overwhelming response
            const limitedResults = results.slice(0, 50);

            const fetch = imap.fetch(limitedResults, {
              bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
              struct: true
            });

            fetch.on('message', (msg: any, seqno: any) => {
              let header = '';
              
              msg.on('body', (stream: any) => {
                stream.on('data', (chunk: any) => {
                  header += chunk.toString('ascii');
                });
              });

              msg.once('attributes', (attrs: any) => {
                const uid = attrs.uid;
                const date = attrs.date;
                
                msg.once('end', () => {
                  try {
                    const lines = header.split('\r\n');
                    const headers: any = {};
                    
                    lines.forEach(line => {
                      if (line.includes(':')) {
                        const [key, ...valueParts] = line.split(':');
                        headers[key.toLowerCase().trim()] = valueParts.join(':').trim();
                      }
                    });

                    const message: EmailMessage = {
                      id: uid.toString(),
                      threadId: uid.toString(),
                      subject: headers.subject || '(No Subject)',
                      from: headers.from || '',
                      to: [headers.to || ''],
                      date: date?.toISOString() || new Date().toISOString(),
                      snippet: `${headers.subject || '(No Subject)'} - ${headers.from || 'Unknown sender'}`,
                      labels: ['INBOX']
                    };

                    messages.push(message);
                  } catch (error) {
                    console.error('Error parsing message:', error);
                  }
                });
              });
            });

            fetch.once('error', (err: any) => {
              reject(err);
            });

            fetch.once('end', () => {
              imap.end();
              // Sort by date (newest first)
              messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              resolve({
                messages,
                totalCount: results.length,
                query
              });
            });
          });
        });
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Download attachments for one or more message IDs.
   */
  async downloadAttachments(
    messageIds: string | string[],
    idType: 'message-id' | 'uid',
    filter: AttachmentFilterParams | undefined,
    mailbox: string = 'INBOX'
  ): Promise<MessageAttachmentsResult[]> {
    const ids = this.normalizeMessageIds(messageIds);
    const predicate = this.buildAttachmentPredicate(filter);

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.openBox(mailbox, true, (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          const run = async () => {
            const results: MessageAttachmentsResult[] = [];

            for (const id of ids) {
              try {
                let uid: number | null = null;
                if (idType === 'uid') {
                  const parsed = Number.parseInt(id, 10);
                  uid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                } else {
                  uid = await this.resolveUidForMessageId(imap, id);
                }

                if (!uid) {
                  results.push({
                    id,
                    idType,
                    mailbox,
                    found: false,
                    attachments: [],
                  });
                  continue;
                }

                const rawBuffer = await this.fetchRawByUid(imap, uid);
                const parsedMail = await simpleParser(rawBuffer);
                const attachments = (parsedMail.attachments || []).filter(predicate);

                const processed: AttachmentResult[] = [];
                for (const attachment of attachments) {
                  const content = attachment.content as Buffer;
                  const contentType = attachment.contentType || 'application/octet-stream';
                  const size = attachment.size ?? content.length;
                  const filename = attachment.filename || undefined;
                  const effectiveName = filename || `attachment-${uid}`;

                  if (this.shouldInlineTextAttachment(contentType, content)) {
                    processed.push({
                      filename: effectiveName,
                      contentType,
                      size,
                      contentDisposition: attachment.contentDisposition || undefined,
                      contentId: attachment.cid || undefined,
                      inlineContent: content.toString('utf8'),
                    });
                    continue;
                  }

                  const savedTo = await this.writeAttachmentToTemp(content, effectiveName, uid.toString());
                  processed.push({
                    filename: effectiveName,
                    contentType,
                    size,
                    contentDisposition: attachment.contentDisposition || undefined,
                    contentId: attachment.cid || undefined,
                    savedTo,
                  });
                }

                results.push({
                  id,
                  idType,
                  mailbox,
                  found: true,
                  uid: uid.toString(),
                  attachments: processed,
                });
              } catch (error) {
                results.push({
                  id,
                  idType,
                  mailbox,
                  found: false,
                  attachments: [],
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }

            return results;
          };

          run()
            .then((results) => {
              imap.end();
              resolve(results);
            })
            .catch((runError) => {
              imap.end();
              reject(runError);
            });
        });
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Peek message headers/body metadata and attachment summaries without downloading attachments.
   */
  async peekMessages(
    messageIds: string | string[],
    idType: 'message-id' | 'uid',
    mailbox: string = 'INBOX'
  ): Promise<MessagePeekResult[]> {
    const ids = this.normalizeMessageIds(messageIds);

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.openBox(mailbox, true, (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          const run = async () => {
            const results: MessagePeekResult[] = [];

            for (const id of ids) {
              try {
                let uid: number | null = null;
                if (idType === 'uid') {
                  const parsed = Number.parseInt(id, 10);
                  uid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                } else {
                  uid = await this.resolveUidForMessageId(imap, id);
                }

                if (!uid) {
                  results.push({
                    id,
                    idType,
                    mailbox,
                    found: false,
                    attachmentCount: 0,
                    attachments: [],
                  });
                  continue;
                }

                const rawBuffer = await this.fetchRawByUid(imap, uid);
                const parsedMail = await simpleParser(rawBuffer);
                const attachments = parsedMail.attachments || [];

                const attachmentMeta: AttachmentMeta[] = attachments.map((attachment, index) => ({
                  filename: attachment.filename || `attachment-${uid}-${index + 1}`,
                  contentType: attachment.contentType || 'application/octet-stream',
                  size: attachment.size ?? (attachment.content as Buffer).length,
                  contentDisposition: attachment.contentDisposition || undefined,
                  contentId: attachment.cid || undefined,
                }));

                const htmlString = typeof parsedMail.html === 'string' ? parsedMail.html : '';
                const textString = parsedMail.text || '';

                const formatAddress = (addr: typeof parsedMail.from | typeof parsedMail.to | undefined) => {
                  if (!addr) return undefined;
                  if (Array.isArray(addr)) {
                    const parts = addr.map((entry) => entry.text).filter(Boolean);
                    return parts.length > 0 ? parts.join(', ') : undefined;
                  }
                  return addr.text || undefined;
                };

                results.push({
                  id,
                  idType,
                  mailbox,
                  found: true,
                  uid: uid.toString(),
                  subject: parsedMail.subject || undefined,
                  from: formatAddress(parsedMail.from),
                  to: formatAddress(parsedMail.to),
                  date: parsedMail.date ? parsedMail.date.toISOString() : undefined,
                  messageId: parsedMail.messageId || undefined,
                  hasHtml: Boolean(parsedMail.html),
                  hasText: Boolean(parsedMail.text),
                  htmlSize: htmlString ? htmlString.length : 0,
                  textSize: textString ? textString.length : 0,
                  attachmentCount: attachmentMeta.length,
                  attachments: attachmentMeta,
                });
              } catch (error) {
                results.push({
                  id,
                  idType,
                  mailbox,
                  found: false,
                  attachmentCount: 0,
                  attachments: [],
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }

            return results;
          };

          run()
            .then((results) => {
              imap.end();
              resolve(results);
            })
            .catch((runError) => {
              imap.end();
              reject(runError);
            });
        });
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Fetch a single message body as HTML or raw, optionally saving the raw message to a temp file.
   */
  async getMessageContent(
    id: string,
    format: 'html' | 'text' | 'raw',
    saveRawToFile: boolean,
    mailbox: string = 'INBOX'
  ): Promise<MessageContentResult> {
    const uid = Number.parseInt(id, 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      throw new Error(`Invalid message id: ${id}`);
    }

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      const rawChunks: Buffer[] = [];
      let foundMessage = false;

      const finalize = async () => {
        if (!foundMessage) {
          throw new Error(`Message not found for id: ${id}`);
        }

        const rawBuffer = Buffer.concat(rawChunks);
        let body = '';
        let hasHtml: boolean | undefined;
        let hasText: boolean | undefined;

        if (format === 'raw') {
          body = rawBuffer.toString('utf8');
        } else {
          const parsed = await simpleParser(rawBuffer);
          hasHtml = Boolean(parsed.html);
          hasText = Boolean(parsed.text);
          if (format === 'html') {
            if (typeof parsed.html === 'string') {
              body = parsed.html;
            } else if (parsed.textAsHtml) {
              body = parsed.textAsHtml;
            } else if (parsed.text) {
              body = parsed.text;
            } else {
              body = '';
            }
          } else {
            if (parsed.text) {
              body = parsed.text;
            } else if (typeof parsed.html === 'string') {
              body = this.htmlToText(parsed.html);
            } else if (parsed.textAsHtml) {
              body = this.htmlToText(parsed.textAsHtml);
            } else {
              body = '';
            }
          }
        }

        let rawFilePath: string | undefined;
        let rawSize: number | undefined;
        if (saveRawToFile) {
          const saved = await this.writeRawToTemp(rawBuffer, uid);
          rawFilePath = saved.path;
          rawSize = saved.size;
        }

        return {
          id,
          format,
          body,
          mailbox,
          rawFilePath,
          rawSize,
          hasHtml,
          hasText,
        };
      };

      imap.once('ready', () => {
        imap.openBox(mailbox, true, (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          const fetch = imap.fetch([uid], {
            bodies: '',
            struct: false,
            markSeen: false,
          });

          fetch.on('message', (msg: any) => {
            foundMessage = true;
            msg.on('body', (stream: any) => {
              stream.on('data', (chunk: any) => {
                rawChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              });
            });
          });

          fetch.once('error', (fetchErr: any) => {
            reject(fetchErr);
          });

          fetch.once('end', () => {
            imap.end();
            finalize()
              .then(resolve)
              .catch(reject);
          });
        });
      });

      imap.once('error', (err: any) => {
        reject(err);
      });

      imap.connect();
    });
  }
}
