import { propagation, context, trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Cross-process trace propagation. The API request that posts a transaction
 * stores its trace context in the outbox row; the relay carries it into the
 * BullMQ job; the worker resumes it — so a single trace spans the original
 * HTTP request all the way to the webhook delivery, minutes later.
 */
export const tracer = trace.getTracer('ledgerflow');

/** Serialize the active trace context to a carrier (stored in the outbox). */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Run `fn` inside a span that continues the trace from a stored carrier. */
export async function withRemoteSpan<T>(
  name: string,
  carrier: Record<string, string> | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = propagation.extract(context.active(), carrier ?? {});
  const span = tracer.startSpan(name, undefined, parent);
  try {
    return await context.with(trace.setSpan(parent, span), fn);
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    throw err;
  } finally {
    span.end();
  }
}
