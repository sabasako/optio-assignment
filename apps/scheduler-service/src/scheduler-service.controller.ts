import { Controller, Get } from '@nestjs/common';
import { SchedulerServiceService } from './scheduler-service.service';

@Controller()
export class SchedulerServiceController {
  constructor(private readonly schedulerServiceService: SchedulerServiceService) {}

  @Get()
  getHello(): string {
    return this.schedulerServiceService.getHello();
  }
}
