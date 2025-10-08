import { Module } from '@nestjs/common';
import { SchedulerServiceController } from './scheduler-service.controller';
import { SchedulerServiceService } from './scheduler-service.service';

@Module({
  imports: [],
  controllers: [SchedulerServiceController],
  providers: [SchedulerServiceService],
})
export class SchedulerServiceModule {}
