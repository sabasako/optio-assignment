import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { EventsGateway } from '../events/events.gateway';

interface WebSocketUpdateDto {
  type: 'record.completed' | 'job.started' | 'job.completed' | 'job.updated';
  jobId: string;
  recordId?: number;
  processedAt?: Date;
  workerId?: string;
  data?: any;
}

@Controller()
export class RabbitMqConsumerController {
  private readonly logger = new Logger(RabbitMqConsumerController.name);

  constructor(private readonly eventsGateway: EventsGateway) {}

  @EventPattern('websocket.update')
  async handleWebSocketUpdate(
    @Payload() data: WebSocketUpdateDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.debug(
        `Received WebSocket update: ${data.type} for job ${data.jobId}`,
      );

      // Broadcast to websocket clients
      // This is fire-and-forget - we don't retry if broadcasting fails
      await this.eventsGateway.broadcastUpdate(data);

      // Always ack the message immediately We don't want to requeue messages if WebSocket broadcast fails
      channel.ack(originalMsg);

      this.logger.debug(
        `Successfully broadcast ${data.type} for job ${data.jobId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing WebSocket update: ${error.message}`,
        error.stack,
      );

      // Still ack. we don't want to retry websocket broadcasts
      // The message is lost, but that's acceptable for real-time updates
      channel.ack(originalMsg);
    }
  }
}
