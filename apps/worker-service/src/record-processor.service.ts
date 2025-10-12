import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ElasticsearchService,
  ProcessedRecord,
} from './elasticsearch/elasticsearch.service';
import { RedisService } from '@app/common';
import {
  WebSocketClientService,
  ProgressUpdate,
} from './websocket/websocket-client.service';
import { RecordProcessDto } from './dto';

@Injectable()
export class RecordProcessorService {
  private readonly logger = new Logger(RecordProcessorService.name);
  private readonly workerId: string;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly redisService: RedisService,
    private readonly websocketClient: WebSocketClientService,
  ) {
    // Generate unique worker ID (includes hostname for container identification)
    const hostname = process.env.HOSTNAME || 'unknown_hostname';
    this.workerId = `worker-${hostname}-${randomUUID().slice(0, 8)}`;
    this.logger.log(`Worker initialized with ID: ${this.workerId}`);
  }

  async processRecord(message: RecordProcessDto): Promise<void> {
    const startTime = Date.now();
    const { jobId, recordId } = message;

    this.logger.log(`Processing record ${jobId}:${recordId}`);

    try {
      // Update Redis: mark record as processing
      await this.redisService.updateRecordStatus(jobId, recordId, 'processing');

      // Simulate processing (validate, transform, enrich data)
      const processedData = await this.processData(message);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Create Elasticsearch document
      const record: ProcessedRecord = {
        jobId,
        recordId,
        data: processedData,
        processedAt: new Date(),
        processingTime,
        workerId: this.workerId,
        status: 'completed',
      };

      // Write to Elasticsearch
      const indexed = await this.elasticsearchService.indexRecord(record);

      if (!indexed) {
        throw new Error('Failed to index record in Elasticsearch');
      }

      // Update Redis: mark as completed and increment counter (idempotently)
      await this.redisService.updateRecordStatus(jobId, recordId, 'completed');
      const jobConfig = await this.redisService.incrementProcessedCount(
        jobId,
        recordId,
      );

      if (jobConfig) {
        const progressPercentage = Math.round(
          (jobConfig.processedCount / jobConfig.totalRecords) * 100,
        );

        // Send progress update to WebSocket (fire-and-forget)
        const progressUpdate: ProgressUpdate = {
          jobId,
          recordId,
          processedCount: jobConfig.processedCount,
          totalRecords: jobConfig.totalRecords,
          progressPercentage,
          status: 'completed',
          workerId: this.workerId,
        };

        this.websocketClient.sendProgressUpdate(progressUpdate);

        // Check if job is complete
        if (jobConfig.processedCount >= jobConfig.totalRecords) {
          await this.redisService.updateJobStatus(jobId, 'completed');
          this.logger.log(`Job ${jobId} completed - all records processed`);

          // Send job completion notification to WebSocket
          this.websocketClient.sendJobCompleted(jobId, jobConfig.totalRecords);
        }

        this.logger.log(
          `Record ${jobId}:${recordId} processed successfully in ${processingTime}ms (count: ${jobConfig.processedCount})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process record ${jobId}:${recordId}: ${error.message}`,
        error.stack,
      );

      // Write failed record to Elasticsearch
      const failedRecord: ProcessedRecord = {
        jobId,
        recordId,
        data: message.data,
        processedAt: new Date(),
        processingTime: Date.now() - startTime,
        workerId: this.workerId,
        status: 'failed',
        error: error.message,
      };

      await this.elasticsearchService.indexRecord(failedRecord);
      await this.redisService.updateRecordStatus(jobId, recordId, 'failed');

      // Re-throw to trigger NACK and retry
      throw error;
    }
  }

  private async processData(message: RecordProcessDto): Promise<any> {
    // Simulate some processing time (1-10ms)
    const delay = Math.floor(Math.random() * 10) + 1;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Add processing metadata
    return {
      ...message.data,
      processed: true,
      processedBy: this.workerId,
      originalScheduledAt: message.scheduledAt,
      originalSentAt: message.sentAt,
      receivedAt: new Date(),
    };
  }

  getWorkerId(): string {
    return this.workerId;
  }
}
