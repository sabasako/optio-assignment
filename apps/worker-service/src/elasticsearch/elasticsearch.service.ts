import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface ProcessedRecord {
  jobId: string;
  recordId: number;
  data: any;
  processedAt: Date;
  processingTime: number;
  workerId: string;
  status: 'completed' | 'failed';
  error?: string;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly elasticsearchUrl: string;
  private readonly indexName = 'processed-records';

  constructor() {
    this.elasticsearchUrl =
      process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
  }

  async onModuleInit() {
    await this.ensureIndexExists();
  }

  // If elastic index doesn't exist, create it with appropriate mappings
  private async ensureIndexExists(): Promise<void> {
    try {
      const response = await fetch(
        `${this.elasticsearchUrl}/${this.indexName}`,
      );

      if (response.status === 404) {
        this.logger.log(`Index ${this.indexName} not found, creating...`);
        await this.createIndex();
      } else if (response.ok) {
        this.logger.log(`Index ${this.indexName} already exists`);
      } else {
        this.logger.warn(
          `Unexpected response checking index: ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error checking index existence: ${error.message}`);
    }
  }

  private async createIndex(): Promise<void> {
    try {
      const mappings = {
        mappings: {
          properties: {
            jobId: { type: 'keyword' },
            recordId: { type: 'long' },
            data: { type: 'object', enabled: true },
            processedAt: { type: 'date' },
            processingTime: { type: 'long' },
            workerId: { type: 'keyword' },
            status: { type: 'keyword' },
            error: { type: 'text' },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      };

      const response = await fetch(
        `${this.elasticsearchUrl}/${this.indexName}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mappings),
        },
      );

      if (response.ok) {
        this.logger.log(`Index ${this.indexName} created successfully`);
      } else {
        const error = await response.text();
        this.logger.error(`Failed to create index: ${error}`);
      }
    } catch (error) {
      this.logger.error(`Error creating index: ${error.message}`);
    }
  }

  // Inserts or updates record in Elasticsearch
  async indexRecord(record: ProcessedRecord): Promise<boolean> {
    try {
      const docId = `${record.jobId}_${record.recordId}`;
      const url = `${this.elasticsearchUrl}/${this.indexName}/_doc/${docId}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });

      if (response.ok) {
        this.logger.debug(
          `Indexed record ${record.jobId}:${record.recordId} successfully`,
        );
        return true;
      } else {
        const error = await response.text();
        this.logger.error(
          `Failed to index record ${record.jobId}:${record.recordId}: ${error}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error indexing record ${record.jobId}:${record.recordId}: ${error.message}`,
      );
      return false;
    }
  }

  // We might need to index multiple records at once for efficiency. Sending multiple http requests (maybe 10s or 100s in a second) is not efficient, so we use the bulk API for that
  async bulkIndexRecords(records: ProcessedRecord[]): Promise<number> {
    if (records.length === 0) return 0;

    try {
      const bulkBody = records.flatMap((record) => {
        const docId = `${record.jobId}_${record.recordId}`;
        return [{ index: { _index: this.indexName, _id: docId } }, record];
      });

      const response = await fetch(`${this.elasticsearchUrl}/_bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: bulkBody.map((item) => JSON.stringify(item)).join('\n') + '\n', // We need to use NDJSON for bulk API
      });

      if (response.ok) {
        const result = await response.json();
        const successCount = result.items.filter(
          (item: any) => item.index.status === 200 || item.index.status === 201,
        ).length;
        this.logger.log(
          `Bulk indexed ${successCount}/${records.length} records`,
        );
        return successCount;
      } else {
        const error = await response.text();
        this.logger.error(`Bulk index failed: ${error}`);
        return 0;
      }
    } catch (error) {
      this.logger.error(`Error in bulk indexing: ${error.message}`);
      return 0;
    }
  }

  // Get count of records, if jobId is provided, count only records for that job
  async getRecordCount(jobId?: string): Promise<number> {
    try {
      let url = `${this.elasticsearchUrl}/${this.indexName}/_count`;
      const body = jobId ? { query: { term: { jobId } } } : undefined;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const result = await response.json();
        return result.count;
      }
      return 0;
    } catch (error) {
      this.logger.error(`Error getting record count: ${error.message}`);
      return 0;
    }
  }
}
