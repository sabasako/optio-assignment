import { Injectable, Logger } from '@nestjs/common';

export interface ProgressUpdate {
  jobId: string;
  recordId: number;
  processedCount: number;
  totalRecords: number;
  progressPercentage: number;
  status: 'processing' | 'completed' | 'failed';
  workerId: string;
}

@Injectable()
export class WebSocketClientService {
  private readonly logger = new Logger(WebSocketClientService.name);
  private readonly websocketUrl: string;

  constructor() {
    this.websocketUrl = process.env.WEBSOCKET_URL || 'http://localhost:3003';
  }

  async sendProgressUpdate(update: ProgressUpdate): Promise<void> {
    try {
      // Fire-and-forget: don't wait for response
      // This prevents WebSocket issues from blocking record processing
      fetch(`${this.websocketUrl}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }).catch((error) => {
        ``;
        // Log but don't throw - WebSocket is not critical
        this.logger.warn(
          `Failed to send progress update to WebSocket: ${error.message}`,
        );
      });

      this.logger.debug(
        `Sent progress update for job ${update.jobId}: ${update.processedCount}/${update.totalRecords}`,
      );
    } catch (error) {
      // Don't throw - WebSocket failures shouldn't stop processing
      this.logger.warn(`Error sending progress update: ${error.message}`);
    }
  }

  async sendBatchUpdate(updates: ProgressUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    try {
      fetch(`${this.websocketUrl}/progress/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      }).catch((error) => {
        this.logger.warn(
          `Failed to send batch update to WebSocket: ${error.message}`,
        );
      });

      this.logger.debug(`Sent batch update with ${updates.length} records`);
    } catch (error) {
      this.logger.warn(`Error sending batch update: ${error.message}`);
    }
  }
}
