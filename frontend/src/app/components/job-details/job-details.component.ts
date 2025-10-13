import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ApiService, JobStatus } from '../../services/api.service';
import {
  WebSocketService,
  JobProgressUpdate,
} from '../../services/websocket.service';
import { ToastService } from '../../services/toast.service';

interface ProcessingRate {
  timestamp: Date;
  recordsProcessed: number;
  rate: number;
}

interface ProcessedRecord {
  recordId: number;
  processedAt: string;
  workerId: string;
  processedCount: number;
}

@Component({
  selector: 'app-job-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './job-details.component.html',
  styleUrls: ['./job-details.component.css'],
})
export class JobDetailsComponent implements OnInit, OnDestroy {
  jobId: string = '';
  job: JobStatus | null = null;
  newRecordsPerMinute: number = 60;
  isUpdatingSpeed = false;

  processingRates: ProcessingRate[] = [];
  workerStats: Map<string, number> = new Map();

  // Processed records data
  processedRecords: ProcessedRecord[] = [];
  currentPage = 1;
  pageSize = 10;
  maxRecordsToStore = 100; // Store max 100 most recent records

  private destroy$ = new Subject<void>();
  private lastProcessedCount = 0;
  private lastUpdateTime: Date | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private wsService: WebSocketService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('id') || '';

    if (!this.jobId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Fetch initial job status
    this.loadJobStatus();

    // Connect to WebSocket
    this.wsService.connect();
    this.wsService.subscribeToJob(this.jobId);

    // Listen for progress updates
    this.wsService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        if (update.jobId === this.jobId) {
          this.handleProgressUpdate(update);
        }
      });

    // Listen for completion
    this.wsService.completed$
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        if (update.jobId === this.jobId) {
          this.loadJobStatus(); // Refresh final status
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.wsService.unsubscribeFromJob(this.jobId);
  }

  loadJobStatus(): void {
    this.apiService.getJobStatus(this.jobId).subscribe({
      next: (status) => {
        this.job = status;
        this.newRecordsPerMinute = status.recordsPerMinute;
      },
      error: (err) => {
        console.error('Error loading job:', err);
        this.toastService.error(
          'Could not find job details. Please go back to the dashboard.',
        );
      },
    });
  }

  handleProgressUpdate(update: JobProgressUpdate): void {
    if (this.job) {
      // Update job status
      this.job.processedCount = update.progress.processedCount;
      this.job.progressPercentage = update.progress.percentage;
      this.job.remainingRecords = update.progress.remainingRecords;
      this.job.estimatedTimeRemaining = update.progress.estimatedTimeRemaining;

      // Store processed record data
      this.processedRecords.unshift({
        recordId: update.recordId,
        processedAt: update.processedAt,
        workerId: update.workerId,
        processedCount: update.progress.processedCount,
      });

      // Keep only the most recent records to avoid memory issues
      if (this.processedRecords.length > this.maxRecordsToStore) {
        this.processedRecords.pop();
      }

      // Calculate processing rate
      const now = new Date();
      if (this.lastUpdateTime) {
        const timeDiff = (now.getTime() - this.lastUpdateTime.getTime()) / 1000; // seconds
        const recordsDiff =
          update.progress.processedCount - this.lastProcessedCount;
        const rate = timeDiff > 0 ? (recordsDiff / timeDiff) * 60 : 0; // records per minute

        this.processingRates.push({
          timestamp: now,
          recordsProcessed: update.progress.processedCount,
          rate: Math.round(rate),
        });

        // Keep only last 50 data points
        if (this.processingRates.length > 50) {
          this.processingRates.shift();
        }
      }

      this.lastProcessedCount = update.progress.processedCount;
      this.lastUpdateTime = now;

      // Update worker stats
      const currentCount = this.workerStats.get(update.workerId) || 0;
      this.workerStats.set(update.workerId, currentCount + 1);
    }
  }

  updateSpeed(): void {
    if (this.newRecordsPerMinute <= 0) {
      this.toastService.error('Speed must be greater than 0');
      return;
    }

    if (this.isSpeedUnchanged()) {
      this.toastService.info('Speed is already set to this value');
      return;
    }

    this.isUpdatingSpeed = true;

    this.apiService
      .updateJobSpeed(this.jobId, this.newRecordsPerMinute)
      .subscribe({
        next: () => {
          this.toastService.success('Job speed updated successfully');
          this.loadJobStatus();
        },
        error: (err) => {
          console.error('Error updating speed:', err);
          this.toastService.error('Failed to update speed. Please try again.');
        },
        complete: () => {
          this.isUpdatingSpeed = false;
        },
      });
  }

  getRecordsPerSecond(rpm: number): number {
    return Math.floor((rpm / 60) * 10) / 10;
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  isSpeedUnchanged(): boolean {
    return this.job?.recordsPerMinute === this.newRecordsPerMinute;
  }

  // Pagination methods for processed records
  get paginatedRecords(): ProcessedRecord[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.processedRecords.slice(startIndex, endIndex);
  }

  get totalPages(): number {
    return Math.ceil(this.processedRecords.length / this.pageSize);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(
      1,
      this.currentPage - Math.floor(maxPagesToShow / 2),
    );
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }
}
