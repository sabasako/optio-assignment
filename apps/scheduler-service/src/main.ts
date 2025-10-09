import { randomUUID } from 'crypto';

if (typeof global.crypto === 'undefined') {
  (global as any).crypto = { randomUUID };
}

import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { SchedulerServiceModule } from './scheduler-service.module';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerServiceModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [
        process.env.RABBITMQ_URL ||
          `amqp://${process.env.RABBITMQ_USER || 'admin'}:${process.env.RABBITMQ_PASS || 'admin'}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}`,
      ],
      queue: 'job_queue',
      queueOptions: {
        durable: true,
      },
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`Scheduler Service is running on: http://localhost:${port}`);
  console.log('Listening for job events from RabbitMQ...');
}
bootstrap();
