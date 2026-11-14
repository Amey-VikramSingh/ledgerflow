/**
 * Emails are unique across ALL tenants, not just within one.
 *
 * Login identifies a user by email alone (POST /auth/login has no tenant
 * field), so two users sharing an email in different tenants would make
 * login pick one arbitrarily. Registration already refuses an email that
 * exists anywhere, but only with a check-then-insert in application code:
 * two concurrent sign-ups can both pass the check. This index makes the
 * database the arbiter. `email` is CITEXT, so uniqueness is case-insensitive.
 *
 * The existing UNIQUE (tenant_id, email) constraint stays; it becomes
 * redundant but is harmless.
 */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      dupes INT;
    BEGIN
      SELECT count(*) INTO dupes
        FROM (SELECT email FROM users GROUP BY email HAVING count(*) > 1) d;
      IF dupes > 0 THEN
        RAISE EXCEPTION
          'cannot make users.email globally unique: % email(s) are used by more than one user. Find them with: SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;',
          dupes
          USING ERRCODE = 'unique_violation';
      END IF;
    END
    $$;

    CREATE UNIQUE INDEX users_email_unique ON users (email);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS users_email_unique;`);
};
