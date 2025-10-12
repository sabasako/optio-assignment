import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CreateJobRequest {
  totalRecords: number;
  recordsPerMinute: number;
}

export interface CreateJobResponse {
  jobId: string;
  message: string;
  totalRecords: number;
  recordsPerMinute: number;
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
  totalRecords: number;
  processedCount: number;
  recordsPerMinute: number;
  progressPercentage: number;
  remainingRecords: number;
  estimatedTimeRemaining: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly apiUrl = 'http://localhost:3000/api/processing';

  constructor(private http: HttpClient) {}

  createJob(request: CreateJobRequest): Observable<CreateJobResponse> {
    return this.http.post<CreateJobResponse>(`${this.apiUrl}/start`, request);
  }

  getJobStatus(jobId: string): Observable<JobStatus> {
    return this.http.get<JobStatus>(`${this.apiUrl}/${jobId}/status`);
  }

  updateJobSpeed(jobId: string, recordsPerMinute: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${jobId}/config`, {
      recordsPerMinute,
    });
  }
}
