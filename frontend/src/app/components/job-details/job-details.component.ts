import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { ApiService, JobStatus } from '../../services/api.service';
import { WebSocketService, JobProgressUpdate } from '../../services/websocket.service';
import { ToastService } from '../../services/toast.service';

Chart.register(...registerables);

interface ProcessingRate {
  timestamp: Date;
  recordsProcessed: number;
  rate: number;
}

@Component({
  selector: 'app-job-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './job-details.component.html',
  styleUrls: ['./job-details.component.css']
})
export class JobDetailsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('rateChart') rateChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('workerChart') workerChartRef!: ElementRef<HTMLCanvasElement>;

  jobId: string = '';
  job: JobStatus | null = null;
  newRecordsPerMinute: number = 60;
  isUpdatingSpeed = false;

  processingRates: ProcessingRate[] = [];
  workerStats: Map<string, number> = new Map();

  private rateChart: Chart | null = null;
  private workerChart: Chart | null = null;
  private destroy$ = new Subject<void>();
  private lastProcessedCount = 0;
  private lastUpdateTime: Date | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private wsService: WebSocketService,
    private toastService: ToastService
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
      .subscribe(update => {
        if (update.jobId === this.jobId) {
          this.handleProgressUpdate(update);
        }
      });

    // Listen for completion
    this.wsService.completed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(update => {
        if (update.jobId === this.jobId) {
          this.loadJobStatus(); // Refresh final status
        }
      });
  }

  ngAfterViewInit(): void {
    // Initialize charts after view is ready
    setTimeout(() => {
      this.initializeCharts();
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.wsService.unsubscribeFromJob(this.jobId);

    if (this.rateChart) {
      this.rateChart.destroy();
    }
    if (this.workerChart) {
      this.workerChart.destroy();
    }
  }

  loadJobStatus(): void {
    this.apiService.getJobStatus(this.jobId).subscribe({
      next: (status) => {
        this.job = status;
        this.newRecordsPerMinute = status.recordsPerMinute;
      },
      error: (err) => {
        console.error('Error loading job:', err);
      }
    });
  }

  handleProgressUpdate(update: JobProgressUpdate): void {
    if (this.job) {
      // Update job status
      this.job.processedCount = update.progress.processedCount;
      this.job.progressPercentage = update.progress.percentage;
      this.job.remainingRecords = update.progress.remainingRecords;
      this.job.estimatedTimeRemaining = update.progress.estimatedTimeRemaining;

      // Calculate processing rate
      const now = new Date();
      if (this.lastUpdateTime) {
        const timeDiff = (now.getTime() - this.lastUpdateTime.getTime()) / 1000; // seconds
        const recordsDiff = update.progress.processedCount - this.lastProcessedCount;
        const rate = timeDiff > 0 ? (recordsDiff / timeDiff) * 60 : 0; // records per minute

        this.processingRates.push({
          timestamp: now,
          recordsProcessed: update.progress.processedCount,
          rate: Math.round(rate)
        });

        // Keep only last 50 data points
        if (this.processingRates.length > 50) {
          this.processingRates.shift();
        }

        this.updateRateChart();
      }

      this.lastProcessedCount = update.progress.processedCount;
      this.lastUpdateTime = now;

      // Update worker stats
      const currentCount = this.workerStats.get(update.workerId) || 0;
      this.workerStats.set(update.workerId, currentCount + 1);
      this.updateWorkerChart();
    }
  }

  initializeCharts(): void {
    if (this.rateChartRef?.nativeElement) {
      const ctx = this.rateChartRef.nativeElement.getContext('2d');
      if (ctx) {
        this.rateChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Processing Rate (records/min)',
              data: [],
              borderColor: 'rgb(66, 153, 225)',
              backgroundColor: 'rgba(66, 153, 225, 0.1)',
              tension: 0.4,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Records/Minute'
                }
              },
              x: {
                display: false
              }
            }
          }
        });
      }
    }

    if (this.workerChartRef?.nativeElement) {
      const ctx = this.workerChartRef.nativeElement.getContext('2d');
      if (ctx) {
        this.workerChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: [],
            datasets: [{
              data: [],
              backgroundColor: [
                'rgb(66, 153, 225)',
                'rgb(72, 187, 120)',
                'rgb(237, 137, 54)',
                'rgb(159, 122, 234)',
                'rgb(236, 72, 153)'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom'
              }
            }
          }
        });
      }
    }
  }

  updateRateChart(): void {
    if (this.rateChart && this.processingRates.length > 0) {
      const labels = this.processingRates.map(r =>
        r.timestamp.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
      const data = this.processingRates.map(r => r.rate);

      this.rateChart.data.labels = labels;
      this.rateChart.data.datasets[0].data = data;
      this.rateChart.update('none');
    }
  }

  updateWorkerChart(): void {
    if (this.workerChart && this.workerStats.size > 0) {
      const labels = Array.from(this.workerStats.keys()).map(id =>
        id.substring(0, 20) + '...'
      );
      const data = Array.from(this.workerStats.values());

      this.workerChart.data.labels = labels;
      this.workerChart.data.datasets[0].data = data;
      this.workerChart.update('none');
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

    this.apiService.updateJobSpeed(this.jobId, this.newRecordsPerMinute).subscribe({
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
      }
    });
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  isSpeedUnchanged(): boolean {
    return this.job?.recordsPerMinute === this.newRecordsPerMinute;
  }
}
