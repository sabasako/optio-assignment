import { Module } from '@nestjs/common';
import { WebSocketClientService } from './websocket-client.service';

@Module({
  providers: [WebSocketClientService],
  exports: [WebSocketClientService],
})
export class WebSocketClientModule {}
