import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerServiceController } from './scheduler-service.controller';
import { SchedulerServiceService } from './scheduler-service.service';
import { RecordPublisherService } from './record-publisher.service';
import { RedisModule } from '@app/common';
import { RABBITMQ_URL } from 'libs/constants';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule,
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [RABBITMQ_URL],
          queue: 'record_processing_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [SchedulerServiceController],
  providers: [SchedulerServiceService, RecordPublisherService],
})
export class SchedulerServiceModule {}
