import { Module } from '@nestjs/common';
import { WorkerServiceController } from './worker-service.controller';
import { WorkerServiceService } from './worker-service.service';
import { RecordConsumerController } from './record-consumer.controller';
import { RecordProcessorService } from './record-processor.service';
import { RabbitMQSetupService } from './rabbitmq-setup.service';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { RedisModule } from '@app/common';
import { WebSocketClientModule } from './websocket/websocket-client.module';

@Module({
  imports: [ElasticsearchModule, RedisModule, WebSocketClientModule],
  controllers: [WorkerServiceController, RecordConsumerController],
  providers: [WorkerServiceService, RecordProcessorService, RabbitMQSetupService],
})
export class WorkerServiceModule {}
