import { z } from 'zod';

export const createEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).optional(), // generated if omitted
});
export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;
