export class RecordProcessDto {
  jobId: string;
  recordId: number;
  data: {
    id: number;
    timestamp: Date;
    value: string;
    metadata: Record<string, any>;
  };
  scheduledAt: Date;
  sentAt: Date;
}
