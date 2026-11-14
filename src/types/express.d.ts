/**
 * Adds the authenticated principal to Express's Request type.
 * Populated by requireAuth (users) or authenticate (users OR api keys).
 * pino-http already augments Request with `id` and `log`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        role: string; // 'owner' | 'admin' | 'member' | 'viewer' | 'api_key'
        kind: 'user' | 'api_key';
        permissions: string[];
      };
    }
  }
}

export {};
