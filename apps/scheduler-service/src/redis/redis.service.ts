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
  status: 'pending' | 'sent' | 'processing' | 'completed';
  data: {
    id: number;
    timestamp: Date;
    value: string;
    metadata: Record<string, any>;
  };
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
    await this.redisClient.ping();
    this.logger.log('Redis connection verified');
  }

  // Job Configuration Methods
  async saveJobConfig(config: JobConfig): Promise<void> {
    const key = `job:${config.jobId}:config`;
    await this.redisClient.set(key, JSON.stringify(config));
    this.logger.log(`Saved job config for ${config.jobId}`);
  }

  async getJobConfig(jobId: string): Promise<JobConfig | null> {
    const key = `job:${jobId}:config`;
    const data = await this.redisClient.get(key);
    return data ? JSON.parse(data) : null;
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

  // Record Methods
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
    const record = await this.getRecord(jobId, recordId);
    if (record) {
      record.status = status;
      await this.saveRecord(record);
    }
  }

  // Scheduled Records Sorted Set (by unix timestamp)
  async addToScheduledQueue(
    jobId: string,
    recordId: number,
    scheduledAt: number,
  ): Promise<void> {
    const key = 'scheduled_records';
    const member = `${jobId}:${recordId}`;
    await this.redisClient.zadd(key, scheduledAt, member);
  }

  // Returns all records scheduled to be sent up to now, so it means there score is <= now
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

  // Removes record from sorted set after it's already sent to rabbitmq
  async removeFromScheduledQueue(
    jobId: string,
    recordId: number,
  ): Promise<void> {
    const key = 'scheduled_records';
    const member = `${jobId}:${recordId}`;
    await this.redisClient.zrem(key, member);
  }

  // Get all records for a job that haven't been sent yet
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

  async incrementProcessedCount(jobId: string): Promise<number> {
    const config = await this.getJobConfig(jobId);
    if (!config) {
      throw new Error(`Job ${jobId} not found`);
    }

    config.processedCount++;
    await this.saveJobConfig(config); // It doesn't need to update updatedAt, so we use saveJobConfig directly, instead of updateJobConfig
    return config.processedCount;
  }

  getClient(): Redis {
    return this.redisClient;
  }
}
