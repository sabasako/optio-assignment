import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiGatewayService {
  healthCheck() {
    return { status: 'ok' };
  }
}
