import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '@app/common';

interface SubscribeDto {
  jobId: string;
}

interface UpdateMessage {
  type: 'record.completed' | 'job.started' | 'job.completed' | 'job.updated';
  jobId: string;
  recordId?: number;
  processedAt?: Date;
  workerId?: string;
  data?: any;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  },
  namespace: '/updates',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = new Map<string, Set<string>>(); // clientId -> Set of jobIds

  constructor(private readonly redisService: RedisService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const subscribedJobs = this.connectedClients.get(client.id);

    if (subscribedJobs) {
      // Leave all rooms for this client
      subscribedJobs.forEach((jobId) => {
        client.leave(`job:${jobId}`);
      });
      this.connectedClients.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;

    if (!jobId) {
      client.emit('error', { message: 'jobId is required' });
      return;
    }

    // Join the room for this job
    const roomName = `job:${jobId}`;
    await client.join(roomName);

    // Track subscription
    const clientSubs = this.connectedClients.get(client.id);
    if (clientSubs) {
      clientSubs.add(jobId);
    }

    this.logger.log(`Client ${client.id} subscribed to job ${jobId}`);

    // Send current job status
    const jobStatus = await this.redisService.getJobStatus(jobId);

    client.emit('subscribed', {
      message: `Subscribed to updates for job ${jobId}`,
      jobId,
      currentStatus: jobStatus,
    });
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { jobId } = data;

    if (!jobId) {
      client.emit('error', { message: 'jobId is required' });
      return;
    }

    // Leave the room
    const roomName = `job:${jobId}`;
    await client.leave(roomName);

    // Remove from tracking
    const clientSubs = this.connectedClients.get(client.id);
    if (clientSubs) {
      clientSubs.delete(jobId);
    }

    this.logger.log(`Client ${client.id} unsubscribed from job ${jobId}`);

    client.emit('unsubscribed', {
      message: `Unsubscribed from job ${jobId}`,
      jobId,
    });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date() });
  }

  /**
   * Broadcast update to all clients subscribed to a specific job
   * Called by RabbitMQ consumer when messages arrive
   */
  async broadcastUpdate(message: UpdateMessage) {
    const { jobId, type, recordId, processedAt, workerId, data } = message;
    const roomName = `job:${jobId}`;

    // Get current job status for progress calculation
    const jobStatus = await this.redisService.getJobStatus(jobId);

    let event: string;
    let payload: any;

    switch (type) {
      case 'job.started':
        event = 'job.started';
        payload = {
          jobId,
          totalRecords: jobStatus.totalRecords,
          recordsPerMinute: jobStatus.recordsPerMinute,
          timestamp: new Date(),
        };
        break;

      case 'record.completed':
        event = 'job.progress';
        payload = {
          jobId,
          recordId,
          processedAt,
          workerId,
          progress: {
            processedCount: jobStatus.processedCount,
            totalRecords: jobStatus.totalRecords,
            percentage: jobStatus.progressPercentage,
            remainingRecords: jobStatus.remainingRecords,
            estimatedTimeRemaining: jobStatus.estimatedTimeRemaining,
          },
          timestamp: new Date(),
        };
        break;

      case 'job.completed':
        event = 'job.completed';
        payload = {
          jobId,
          totalRecords: jobStatus.totalRecords,
          processedCount: jobStatus.processedCount,
          timestamp: new Date(),
        };
        break;

      case 'job.updated':
        event = 'job.updated';
        payload = {
          jobId,
          data,
          timestamp: new Date(),
        };
        break;

      default:
        this.logger.warn(`Unknown message type: ${type}`);
        return;
    }

    // Find all clients in the room
    const clientsInRoom = await this.server.in(roomName).fetchSockets();
    this.logger.debug(
      `Broadcasting ${event} to ${clientsInRoom.length} clients in room ${roomName}`,
    );

    // Broadcast to all clients in the room
    this.server.to(roomName).emit(event, payload);
  }

  getConnectionStats() {
    return {
      connectedClients: this.connectedClients.size,
      totalSubscriptions: Array.from(this.connectedClients.values()).reduce(
        (total, subs) => total + subs.size,
        0,
      ),
    };
  }
}
