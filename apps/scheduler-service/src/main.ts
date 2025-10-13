import { randomUUID } from 'crypto';

if (typeof global.crypto === 'undefined') {
  (global as any).crypto = { randomUUID };
}

import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { SchedulerServiceModule } from './scheduler-service.module';
import { RABBITMQ_URL } from 'libs/constants';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerServiceModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'job_queue',
      queueOptions: {
        durable: true,
      },
      noAck: false,
      prefetchCount: 10,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`Scheduler Service is running on: http://localhost:${port}`);
  console.log('Listening for job events from RabbitMQ...');
}
bootstrap();
