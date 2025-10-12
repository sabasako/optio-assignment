import { NestFactory } from '@nestjs/core';
import { WebsocketServiceModule } from './websocket-service.module';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { RABBITMQ_URL } from 'libs/constants';

async function bootstrap() {
  const logger = new Logger('WebSocketService');
  const port = process.env.PORT || 3003;

  const app = await NestFactory.create(WebsocketServiceModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'websocket_updates_queue',
      noAck: false,
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.startAllMicroservices();
  logger.log(
    `RabbitMQ consumer connected to websocket_updates_queue at ${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}`,
  );

  await app.listen(port);
  logger.log(`WebSocket Service is running on: http://localhost:${port}`);
  logger.log(`WebSocket endpoint available at: ws://localhost:${port}/updates`);
}

bootstrap();
