import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { JobStorageService } from '../../services/job-storage.service';

@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './job-create.component.html',
  styleUrls: ['./job-create.component.css']
})
export class JobCreateComponent {
  totalRecords: number = 100;
  recordsPerMinute: number = 60;
  isSubmitting = false;
  error: string | null = null;

  constructor(
    private apiService: ApiService,
    private jobStorage: JobStorageService,
    private router: Router
  ) {}

  onSubmit(): void {
    if (this.totalRecords <= 0 || this.recordsPerMinute <= 0) {
      this.error = 'Both fields must be greater than 0';
      return;
    }

    this.isSubmitting = true;
    this.error = null;

    this.apiService.createJob({
      totalRecords: this.totalRecords,
      recordsPerMinute: this.recordsPerMinute
    }).subscribe({
      next: (response) => {
        console.log('Job created:', response);

        // Save job to localStorage
        this.jobStorage.addJob({
          jobId: response.jobId,
          createdAt: new Date().toISOString(),
          totalRecords: response.totalRecords,
          recordsPerMinute: response.recordsPerMinute
        });

        // Navigate to dashboard (no query params needed)
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Error creating job:', err);
        this.error = 'Failed to create job. Please try again.';
        this.isSubmitting = false;
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }
}
