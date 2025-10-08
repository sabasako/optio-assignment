import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiGatewayService {
  private processingValues = {
    dataLimit: 50, // maximum number of items to process
    timeLimit: 10, // in seconds
  };

  getHello(): string {
    return this.processingValues.dataLimit.toString();
  }
}
