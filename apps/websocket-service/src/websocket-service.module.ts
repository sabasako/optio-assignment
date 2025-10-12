import { Module } from '@nestjs/common';
import { WebsocketServiceController } from './websocket-service.controller';
import { WebsocketServiceService } from './websocket-service.service';
import { EventsGateway } from './events/events.gateway';
import { RabbitMqConsumerController } from './rabbitmq/rabbitmq-consumer.controller';
import { HealthController } from './health/health.controller';
import { RedisModule } from '@app/common';

@Module({
  imports: [RedisModule],
  controllers: [
    WebsocketServiceController,
    RabbitMqConsumerController,
    HealthController,
  ],
  providers: [WebsocketServiceService, EventsGateway],
})
export class WebsocketServiceModule {}
