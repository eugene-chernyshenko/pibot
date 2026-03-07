import { createLogger } from '../utils/logger.js';

const logger = createLogger('AgentQueue');

interface QueueItem<T> {
  id: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class AgentQueue {
  private queue: QueueItem<unknown>[] = [];
  private isProcessing = false;
  private currentTaskId: string | null = null;

  async enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      logger.debug({ id, queueLength: this.queue.length }, 'Task enqueued');
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.currentTaskId = item.id;
      logger.debug({ id: item.id }, 'Processing task');

      try {
        const result = await item.task();
        item.resolve(result);
        logger.debug({ id: item.id }, 'Task completed');
      } catch (error) {
        logger.error({ id: item.id, error }, 'Task failed');
        item.reject(error as Error);
      }

      this.currentTaskId = null;
    }

    this.isProcessing = false;
  }

  get length(): number {
    return this.queue.length;
  }

  get isRunning(): boolean {
    return this.isProcessing;
  }

  get currentTask(): string | null {
    return this.currentTaskId;
  }

  clear(): void {
    const cleared = this.queue.length;
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    logger.info({ cleared }, 'Queue cleared');
  }
}
