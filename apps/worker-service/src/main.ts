import { NestFactory } from '@nestjs/core';
import { WorkerServiceModule } from './worker-service.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerServiceModule);
  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Worker Service is running on: http://localhost:${port}`);
}
bootstrap();
