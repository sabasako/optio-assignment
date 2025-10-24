import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { WorkerServiceModule } from './worker-service.module';
import { Logger } from '@nestjs/common';
import { RABBITMQ_URL } from 'libs/constants';

async function bootstrap() {
  const logger = new Logger('WorkerService');

  const app = await NestFactory.create(WorkerServiceModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'record_processing_queue',
      noAck: false,
      prefetchCount: 10, // Process up to 10 messages concurrently per worker
      queueOptions: {
        durable: true,
        deadLetterExchange: 'record_processing_retry_exchange',
        deadLetterRoutingKey: 'record_processing_retry',
      },
    },
  });

  await app.startAllMicroservices();
  logger.log(
    'Worker microservice started, listening to record_processing_queue',
  );

  const port = process.env.PORT || 3002;
  await app.listen(port);
  logger.log(`Worker HTTP service running on: http://localhost:${port}`);
}

bootstrap();
