import { Controller, Get, Logger } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly eventsGateway: EventsGateway) {}

  @Get()
  getHealth() {
    const stats = this.eventsGateway.getConnectionStats();

    return {
      status: 'ok',
      service: 'websocket-service',
      connectedClients: stats.connectedClients,
      totalSubscriptions: stats.totalSubscriptions,
      timestamp: new Date(),
    };
  }
}
