import nodemailer from 'nodemailer';
import { SendResult, SendMessageParams } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export class SmtpService {
  private transporter: nodemailer.Transporter;
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: config.user,
        pass: config.password,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Send an email message
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    try {
      const mailOptions = {
        from: this.config.user,
        to: params.to,
        subject: params.subject,
        text: params.body,
        cc: params.cc,
        bcc: params.bcc,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        messageId: info.messageId,
        success: true,
        message: 'Email sent successfully'
      };
    } catch (error) {
      return {
        messageId: '',
        success: false,
        message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP connection verification failed:', error);
      return false;
    }
  }
}