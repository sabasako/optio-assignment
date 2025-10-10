import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { CreateJobDto, UpdateJobConfigDto } from './dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @Inject('RABBITMQ_SERVICE') private readonly rabbitClient: ClientProxy,
    private readonly redisService: RedisService,
  ) {}

  async createJob(createJobDto: CreateJobDto) {
    const jobId = randomUUID();
    const jobData = {
      jobId,
      totalRecords: createJobDto.totalRecords,
      recordsPerMinute: createJobDto.recordsPerMinute,
      createdAt: new Date(),
      status: 'pending',
    };

    this.logger.log(
      `Creating job ${jobId} with ${jobData.totalRecords} records at ${jobData.recordsPerMinute} records/min`,
    );

    try {
      // Publish to RabbitMQ with pattern 'job.create'
      this.rabbitClient.emit('job.create', jobData);

      this.logger.log(`Job ${jobId} successfully published to RabbitMQ`);

      return {
        jobId,
        message: 'Job created successfully',
        totalRecords: jobData.totalRecords,
        recordsPerMinute: jobData.recordsPerMinute,
      };
    } catch (error) {
      this.logger.error(`Failed to publish job ${jobId} to RabbitMQ`, error);
      throw error;
    }
  }

  async updateJobConfig(jobId: string, updateJobConfigDto: UpdateJobConfigDto) {
    const updateData = {
      jobId,
      recordsPerMinute: updateJobConfigDto.recordsPerMinute,
      updatedAt: new Date(),
    };

    this.logger.log(
      `Updating job ${jobId} config: ${updateData.recordsPerMinute} records/min`,
    );

    try {
      // Publish to RabbitMQ with pattern 'job.update'
      this.rabbitClient.emit('job.update', updateData);

      this.logger.log(
        `Job ${jobId} config update successfully published to RabbitMQ`,
      );

      return {
        jobId,
        message: 'Job configuration updated successfully',
        recordsPerMinute: updateData.recordsPerMinute,
      };
    } catch (error) {
      this.logger.error(
        `Failed to publish job ${jobId} update to RabbitMQ`,
        error,
      );
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    this.logger.log(`Getting status for job ${jobId}`);

    try {
      const jobStatus = await this.redisService.getJobStatus(jobId);

      if (jobStatus.status === 'not_found') {
        this.logger.warn(`Job ${jobId} not found in Redis`);
      }

      return jobStatus;
    } catch (error) {
      this.logger.error(`Failed to get status for job ${jobId}`, error);
      throw error;
    }
  }
}
