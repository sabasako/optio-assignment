import { NestFactory } from '@nestjs/core';
import { WebsocketServiceModule } from './websocket-service.module';

async function bootstrap() {
  const app = await NestFactory.create(WebsocketServiceModule);
  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`WebSocket Service is running on: http://localhost:${port}`);
}
bootstrap();
