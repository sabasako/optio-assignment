import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export interface JobConfig {
  jobId: string;
  totalRecords: number;
  recordsPerMinute: number;
  status: 'pending' | 'processing' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
  processedCount: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'paused' | 'not_found';
  totalRecords?: number;
  processedCount?: number;
  recordsPerMinute?: number;
  progressPercentage?: number;
  remainingRecords?: number;
  estimatedTimeRemaining?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    this.redisClient = new Redis({
      host,
      port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redisClient.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.redisClient.ping();
      this.logger.log('Redis connection verified');
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  async getJobConfig(jobId: string): Promise<JobConfig | null> {
    try {
      const key = `job:${jobId}:config`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Error getting job config for ${jobId}: ${error.message}`);
      return null;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const config = await this.getJobConfig(jobId);

    if (!config) {
      return {
        jobId,
        status: 'not_found',
      };
    }

    const progressPercentage = config.totalRecords > 0
      ? Math.round((config.processedCount / config.totalRecords) * 100)
      : 0;

    const remainingRecords = config.totalRecords - config.processedCount;

    // Calculate estimated time remaining
    let estimatedTimeRemaining = 'N/A';
    if (config.status === 'processing' && remainingRecords > 0 && config.recordsPerMinute > 0) {
      const remainingMinutes = remainingRecords / config.recordsPerMinute;
      estimatedTimeRemaining = this.formatTimeRemaining(remainingMinutes);
    } else if (config.status === 'completed') {
      estimatedTimeRemaining = 'Completed';
    }

    return {
      jobId: config.jobId,
      status: config.status,
      totalRecords: config.totalRecords,
      processedCount: config.processedCount,
      recordsPerMinute: config.recordsPerMinute,
      progressPercentage,
      remainingRecords,
      estimatedTimeRemaining,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private formatTimeRemaining(minutes: number): string {
    if (minutes < 1) {
      const seconds = Math.ceil(minutes * 60);
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (minutes < 60) {
      const mins = Math.ceil(minutes);
      return `${mins} minute${mins !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = Math.ceil(minutes % 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
    }
  }

  getClient(): Redis {
    return this.redisClient;
  }
}
