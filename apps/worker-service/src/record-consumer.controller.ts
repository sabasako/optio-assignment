import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RecordProcessorService } from './record-processor.service';
import { RecordProcessDto } from './dto';

@Controller()
export class RecordConsumerController {
  private readonly logger = new Logger(RecordConsumerController.name);

  constructor(private readonly recordProcessor: RecordProcessorService) {}

  @EventPattern('record.process')
  async handleRecordProcess(
    @Payload() data: RecordProcessDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    this.logger.debug(
      `Received record ${data.jobId}:${data.recordId} from RabbitMQ`,
    );

    try {
      // Process the record (this includes Redis and Elasticsearch operations)
      await this.recordProcessor.processRecord(data);

      // Ack message if it was successfull
      channel.ack(originalMsg);
      this.logger.debug(`ACK sent for record ${data.jobId}:${data.recordId}`);
    } catch (error) {
      this.logger.error(
        `Error processing record ${data.jobId}:${data.recordId}: ${error.message}`,
      );

      const xDeath = originalMsg.properties.headers?.['x-death'];
      const retryCount = xDeath?.[0]?.count || 0;

      const MAX_RETRIES = 10;

      if (retryCount >= MAX_RETRIES) {
        this.logger.error(
          `Record ${data.jobId}:${data.recordId} failed after ${retryCount} retries, sending to DLQ`,
        );

        // publishes to DLQ (we can't use nack because it would send to retry queue again)
        channel.sendToQueue('record_processing_dlq', originalMsg.content, {
          persistent: true,
          headers: {
            ...originalMsg.properties.headers,
            'x-original-exchange': originalMsg.fields.exchange,
            'x-original-routing-key': originalMsg.fields.routingKey,
            'x-failed-reason': error.message,
            'x-failed-at': new Date().toISOString(),
          },
        });

        // ack the original message so it's removed from the main queue
        channel.ack(originalMsg);
      } else {
        // Send to retry queue (DLE with TTL)
        this.logger.warn(
          `Record ${data.jobId}:${data.recordId} failed (retry ${retryCount + 1}/${MAX_RETRIES}), sending to retry queue`,
        );
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
