import { AsyncLocalStorage } from 'async_hooks';
import pino, { Logger } from 'pino';
import * as Sentry from '@sentry/node';

import EnvVars, { NodeEnvs } from '@src/utils/env';

/******************************************************************************
                        Pino Logger
******************************************************************************/

const logger: Logger = pino({
  level: EnvVars.NodeEnv === NodeEnvs.PRODUCTION ? 'info' : 'debug',
  ...(EnvVars.NodeEnv === NodeEnvs.DEV && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/******************************************************************************
                        AsyncLocalStorage Store
******************************************************************************/

/**
 * Shared AsyncLocalStorage instance used to propagate the correlation ID
 * across the entire async call chain without passing it explicitly.
 *
 * Middleware writes the correlation ID at the start of each request.
 * LoggingService reads it whenever a log entry is written.
 */
export const asyncLocalStorage = new AsyncLocalStorage<{ correlationId: string }>();

/******************************************************************************
                            LoggingService
******************************************************************************/

/**
 * Centralised logging service backed by Pino.
 *
 * Reads the correlation ID from AsyncLocalStorage so every log line is
 * automatically linked to its originating request — no manual threading required.
 */
class LoggingService {
  private getCorrelationId(): string | undefined {
    return asyncLocalStorage.getStore()?.correlationId;
  }

  private buildMergeObject(meta?: Record<string, unknown>): Record<string, unknown> {
    const correlationId = this.getCorrelationId();
    return {
      ...(correlationId && { correlationId }),
      ...meta,
    };
  }

  /**
   * Adds a Sentry breadcrumb for the given log level and message.
   * Wrapped in try-catch so Sentry failures never break callers.
   */
  private addSentryBreadcrumb(
    level: 'info' | 'warning' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    try {
      const correlationId = this.getCorrelationId();
      Sentry.addBreadcrumb({
        category: 'log',
        level,
        message,
        data: {
          ...(correlationId && { correlationId }),
          ...meta,
        },
      });
    } catch {
      // Sentry failures must never break logging callers
    }
  }

  /**
   * Builds the Sentry log parameters object including the correlation ID.
   */
  private buildSentryParams(meta?: Record<string, unknown>): Record<string, unknown> {
    const correlationId = this.getCorrelationId();
    return {
      ...(correlationId && { correlationId }),
      ...meta,
    };
  }

  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(this.buildMergeObject(meta), message);
    try {
      Sentry.logger.info(message, this.buildSentryParams(meta));
    } catch {
      // Sentry failures must never break logging callers
    }
    this.addSentryBreadcrumb('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(this.buildMergeObject(meta), message);
    try {
      Sentry.logger.warn(message, this.buildSentryParams(meta));
    } catch {
      // Sentry failures must never break logging callers
    }
    this.addSentryBreadcrumb('warning', message, meta);
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const mergeObject: Record<string, unknown> = this.buildMergeObject(meta);
    if (error instanceof Error) {
      mergeObject['err'] = error;
    } else if (error !== undefined) {
      mergeObject['error'] = error;
    }
    logger.error(mergeObject, message);

    try {
      const sentryParams = this.buildSentryParams(meta);
      if (error instanceof Error) {
        sentryParams['error'] = error.message;
      }
      Sentry.logger.error(message, sentryParams);
    } catch {
      // Sentry failures must never break logging callers
    }
    this.addSentryBreadcrumb('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    logger.debug(this.buildMergeObject(meta), message);
    try {
      Sentry.logger.debug(message, this.buildSentryParams(meta));
    } catch {
      // Sentry failures must never break logging callers
    }
    this.addSentryBreadcrumb('debug', message, meta);
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const loggingService = new LoggingService();
export default loggingService;
