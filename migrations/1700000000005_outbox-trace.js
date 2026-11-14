/* eslint-disable camelcase */

/**
 * Store the originating request's trace context on each outbox event so the
 * webhook delivery (in the worker process) can continue the same distributed
 * trace end-to-end.
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE outbox_events ADD COLUMN trace_context JSONB;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE outbox_events DROP COLUMN trace_context;`);
};
