import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerServiceController } from './scheduler-service.controller';
import { SchedulerServiceService } from './scheduler-service.service';
import { RecordPublisherService } from './record-publisher.service';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule,
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ||
              `amqp://${process.env.RABBITMQ_USER || 'admin'}:${process.env.RABBITMQ_PASS || 'admin'}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}`,
          ],
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
