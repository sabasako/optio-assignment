import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ProcessingService } from './processing.service';
import { CreateJobDto, UpdateJobConfigDto } from './dto';

@Controller('api/processing')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  @Post('start')
  async startProcessing(@Body() createJobDto: CreateJobDto) {
    return this.processingService.createJob(createJobDto);
  }

  @Patch(':jobId/config')
  async updateJobConfig(
    @Param('jobId') jobId: string,
    @Body() updateJobConfigDto: UpdateJobConfigDto,
  ) {
    return this.processingService.updateJobConfig(jobId, updateJobConfigDto);
  }

  @Get(':jobId/status')
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.processingService.getJobStatus(jobId);
  }
}
