import { Injectable, Logger } from '@nestjs/common';
import { RedisService, JobConfig, RecordData } from '@app/common';
import { JobCreatedDto, JobUpdatedDto } from './dto';
import { randomUUID } from 'crypto';

// prettier-ignore
const adjectives = ['Adventurous', 'Ambitious', 'Brave', 'Bright', 'Charming', 'Cheerful','Clever', 'Cool', 'Courageous', 'Creative', 'Dapper', 'Dazzling','Debonair', 'Determined', 'Diligent', 'Dynamic', 'Eager', 'Eloquent','Enchanting', 'Energetic', 'Enthusiastic', 'Epic', 'Fancy', 'Fearless','Gallant', 'Gentle', 'Giant', 'Gleaming', 'Happy', 'Honest','Jolly', 'Jovial', 'Keen', 'Kind', 'Lucky', 'Magic','Majestic', 'Merry', 'Noble', 'Plucky', 'Polite', 'Proud','Quick', 'Radiant', 'Royal', 'Silly', 'Stellar', 'Tiny','Vibrant', 'Witty'];

// prettier-ignore
const nouns = ['Aardvark', 'Alpaca', 'Antelope', 'Axolotl', 'Badger', 'Bison','Capybara', 'Chameleon', 'Cheetah', 'Cobra', 'Dingo', 'Dolphin','Dragon', 'Eagle', 'Echidna', 'Elephant', 'Falcon', 'Ferret','Fossa', 'Fox', 'Gazelle', 'Gecko', 'Giraffe', 'Grizzly','Hippo', 'Husky', 'Ibex', 'Iguana', 'Impala', 'Jaguar','Jellyfish', 'Kangaroo', 'Kingfisher', 'Koala', 'Lemming', 'Lemur','Leopard', 'Llama', 'Manatee', 'Mongoose', 'Narwhal', 'Nightingale','Ocelot', 'Octopus', 'Okapi', 'Ostrich', 'Panda', 'Panther','Phoenix', 'Quokka'];

@Injectable()
export class SchedulerServiceService {
  private readonly logger = new Logger(SchedulerServiceService.name);

  constructor(private readonly redisService: RedisService) {}

  async handleJobCreated(dto: JobCreatedDto): Promise<void> {
    this.logger.log(
      `Handling job creation: ${dto.jobId} - ${dto.totalRecords} records at ${dto.recordsPerMinute}/min`,
    );

    const jobConfig: JobConfig = {
      jobId: dto.jobId,
      totalRecords: dto.totalRecords,
      recordsPerMinute: dto.recordsPerMinute,
      processedCount: 0,
      status: 'processing',
      createdAt: new Date(dto.createdAt),
      updatedAt: new Date(),
    };

    // Save job config to redis
    await this.redisService.saveJobConfig(jobConfig);

    // Calculate schedule for all records
    await this.scheduleRecords(
      dto.jobId,
      dto.totalRecords,
      dto.recordsPerMinute,
    );

    this.logger.log(`Job ${dto.jobId} scheduled successfully`);
  }

  async handleJobUpdated(dto: JobUpdatedDto): Promise<void> {
    this.logger.log(
      `Handling job update: ${dto.jobId} - new rate: ${dto.recordsPerMinute}/min`,
    );

    const jobConfig = await this.redisService.getJobConfig(dto.jobId);
    if (!jobConfig) {
      this.logger.warn(`Job ${dto.jobId} not found for update`);
      return;
    }

    // Update the rate
    await this.redisService.updateJobConfig(dto.jobId, {
      recordsPerMinute: dto.recordsPerMinute,
    });

    // Reschedule pending records with new rate
    await this.rescheduleRecords(dto.jobId, dto.recordsPerMinute);

    this.logger.log(`Job ${dto.jobId} updated successfully`);
  }

  private async scheduleRecords(
    jobId: string,
    totalRecords: number,
    recordsPerMinute: number,
  ): Promise<void> {
    // Calculate interval in milliseconds
    const intervalMs = (60 * 1000) / recordsPerMinute;
    const startTime = Date.now();

    this.logger.log(
      `Scheduling ${totalRecords} records with ${intervalMs}ms interval`,
    );

    for (let i = 0; i < totalRecords; i++) {
      const scheduledAt = startTime + i * intervalMs;

      // Create record with dummy data
      const record: RecordData = {
        jobId,
        recordId: i,
        scheduledAt,
        status: 'pending',
        data: this.generateRecordData(i),
      };

      // Save record to Redis
      await this.redisService.saveRecord(record);

      // Add to scheduled queue (sorted set by timestamp)
      await this.redisService.addToScheduledQueue(jobId, i, scheduledAt);
    }

    this.logger.log(`Scheduled ${totalRecords} records for job ${jobId}`);
  }

  private async rescheduleRecords(
    jobId: string,
    newRecordsPerMinute: number,
  ): Promise<void> {
    // Get all pending records
    const pendingRecords = await this.redisService.getPendingRecords(jobId);

    if (pendingRecords.length === 0) {
      this.logger.log(`No pending records to reschedule for job ${jobId}`);
      return;
    }

    // Calculate new interval
    const intervalMs = (60 * 1000) / newRecordsPerMinute;
    const startTime = Date.now();

    this.logger.log(
      `Rescheduling ${pendingRecords.length} pending records with new ${intervalMs}ms interval`,
    );

    // Sort by recordId to maintain order
    pendingRecords.sort((a, b) => a.recordId - b.recordId);

    for (let i = 0; i < pendingRecords.length; i++) {
      const record = pendingRecords[i];
      const newScheduledAt = startTime + i * intervalMs;

      // Update record
      record.scheduledAt = newScheduledAt;
      await this.redisService.saveRecord(record);

      // Update in scheduled queue
      await this.redisService.removeFromScheduledQueue(jobId, record.recordId);
      await this.redisService.addToScheduledQueue(
        jobId,
        record.recordId,
        newScheduledAt,
      );
    }

    this.logger.log(
      `Rescheduled ${pendingRecords.length} records for job ${jobId}`,
    );
  }

  private generateRecordData(recordId: number): RecordData['data'] {
    const randomAdjective =
      adjectives[Math.floor(Math.random() * adjectives.length)];

    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    return {
      id: recordId,
      timestamp: new Date(),
      value: `${randomAdjective}-${randomNoun}-${recordId}-${randomUUID().slice(0, 8)}`,
      metadata: {
        source: 'scheduler',
        version: '1.0',
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
