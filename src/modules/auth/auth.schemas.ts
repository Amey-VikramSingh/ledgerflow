import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  // Upper bound stops multi-megabyte "passwords" being fed to argon2.
  password: z
    .string()
    .min(8, 'password must be at least 8 characters')
    .max(128, 'password must be at most 128 characters'),
  orgName: z.string().min(1, 'orgName is required'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1, 'at least one scope is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
