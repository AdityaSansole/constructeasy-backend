import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, QueueName, queueToken } from './queue.constants';

/**
 * QueueService — the ONLY interface feature modules use to enqueue work.
 * Producing modules (e.g., Reviews enqueuing a `new_review` notification
 * job in Batch 8) depend on this interface, never on consumer/processor
 * implementation — preserving module boundaries (Phase 3 Plan Section 11).
 *
 * Coding standard (Section 17): no synchronous business logic ever waits
 * on a queued job's completion — `enqueue` is fire-and-forget from the
 * caller's perspective.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @Inject(queueToken(QueueName.NotificationDispatch))
    notificationDispatch: Queue,
    @Inject(queueToken(QueueName.MediaProcessing))
    mediaProcessing: Queue,
    @Inject(queueToken(QueueName.DocumentScanning))
    documentScanning: Queue,
  ) {
    this.queues = {
      [QueueName.NotificationDispatch]: notificationDispatch,
      [QueueName.MediaProcessing]: mediaProcessing,
      [QueueName.DocumentScanning]: documentScanning,
    };
  }

  async enqueue<T extends Record<string, unknown>>(
    queueName: QueueName,
    jobName: string,
    payload: T,
  ): Promise<void> {
    await this.queues[queueName].add(jobName, payload, DEFAULT_JOB_OPTIONS);
    this.logger.debug(`Enqueued '${jobName}' on '${queueName}'`);
  }
}
