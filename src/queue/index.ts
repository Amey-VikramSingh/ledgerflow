import { Queue, type ConnectionOptions } from 'bullmq';
import { config } from '../config';

/**
 * BullMQ manages its own Redis connections from these options (it bundles its
 * own ioredis, so we pass options rather than a shared instance). Workers/queues
 * each open a connection; maxRetriesPerRequest must be null for BullMQ.
 */
const redisUrl = new URL(config.REDIS_URL);
export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || '6379'),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
  ...(redisUrl.username ? { username: redisUrl.username } : {}),
  maxRetriesPerRequest: null,
};

export const WEBHOOK_QUEUE = 'webhook-delivery';

export const webhookQueue = new Queue(WEBHOOK_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: config.WEBHOOK_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000, // keep failed jobs as a DLQ for inspection
  },
});
