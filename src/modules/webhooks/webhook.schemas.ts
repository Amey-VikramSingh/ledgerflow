import { z } from 'zod';
import { validateWebhookUrl } from '../../shared/net-guard';
import { allowPrivateWebhookUrls } from '../../shared/webhook';

export const createEndpointSchema = z.object({
  url: z
    .string()
    .max(2048)
    .superRefine((value, ctx) => {
      const problem = validateWebhookUrl(value, { allowPrivate: allowPrivateWebhookUrls() });
      if (problem) ctx.addIssue({ code: 'custom', message: `url ${problem}` });
    }),
  secret: z.string().min(16).max(256).optional(), // generated if omitted
});
export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;
