import { NestFactory } from '@nestjs/core';
import { SchedulerServiceModule } from './scheduler-service.module';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerServiceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
