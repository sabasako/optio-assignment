import { NestFactory } from '@nestjs/core';
import { SchedulerServiceModule } from './scheduler-service.module';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerServiceModule);
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Scheduler Service is running on: http://localhost:${port}`);
}
bootstrap();
