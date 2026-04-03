import * as Sentry from '@sentry/node';

/******************************************************************************
                        HTTP Metrics
******************************************************************************/

/**
 * Emits HTTP request metrics after a response is sent.
 *
 * Emits:
 * - `http.request.count`    — total request counter, tagged by method/route/status_class
 * - `http.request.duration` — distribution of response times in milliseconds
 * - `http.error.count`      — counter emitted only for 4xx and 5xx responses
 */
export function emitHttpMetrics(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
): void {
  try {
    const statusClass = statusCode < 300 ? '2xx' : statusCode < 500 ? '4xx' : '5xx';

    Sentry.metrics.count('http.request.count', 1, {
      attributes: { method, route, status_class: statusClass },
    });

    Sentry.metrics.distribution('http.request.duration', durationMs, {
      unit: 'millisecond',
      attributes: { method, route },
    });

    if (statusCode >= 400) {
      Sentry.metrics.count('http.error.count', 1, {
        attributes: { method, route, status_code: String(statusCode), status_class: statusClass },
      });
    }
  } catch {
    // Sentry failures must never break callers
  }
}

/******************************************************************************
                        Database Metrics
******************************************************************************/

/**
 * Emits a database query duration metric.
 *
 * Emits:
 * - `db.query.duration` — distribution of query times in milliseconds, tagged by table/operation
 */
export function emitDbMetrics(
  table: string,
  operation: string,
  durationMs: number,
): void {
  try {
    Sentry.metrics.distribution('db.query.duration', durationMs, {
      unit: 'millisecond',
      attributes: { table, operation },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/******************************************************************************
                        Business Metrics
******************************************************************************/

/**
 * Increments the registration counter for the given tenant.
 */
export function emitRegistration(tenantId: string): void {
  try {
    Sentry.metrics.count('business.registration', 1, {
      attributes: { tenant_id: tenantId },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/**
 * Increments the login counter for the given tenant with success/failure outcome.
 */
export function emitLogin(tenantId: string, success: boolean): void {
  try {
    Sentry.metrics.count('business.login', 1, {
      attributes: { tenant_id: tenantId, outcome: success ? 'success' : 'failure' },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/**
 * Increments the prospect stage transition counter.
 */
export function emitProspectStageTransition(
  tenantId: string,
  fromStage: string,
  toStage: string,
): void {
  try {
    Sentry.metrics.count('business.prospect.stage_transition', 1, {
      attributes: { tenant_id: tenantId, from_stage: fromStage, to_stage: toStage },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/**
 * Increments the coaching session join counter for the given tenant.
 */
export function emitSessionJoin(tenantId: string): void {
  try {
    Sentry.metrics.count('business.session.join', 1, {
      attributes: { tenant_id: tenantId },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/**
 * Records an active-user gauge event for the given tenant.
 * Use a gauge here since we want to track the count of distinct active users
 * over the metrics flush window.
 */
export function emitActiveUser(tenantId: string): void {
  try {
    Sentry.metrics.gauge('business.active_users', 1, {
      attributes: { tenant_id: tenantId },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/******************************************************************************
                        Error Metrics
******************************************************************************/

/**
 * Increments the error counter, tagged by error class name and controller context.
 */
export function emitErrorCount(errorType: string, context: string): void {
  try {
    Sentry.metrics.count('error.count', 1, {
      attributes: { error_type: errorType, context },
    });
  } catch {
    // Sentry failures must never break callers
  }
}

/******************************************************************************
                        Service Span Helper
******************************************************************************/

/**
 * Wraps a service method in a Sentry span, mirroring the `withSpan` pattern
 * used in SupabaseService for consistent distributed tracing across layers.
 *
 * The span op is `service.{serviceName}` and the name is `{serviceName}.{methodName}`.
 * Undefined attribute values are stripped before the span is created.
 */
export function withServiceSpan<R>(
  serviceName: string,
  methodName: string,
  attributes: Record<string, string | number | undefined>,
  fn: () => Promise<R>,
): Promise<R> {
  try {
    return Sentry.startSpan(
      {
        op: `service.${serviceName}`,
        name: `${serviceName}.${methodName}`,
        attributes: Object.fromEntries(
          Object.entries(attributes).filter(([, v]) => v !== undefined),
        ),
      },
      fn,
    );
  } catch {
    // Fall back to calling fn directly if span creation fails
    return fn();
  }
}
