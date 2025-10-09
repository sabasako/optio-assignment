import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SchedulerServiceService } from './scheduler-service.service';
import { JobCreatedDto, JobUpdatedDto } from './dto';

@Controller()
export class SchedulerServiceController {
  private readonly logger = new Logger(SchedulerServiceController.name);

  constructor(
    private readonly schedulerServiceService: SchedulerServiceService,
  ) {}

  @EventPattern('job.create')
  async handleJobCreate(@Payload() data: JobCreatedDto) {
    this.logger.log(`Received job.create event for job ${data.jobId}`);
    await this.schedulerServiceService.handleJobCreated(data);
  }

  @EventPattern('job.update')
  async handleJobUpdate(@Payload() data: JobUpdatedDto) {
    this.logger.log(`Received job.update event for job ${data.jobId}`);
    await this.schedulerServiceService.handleJobUpdated(data);
  }
}
