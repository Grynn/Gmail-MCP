import Imap from 'imap';
import { EmailMessage, SearchResult } from './types.js';

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
}