import { Controller, Logger } from '@nestjs/common';
// Import Ctx and RmqContext
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { SchedulerServiceService } from './scheduler-service.service';
import { JobCreatedDto, JobUpdatedDto } from './dto';

@Controller()
export class SchedulerServiceController {
  private readonly logger = new Logger(SchedulerServiceController.name);

  constructor(
    private readonly schedulerServiceService: SchedulerServiceService,
  ) {}

  @EventPattern('job.create')
  async handleJobCreate(
    @Payload() data: JobCreatedDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    this.logger.log(`Received job.create event for job ${data.jobId}`);

    try {
      await this.schedulerServiceService.handleJobCreated(data);
      channel.ack(originalMsg);
      this.logger.log(`ACK sent for job.create: ${data.jobId}`);
    } catch (error) {
      this.logger.error(
        `Error processing job.create for ${data.jobId}: ${error.message}`,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  @EventPattern('job.update')
  async handleJobUpdate(
    @Payload() data: JobUpdatedDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    this.logger.log(`Received job.update event for job ${data.jobId}`);

    try {
      await this.schedulerServiceService.handleJobUpdated(data);
      channel.ack(originalMsg);
      this.logger.log(`ACK sent for job.update: ${data.jobId}`);
    } catch (error) {
      this.logger.error(
        `Error processing job.update for ${data.jobId}: ${error.message}`,
      );
      channel.nack(originalMsg, false, false);
    }
  }
}
