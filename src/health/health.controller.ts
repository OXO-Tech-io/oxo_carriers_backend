import { Controller, Get, Post, Body, Inject, Res, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { Public } from '../common/decorators/public.decorator';
import { PG_POOL } from '../database/database.module';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { allowedOrigins } from '../config/corsOrigins';

@Controller()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'OK', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('health/database')
  async dbHealth(@Res({ passthrough: true }) res: Response) {
    const resolvedDbPassword = String(env.DB_PASSWORD ?? '');
    const hasResolvedDbPassword = resolvedDbPassword.trim().length > 0;
    const resolveDbPasswordSource = (): 'env-var' | 'file' | 'none' => {
      if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim().length > 0) return 'env-var';
      if (process.env.DB_PASSWORD_FILE) return 'file';
      return 'none';
    };
    const dbPasswordSource = resolveDbPasswordSource();

    try {
      const dbCheck = await this.pool.query(
        `
        SELECT
          current_database() AS database_name,
          current_schema() AS schema_name,
          current_user AS db_user,
          now() AS server_time,
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
          ) AS has_tables_in_schema
        `,
        [env.DB_SCHEMA],
      );

      return {
        success: true,
        message: 'Database connectivity is healthy',
        connection: {
          mode: env.CLOUD_SQL_CONNECTION_NAME ? 'cloud-sql-socket' : 'tcp',
          configuredSchema: env.DB_SCHEMA,
          cloudSqlConnectionName: env.CLOUD_SQL_CONNECTION_NAME ?? null,
          dbPasswordConfigured: hasResolvedDbPassword,
          dbPasswordType: typeof env.DB_PASSWORD,
          dbPasswordSource,
        },
        database: dbCheck.rows[0],
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Database health check failed');
      res.status(500);
      return {
        success: false,
        message: 'Database connectivity failed',
        error: error.message,
        connection: {
          mode: env.CLOUD_SQL_CONNECTION_NAME ? 'cloud-sql-socket' : 'tcp',
          configuredSchema: env.DB_SCHEMA,
          dbPasswordConfigured: hasResolvedDbPassword,
          dbPasswordType: typeof env.DB_PASSWORD,
          dbPasswordSource,
        },
      };
    }
  }

  @Public()
  @Get('health/cors')
  corsCheck(@Req() req: Request) {
    const origin = req.headers.origin;
    const isAllowed = !!origin && allowedOrigins.includes(origin);
    return {
      success: true,
      cors: {
        requestOrigin: origin || 'no origin header',
        allowedOrigins,
        isOriginAllowed: isAllowed,
        frontendUrl: env.FRONTEND_URL ?? 'not set',
        nodeEnv: env.NODE_ENV,
      },
    };
  }

  @Public()
  @Get('health/email-config')
  emailConfigCheck() {
    return {
      success: true,
      message: 'SMTP Email Diagnostic Endpoint',
      config: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER ?? 'not set',
        from: env.SMTP_FROM ?? 'not set',
        nodeEnv: env.NODE_ENV,
      },
      troubleshooting: [
        'Ensure SMTP_HOST is correct (e.g. your outgoing mail server)',
        'Ensure SMTP_PORT is correct (e.g. 465 for SSL/TLS, 587 for STARTTLS)',
        'Verify SMTP_USER and SMTP_PASS are correctly configured in .env',
        'Check mail server SMTP logs if emails are not arriving',
      ],
    };
  }

  @Public()
  @Get('health/email-tests')
  testEmailInfo() {
    return {
      success: true,
      message: 'Test email endpoint is available. Use POST method to send emails.',
      usage: 'POST /api/v1/health/email-tests { "email": "your-email@example.com" }',
    };
  }

  @Public()
  @Post('health/email-tests')
  async sendTestEmail(
    @Body() body: { email?: string; subject?: string; message?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const testEmail = body.email || 'info@oxocareers.com';
      const emailSubject = body.subject || 'SMTP Test Email';

      const { sendEmail } = await import('../config/email');

      const params = {
        message: body.message || 'This is a test email to verify SMTP configuration is working correctly.',
        timestamp: new Date().toISOString(),
        to_email: testEmail,
      };

      const result = await sendEmail(testEmail, emailSubject, params);

      if (result) {
        return {
          success: true,
          message: `Test email sent successfully via SMTP to ${testEmail}`,
          status: result.status,
        };
      }
      res.status(500);
      return {
        success: false,
        message: 'Failed to send test email via SMTP. Check server logs for details.',
        hint: 'Make sure SMTP variables are set in .env',
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Test email failed');
      res.status(500);
      return {
        success: false,
        message: 'Error sending test email',
        error: error.message,
      };
    }
  }
}
