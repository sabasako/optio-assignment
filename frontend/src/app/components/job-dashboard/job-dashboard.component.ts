import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, interval, takeUntil, throttleTime } from 'rxjs';
import { ApiService, JobStatus } from '../../services/api.service';
import {
  WebSocketService,
  JobProgressUpdate,
  JobCompletedUpdate,
} from '../../services/websocket.service';
import { JobStorageService } from '../../services/job-storage.service';

export interface JobDisplay extends JobStatus {
  isActive: boolean;
}

@Component({
  selector: 'app-job-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './job-dashboard.component.html',
  styleUrls: ['./job-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDashboardComponent implements OnInit, OnDestroy {
  jobs: Map<string, JobDisplay> = new Map();
  wsConnected = false;
  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private wsService: WebSocketService,
    private jobStorage: JobStorageService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.wsService.connect();

    // Monitor WebSocket connection status
    this.wsService.connection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((connected) => {
        this.wsConnected = connected;
        this.cdr.markForCheck();
      });

    // Listen for progress updates
    this.wsService.progress$
      .pipe(
        takeUntil(this.destroy$),
        throttleTime(100, undefined, { leading: true, trailing: true }),
      )
      .subscribe((update) => {
        this.handleProgressUpdate(update);
      });

    // Listen for completion updates
    this.wsService.completed$
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        this.handleCompletedUpdate(update);
      });

    // Load all jobs from localStorage
    this.loadAllStoredJobs();

    // Poll for job updates every 2 seconds (fallback if WebSocket fails)
    interval(2000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshJobs();
      });
  }

  /**
   * Load all jobs from localStorage and subscribe to their updates
   */
  private loadAllStoredJobs(): void {
    const storedJobIds = this.jobStorage.getAllJobIds();

    if (storedJobIds.length === 0) {
      console.log('No stored jobs found');
      return;
    }

    console.log(`Loading ${storedJobIds.length} jobs from localStorage`);

    // Load each job
    storedJobIds.forEach((jobId) => {
      this.addJob(jobId);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    this.jobs.forEach((job, jobId) => {
      this.wsService.unsubscribeFromJob(jobId);
    });
  }

  addJob(jobId: string): void {
    this.apiService.getJobStatus(jobId).subscribe({
      next: (status) => {
        this.jobs.set(jobId, {
          ...status,
          isActive:
            status.status === 'processing' || status.status === 'pending',
        });

        // Subscribe to WebSocket updates
        this.wsService.subscribeToJob(jobId);

        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error fetching job status:', err);
      },
    });
  }

  removeJob(jobId: string): void {
    this.wsService.unsubscribeFromJob(jobId);
    this.jobs.delete(jobId);
    this.jobStorage.removeJob(jobId);

    this.cdr.markForCheck();
  }

  refreshJobs(): void {
    this.jobs.forEach((job, jobId) => {
      if (job.isActive) {
        this.apiService.getJobStatus(jobId).subscribe({
          next: (status) => {
            this.jobs.set(jobId, {
              ...status,
              isActive:
                status.status === 'processing' || status.status === 'pending',
            });

            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('Error refreshing job:', err);
          },
        });
      }
    });
  }

  handleProgressUpdate(update: JobProgressUpdate): void {
    const job = this.jobs.get(update.jobId);
    if (job) {
      // Mutate in place instead of creating new object to avoid re-rendering
      job.processedCount = update.progress.processedCount;
      job.progressPercentage = update.progress.percentage;
      job.remainingRecords = update.progress.remainingRecords;
      job.estimatedTimeRemaining = update.progress.estimatedTimeRemaining;
      job.updatedAt = update.timestamp;

      this.cdr.markForCheck();
    }
  }

  handleCompletedUpdate(update: JobCompletedUpdate): void {
    const job = this.jobs.get(update.jobId);
    if (job) {
      // Mutate in place instead of creating new object
      job.status = 'completed';
      job.processedCount = update.totalRecords;
      job.progressPercentage = 100;
      job.remainingRecords = 0;
      job.estimatedTimeRemaining = 'Completed';
      job.isActive = false;

      this.cdr.markForCheck();
    }
  }

  getJobsArray(): JobDisplay[] {
    return Array.from(this.jobs.values()).sort((a, b) => {
      // Sort by status (active first) then by creation date
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'processing':
        return 'status-processing';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return '';
    }
  }

  viewJobDetails(jobId: string): void {
    this.router.navigate(['/job', jobId]);
  }

  // TrackBy function to prevent unnecessary re-renders of job cards
  trackByJobId(_index: number, job: JobDisplay): string {
    return job.jobId;
  }
}
