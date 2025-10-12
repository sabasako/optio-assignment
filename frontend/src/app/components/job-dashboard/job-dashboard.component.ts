import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, interval, takeUntil } from 'rxjs';
import { ApiService, JobStatus } from '../../services/api.service';
import {
  WebSocketService,
  JobProgressUpdate,
  JobCompletedUpdate,
} from '../../services/websocket.service';
import { JobStorageService } from '../../services/job-storage.service';

interface JobDisplay extends JobStatus {
  isActive: boolean;
}

@Component({
  selector: 'app-job-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './job-dashboard.component.html',
  styleUrls: ['./job-dashboard.component.css'],
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
  ) {}

  ngOnInit(): void {
    this.wsService.connect();

    // Monitor WebSocket connection status
    this.wsService.connection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((connected) => {
        this.wsConnected = connected;
      });

    // Listen for progress updates
    this.wsService.progress$
      .pipe(takeUntil(this.destroy$))
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
    storedJobIds.forEach(jobId => {
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
    // Fetch job status
    this.apiService.getJobStatus(jobId).subscribe({
      next: (status) => {
        this.jobs.set(jobId, {
          ...status,
          isActive:
            status.status === 'processing' || status.status === 'pending',
        });

        // Subscribe to WebSocket updates
        this.wsService.subscribeToJob(jobId);
      },
      error: (err) => {
        console.error('Error fetching job status:', err);
      },
    });
  }

  removeJob(jobId: string): void {
    this.wsService.unsubscribeFromJob(jobId);
    this.jobs.delete(jobId);
    // Also remove from localStorage
    this.jobStorage.removeJob(jobId);
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
      this.jobs.set(update.jobId, {
        ...job,
        processedCount: update.progress.processedCount,
        progressPercentage: update.progress.percentage,
        remainingRecords: update.progress.remainingRecords,
        estimatedTimeRemaining: update.progress.estimatedTimeRemaining,
        updatedAt: update.timestamp,
      });
    }
  }

  handleCompletedUpdate(update: JobCompletedUpdate): void {
    const job = this.jobs.get(update.jobId);
    if (job) {
      this.jobs.set(update.jobId, {
        ...job,
        status: 'completed',
        processedCount: update.totalRecords,
        progressPercentage: 100,
        remainingRecords: 0,
        estimatedTimeRemaining: 'Completed',
        isActive: false,
      });
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
}
