import { Injectable } from '@nestjs/common';

@Injectable()
export class SchedulerServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
