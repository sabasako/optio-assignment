import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Interval } from '@nestjs/schedule';
import { RedisService } from '@app/common';

@Injectable()
export class RecordPublisherService implements OnModuleInit {
  private readonly logger = new Logger(RecordPublisherService.name);
  private isRunning = false;

  constructor(
    @Inject('RABBITMQ_SERVICE') private readonly rabbitClient: ClientProxy,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.rabbitClient.connect();
    this.logger.log('RecordPublisher initialized and connected to RabbitMQ');
  }

  // Check every 100ms
  @Interval(100)
  async checkAndPublishRecords() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Get all records scheduled to be sent now
      const dueRecords = await this.redisService.getScheduledToNow();

      if (dueRecords.length > 0) {
        this.logger.log(`Publishing ${dueRecords.length} due records`);
      }

      for (const { jobId, recordId } of dueRecords) {
        await this.publishRecord(jobId, recordId);
      }
    } catch (error) {
      this.logger.error(`Error in checkAndPublishRecords: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async publishRecord(jobId: string, recordId: number): Promise<void> {
    try {
      // Get record from Redis
      const record = await this.redisService.getRecord(jobId, recordId);
      if (!record) {
        this.logger.warn(`Record ${jobId}:${recordId} not found`);
        return;
      }

      // Skip if already sent
      if (record.status !== 'pending') {
        await this.redisService.removeFromScheduledQueue(jobId, recordId);
        return;
      }

      // Publish to RabbitMQ
      const message = {
        jobId: record.jobId,
        recordId: record.recordId,
        data: record.data,
        scheduledAt: new Date(record.scheduledAt),
        sentAt: new Date(),
      };

      this.rabbitClient.emit('record.process', message);

      // Update record status to 'sent'
      await this.redisService.updateRecordStatus(jobId, recordId, 'sent');

      // Remove from scheduled queue
      await this.redisService.removeFromScheduledQueue(jobId, recordId);

      // Log successful publish
      // Note: We do NOT increment processedCount here because that should only happen
      // when the worker actually processes the record. This prevents double-counting.
      this.logger.log(
        `Published record ${recordId} for job ${jobId} to RabbitMQ`,
      );
    } catch (error) {
      this.logger.error(
        `Error publishing record ${jobId}:${recordId} - ${error.message}`,
      );
    }
  }
}
