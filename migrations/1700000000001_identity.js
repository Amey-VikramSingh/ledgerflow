/* eslint-disable camelcase */

/**
 * Identity & auth tables.
 * Order matters: tenants → users → api_keys/refresh_tokens (FK dependencies).
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE tenants (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active',   -- active | suspended
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email          CITEXT NOT NULL,                 -- case-insensitive
      password_hash  TEXT NOT NULL,                   -- argon2id
      role           TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member | viewer
      email_verified BOOLEAN NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, email)                       -- email unique WITHIN a tenant
    );

    CREATE TABLE api_keys (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      prefix       TEXT NOT NULL,          -- shown to user: lk_live_ab12…
      key_hash     TEXT NOT NULL,          -- sha256(full key); raw key never stored
      scopes       TEXT[] NOT NULL DEFAULT '{}',
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (prefix)
    );

    CREATE TABLE refresh_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id  UUID NOT NULL,            -- all descendants of one login
      token_hash TEXT NOT NULL,            -- sha256(token)
      rotated    BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_rt_family ON refresh_tokens(family_id);
    CREATE UNIQUE INDEX idx_rt_hash ON refresh_tokens(token_hash);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS api_keys;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS tenants;
  `);
};
