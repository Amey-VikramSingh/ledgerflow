/**
 * OpenTelemetry init. MUST be imported before anything else in the process
 * entrypoints so instrumentations can patch libraries on load. Opt-in via
 * OTEL_ENABLED=true so local dev without a collector stays quiet.
 */
import { config } from '../config';

if (config.OTEL_ENABLED) {
  // Lazy-require so the (heavy) SDK is only loaded when enabled.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { Resource } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
  const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME }),
    traceExporter: new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();

  // eslint-disable-next-line no-console
  console.log(`[otel] tracing enabled → ${config.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
