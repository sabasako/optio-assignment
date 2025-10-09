export class JobCreatedDto {
  jobId: string;
  totalRecords: number;
  recordsPerMinute: number;
  status: string;
  createdAt: Date;
}
