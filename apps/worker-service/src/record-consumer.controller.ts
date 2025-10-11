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

      // This logic tries to requeue once, if it still fails, then discards message
      const redelivered = originalMsg.fields.redelivered;

      if (redelivered) {
        this.logger.warn(
          `Record ${data.jobId}:${data.recordId} failed after retry, sending to DLQ`,
        );
        channel.nack(originalMsg, false, false);
      } else {
        this.logger.warn(
          `Record ${data.jobId}:${data.recordId} failed, requeueing for retry`,
        );
        channel.nack(originalMsg, false, true);
      }
    }
  }
}
