import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { RABBITMQ_URL } from 'libs/constants';

@Injectable()
export class RabbitMQSetupService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQSetupService.name);

  async onModuleInit() {
    await this.setupRetryInfrastructure();
  }

  private async setupRetryInfrastructure() {
    const connection = amqp.connect([RABBITMQ_URL]);
    const channelWrapper = connection.createChannel({
      json: false,
      setup: async (channel: any) => {
        try {
          await channel.assertExchange(
            'record_processing_retry_exchange',
            'direct',
            {
              durable: true,
            },
          );

          // Messages in this queue expire after 30 seconds and return to main queue
          await channel.assertQueue('record_processing_retry_queue', {
            durable: true,
            messageTtl: 30000,
            deadLetterExchange: '',
            deadLetterRoutingKey: 'record_processing_queue',
          });

          await channel.bindQueue(
            'record_processing_retry_queue',
            'record_processing_retry_exchange',
            'record_processing_retry',
          );

          await channel.assertQueue('record_processing_dlq', {
            durable: true,
            // No TTL, no DLX - messages stay here permanently for manual review
          });

          this.logger.log('RabbitMQ retry infrastructure setup completed');
        } catch (error) {
          this.logger.error('Failed to setup retry infrastructure:', error);
          throw error;
        }
      },
    });

    await channelWrapper.waitForConnect();
    await channelWrapper.close();
    await connection.close();
  }
}
