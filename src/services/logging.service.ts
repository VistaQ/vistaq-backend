import { AsyncLocalStorage } from 'async_hooks';
import pino, { Logger } from 'pino';

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

  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(this.buildMergeObject(meta), message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(this.buildMergeObject(meta), message);
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const mergeObject: Record<string, unknown> = this.buildMergeObject(meta);
    if (error instanceof Error) {
      mergeObject['err'] = error;
    } else if (error !== undefined) {
      mergeObject['error'] = error;
    }
    logger.error(mergeObject, message);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    logger.debug(this.buildMergeObject(meta), message);
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const loggingService = new LoggingService();
export default loggingService;
