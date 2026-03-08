import { BaseTool, type ToolResult } from '../src/tools/BaseTool.js';
import type { Tool } from '../src/llm/types.js';

export class EmailSenderTool extends BaseTool {
  readonly name = 'email_sender';
  readonly description = 'Tool for sending emails using SMTP configuration';

  getTools(): Tool[] {
    return [
      {
        name: 'send_email',
        description: 'Send a basic email',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address',
            },
            subject: {
              type: 'string',
              description: 'Email subject',
            },
            body: {
              type: 'string',
              description: 'Email body content',
            },
            from: {
              type: 'string',
              description: 'Sender email address (optional, uses default if not provided)',
            },
            cc: {
              type: 'string',
              description: 'CC email addresses (comma separated)',
            },
            bcc: {
              type: 'string',
              description: 'BCC email addresses (comma separated)',
            }
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'send_html_email',
        description: 'Send an email with HTML content',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address',
            },
            subject: {
              type: 'string',
              description: 'Email subject',
            },
            html_body: {
              type: 'string',
              description: 'HTML email body content',
            },
            text_body: {
              type: 'string',
              description: 'Plain text version of email body',
            },
            from: {
              type: 'string',
              description: 'Sender email address',
            }
          },
          required: ['to', 'subject', 'html_body'],
        },
      },
      {
        name: 'configure_smtp',
        description: 'Configure SMTP settings for email sending',
        parameters: {
          type: 'object',
          properties: {
            smtp_host: {
              type: 'string',
              description: 'SMTP server hostname',
            },
            smtp_port: {
              type: 'number',
              description: 'SMTP server port (usually 587 for TLS or 465 for SSL)',
            },
            smtp_user: {
              type: 'string',
              description: 'SMTP username/email',
            },
            smtp_pass: {
              type: 'string',
              description: 'SMTP password or app password',
            },
            default_from: {
              type: 'string',
              description: 'Default sender email address',
            }
          },
          required: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'],
        },
      }
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'send_email':
        return this.sendEmail(params);
      case 'send_html_email':
        return this.sendHtmlEmail(params);
      case 'configure_smtp':
        return this.configureSmtp(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async sendEmail(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Проверяем наличие nodemailer
      let nodemailer: any;
      try {
        nodemailer = await import('nodemailer');
      } catch (importError) {
        console.log('Nodemailer import error:', importError);
        return this.error('Nodemailer module not available. Please install with: npm install nodemailer');
      }

      const to = params['to'] as string;
      const subject = params['subject'] as string;
      const body = params['body'] as string;
      const from = params['from'] as string || process.env.EMAIL_FROM || process.env.SMTP_USER;
      const cc = params['cc'] as string;
      const bcc = params['bcc'] as string;

      // Проверяем конфигурацию SMTP
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return this.error('SMTP not configured. Please use configure_smtp first.');
      }
    
      // Создаем transporter - ИСПРАВЛЕНО: createTransport (правильное название метода)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true для порта 465, false для других
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    
      const mailOptions = {
        from: from,
        to: to,
        subject: subject,
        text: body,
        cc: cc,
        bcc: bcc
      };

      // Фактически отправляем письмо
      const result = await transporter.sendMail(mailOptions);
      
      return this.success(`Email sent successfully to ${to}. MessageId: ${result.messageId}`);
    
    } catch (error: any) {
      console.log('Email sending error:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      return this.error(`Failed to send email: ${errorMessage}`);
    }
  }

  private async sendHtmlEmail(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Проверяем наличие nodemailer
      let nodemailer: any;
      try {
        nodemailer = await import('nodemailer');
      } catch (importError) {
        console.log('Nodemailer import error:', importError);
        return this.error('Nodemailer module not available. Please install with: npm install nodemailer');
      }

      const to = params['to'] as string;
      const subject = params['subject'] as string;
      const htmlBody = params['html_body'] as string;
      const textBody = params['text_body'] as string;
      const from = params['from'] as string || process.env.EMAIL_FROM || process.env.SMTP_USER;

      // Проверяем конфигурацию SMTP
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return this.error('SMTP not configured. Please use configure_smtp first.');
      }
    
      // Создаем transporter - ИСПРАВЛЕНО: createTransport (правильное название метода)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true для порта 465, false для других
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    
      const mailOptions = {
        from: from,
        to: to,
        subject: subject,
        html: htmlBody,
        text: textBody || htmlBody.replace(/<[^>]*>/g, '') // Убираем HTML теги если нет текстовой версии
      };

      // Фактически отправляем письмо
      const result = await transporter.sendMail(mailOptions);
    
      return this.success(`HTML email sent successfully to ${to}. MessageId: ${result.messageId}`);
    
    } catch (error: any) {
      console.log('HTML email sending error:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      return this.error(`Failed to send HTML email: ${errorMessage}`);
    }
  }

  private async configureSmtp(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const smtpHost = params['smtp_host'] as string;
      const smtpPort = params['smtp_port'] as number;
      const smtpUser = params['smtp_user'] as string;
      const smtpPass = params['smtp_pass'] as string;
      const defaultFrom = params['default_from'] as string;
    
      // Сохраняем конфигурацию в переменных среды
      process.env.SMTP_HOST = smtpHost;
      process.env.SMTP_PORT = String(smtpPort);
      process.env.SMTP_USER = smtpUser;
      process.env.SMTP_PASS = smtpPass;
      if (defaultFrom) {
        process.env.EMAIL_FROM = defaultFrom;
      }
    
      return this.success(`SMTP configured for ${smtpHost}:${smtpPort} with user ${smtpUser}`);
    
    } catch (error: any) {
      console.log('SMTP configuration error:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      return this.error(`Failed to configure SMTP: ${errorMessage}`);
    }
  }

}

// Export for dynamic loading
export default EmailSenderTool;