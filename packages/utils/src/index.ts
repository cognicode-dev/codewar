import { EventEmitter } from "events";

// Shared system utility helpers
export const UTILS_VERSION = "0.0.0";

export interface JudgeJob {
  submissionId: string;
  jobId: string;
}

export type QueueHandler = (job: JudgeJob) => Promise<void>;

export class SubmissionQueue {
  private static handlers: QueueHandler[] = [];
  private static queue: JudgeJob[] = [];

  public static async enqueue(submissionId: string, jobId: string): Promise<void> {
    const job: JudgeJob = { submissionId, jobId };
    this.queue.push(job);
    this.processNext();
  }

  public static registerWorker(handler: QueueHandler): void {
    this.handlers.push(handler);
    this.processNext();
  }

  private static async processNext() {
    if (this.queue.length === 0 || this.handlers.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    for (const handler of this.handlers) {
      setTimeout(async () => {
        try {
          await handler(job);
        } catch (error) {
          console.error("[SubmissionQueue] Error handling judge job:", error);
        }
      }, 0);
    }
  }
}

export class EventBroker {
  private static emitter = new EventEmitter();

  public static publish(channel: string, payload: any): void {
    this.emitter.emit(channel, payload);
  }

  public static subscribe(channel: string, handler: (payload: any) => void): void {
    this.emitter.on(channel, handler);
  }

  public static unsubscribe(channel: string, handler: (payload: any) => void): void {
    this.emitter.off(channel, handler);
  }
}
