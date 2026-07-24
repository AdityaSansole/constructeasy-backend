/**
 * Named BullMQ queues — Phase 3 Plan Section 11.
 * Separate queues (not one generic queue) so each can have independent
 * concurrency/retry configuration and independent monitoring.
 *
 * Infrastructure (this module) is established in Batch 0; queues are wired
 * to actual producers/consumers in the batches that need them:
 *   - NOTIFICATION_DISPATCH: Batch 10 (Notifications)
 *   - MEDIA_PROCESSING: Batch 5 (Portfolio)
 *   - DOCUMENT_SCANNING: Batch 4 (Verification & Trust)
 */
export enum QueueName {
  NotificationDispatch = 'notification-dispatch',
  MediaProcessing = 'media-processing',
  DocumentScanning = 'document-scanning',
}

/** Default retry policy; queue-specific overrides applied at registration
 * time in the batch that owns the queue (Phase 3 Plan Section 11). */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 24 * 3600 }, // keep 24h for debugging
  removeOnFail: false, // failed jobs retained for dead-letter inspection
};

export const QUEUE_TOKEN_PREFIX = 'BULLMQ_QUEUE_';
export const queueToken = (name: QueueName) => `${QUEUE_TOKEN_PREFIX}${name}`;
