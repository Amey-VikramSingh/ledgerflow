/* eslint-disable camelcase */

/**
 * Day 1 migration: enable extensions the schema will need on Day 2.
 *  - pgcrypto → gen_random_uuid() for UUID primary keys
 *  - citext   → case-insensitive email column
 * Written in node-pg-migrate's JS API (runs without ts-node).
 */

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('citext', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropExtension('citext', { ifExists: true });
  pgm.dropExtension('pgcrypto', { ifExists: true });
};
