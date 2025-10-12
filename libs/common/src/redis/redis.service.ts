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

export interface RecordData {
  jobId: string;
  recordId: number;
  scheduledAt: number;
  // Pending is default status when created, sent is after published to RabbitMQ, processing is when worker server picks it up, completed is after successful processing, failed if processing failed
  status: 'pending' | 'sent' | 'processing' | 'completed' | 'failed';
  data: {
    id: number;
    timestamp: Date;
    value: string;
    metadata: Record<string, any>;
  };
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

  // ========== Job Configuration Methods ==========

  async saveJobConfig(config: JobConfig): Promise<void> {
    try {
      const key = `job:${config.jobId}:config`;
      await this.redisClient.set(key, JSON.stringify(config));
      this.logger.log(`Saved job config for ${config.jobId}`);
    } catch (error) {
      this.logger.error(
        `Error saving job config for ${config.jobId}: ${error.message}`,
      );
    }
  }

  async getJobConfig(jobId: string): Promise<JobConfig | null> {
    try {
      const key = `job:${jobId}:config`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(
        `Error getting job config for ${jobId}: ${error.message}`,
      );
      return null;
    }
  }

  async updateJobConfig(
    jobId: string,
    updates: Partial<JobConfig>,
  ): Promise<void> {
    const config = await this.getJobConfig(jobId);
    if (!config) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updated = { ...config, ...updates, updatedAt: new Date() };
    await this.saveJobConfig(updated);
    this.logger.log(`Updated job config for ${jobId}`);
  }

  async updateJobStatus(
    jobId: string,
    status: JobConfig['status'],
  ): Promise<void> {
    try {
      const config = await this.getJobConfig(jobId);
      if (config) {
        config.status = status;
        config.updatedAt = new Date();
        await this.saveJobConfig(config);
      }
    } catch (error) {
      this.logger.error(
        `Error updating job status for ${jobId}: ${error.message}`,
      );
    }
  }

  // ========== Record Methods ==========

  async saveRecord(record: RecordData): Promise<void> {
    const key = `job:${record.jobId}:record:${record.recordId}`;
    await this.redisClient.set(key, JSON.stringify(record));
  }

  async getRecord(jobId: string, recordId: number): Promise<RecordData | null> {
    const key = `job:${jobId}:record:${recordId}`;
    const data = await this.redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  async updateRecordStatus(
    jobId: string,
    recordId: number,
    status: RecordData['status'],
  ): Promise<void> {
    try {
      const record = await this.getRecord(jobId, recordId);
      if (record) {
        record.status = status;
        await this.saveRecord(record);
      }
    } catch (error) {
      this.logger.error(
        `Error updating record status for ${jobId}:${recordId}: ${error.message}`,
      );
    }
  }

  // ========== Scheduled Queue Methods (Sorted Set) ==========

  async addToScheduledQueue(
    jobId: string,
    recordId: number,
    scheduledAt: number,
  ): Promise<void> {
    const key = 'scheduled_records';
    const member = `${jobId}:${recordId}`;
    await this.redisClient.zadd(key, scheduledAt, member);
  }

  async getScheduledToNow(): Promise<
    Array<{ jobId: string; recordId: number }>
  > {
    const key = 'scheduled_records';
    const now = Date.now();
    const results = await this.redisClient.zrangebyscore(key, 0, now);

    return results.map((member) => {
      const [jobId, recordId] = member.split(':');
      return { jobId, recordId: parseInt(recordId, 10) };
    });
  }

  async removeFromScheduledQueue(
    jobId: string,
    recordId: number,
  ): Promise<void> {
    const key = 'scheduled_records';
    const member = `${jobId}:${recordId}`;
    await this.redisClient.zrem(key, member);
  }

  // ========== Job Progress Methods ==========

  async incrementProcessedCount(jobId: string): Promise<JobConfig | null> {
    try {
      const config = await this.getJobConfig(jobId);
      if (!config) {
        throw new Error(`Job ${jobId} not found`);
      }

      config.processedCount++;
      await this.saveJobConfig(config);
      return config;
    } catch (error) {
      this.logger.error(
        `Error incrementing processed count for ${jobId}: ${error.message}`,
      );
      throw error;
    }
  }

  async getPendingRecords(jobId: string): Promise<RecordData[]> {
    const pattern = `job:${jobId}:record:*`;
    const keys = await this.redisClient.keys(pattern);

    const records: RecordData[] = [];
    for (const key of keys) {
      const data = await this.redisClient.get(key);
      if (data) {
        const record = JSON.parse(data);
        if (record.status === 'pending') {
          records.push(record);
        }
      }
    }

    return records;
  }

  // ========== Job Status Methods ==========

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const config = await this.getJobConfig(jobId);

    if (!config) {
      return {
        jobId,
        status: 'not_found',
      };
    }

    const progressPercentage =
      config.totalRecords > 0
        ? Math.round((config.processedCount / config.totalRecords) * 100)
        : 0;

    const remainingRecords = config.totalRecords - config.processedCount;

    // Calculate estimated time remaining
    let estimatedTimeRemaining = 'N/A';
    if (
      config.status === 'processing' &&
      remainingRecords > 0 &&
      config.recordsPerMinute > 0
    ) {
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

  // ========== Utility Methods ==========

  getClient(): Redis {
    return this.redisClient;
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
    this.logger.log('Redis connection closed');
  }
}
