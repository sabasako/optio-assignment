import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { RABBITMQ_URL } from 'libs/constants';

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
export class WebSocketClientService implements OnModuleInit {
  private readonly logger = new Logger(WebSocketClientService.name);
  private client: ClientProxy;

  async onModuleInit() {
    const rmqUrl = RABBITMQ_URL;

    // Create RabbitMQ client for sending messages
    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'websocket_updates_queue',
        queueOptions: {
          durable: true,
        },
      },
    });

    await this.client.connect();
    this.logger.log('Connected to RabbitMQ for WebSocket updates');
  }

  async sendProgressUpdate(update: ProgressUpdate): Promise<void> {
    try {
      // Send message to RabbitMQ (fire-and-forget)
      // The websocket-service will consume this and broadcast to clients
      this.client.emit('websocket.update', {
        type: 'record.completed',
        jobId: update.jobId,
        recordId: update.recordId,
        workerId: update.workerId,
        processedAt: new Date(),
        data: {
          processedCount: update.processedCount,
          totalRecords: update.totalRecords,
          progressPercentage: update.progressPercentage,
          status: update.status,
        },
      });

      this.logger.debug(
        `Sent progress update to RabbitMQ for job ${update.jobId}: ${update.processedCount}/${update.totalRecords}`,
      );
    } catch (error) {
      // Don't throw - WebSocket failures shouldn't stop processing
      this.logger.warn(`Error sending progress update: ${error.message}`);
    }
  }

  async sendJobStarted(
    jobId: string,
    totalRecords: number,
    recordsPerMinute: number,
  ): Promise<void> {
    try {
      this.client.emit('websocket.update', {
        type: 'job.started',
        jobId,
        data: {
          totalRecords,
          recordsPerMinute,
        },
      });

      this.logger.debug(`Sent job.started notification for job ${jobId}`);
    } catch (error) {
      this.logger.warn(
        `Error sending job started notification: ${error.message}`,
      );
    }
  }

  async sendJobCompleted(jobId: string, totalRecords: number): Promise<void> {
    try {
      this.client.emit('websocket.update', {
        type: 'job.completed',
        jobId,
        data: {
          totalRecords,
        },
      });

      this.logger.log(`Sent job.completed notification for job ${jobId}`);
    } catch (error) {
      this.logger.warn(
        `Error sending job completed notification: ${error.message}`,
      );
    }
  }

  async sendBatchUpdate(updates: ProgressUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    try {
      // Send each update individually to RabbitMQ
      for (const update of updates) {
        await this.sendProgressUpdate(update);
      }

      this.logger.debug(
        `Sent batch update with ${updates.length} records to RabbitMQ`,
      );
    } catch (error) {
      this.logger.warn(`Error sending batch update: ${error.message}`);
    }
  }
}
