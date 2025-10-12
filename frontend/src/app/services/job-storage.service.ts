import { Injectable } from '@angular/core';

export interface StoredJob {
  jobId: string;
  createdAt: string;
  totalRecords: number;
  recordsPerMinute: number;
}

@Injectable({
  providedIn: 'root'
})
export class JobStorageService {
  private readonly STORAGE_KEY = 'optio_jobs';

  constructor() {}

  /**
   * Add a new job to localStorage
   */
  addJob(job: StoredJob): void {
    const jobs = this.getAllJobs();

    // Check if job already exists
    const exists = jobs.some(j => j.jobId === job.jobId);
    if (!exists) {
      jobs.unshift(job); // Add to beginning
      this.saveJobs(jobs);
    }
  }

  /**
   * Get all stored jobs
   */
  getAllJobs(): StoredJob[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error reading jobs from localStorage:', error);
    }
    return [];
  }

  /**
   * Get all job IDs
   */
  getAllJobIds(): string[] {
    return this.getAllJobs().map(job => job.jobId);
  }

  /**
   * Remove a job from localStorage
   */
  removeJob(jobId: string): void {
    const jobs = this.getAllJobs().filter(job => job.jobId !== jobId);
    this.saveJobs(jobs);
  }

  /**
   * Clear all jobs
   */
  clearAllJobs(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Get a specific job by ID
   */
  getJob(jobId: string): StoredJob | undefined {
    return this.getAllJobs().find(job => job.jobId === jobId);
  }

  /**
   * Check if a job exists
   */
  hasJob(jobId: string): boolean {
    return this.getAllJobs().some(job => job.jobId === jobId);
  }

  /**
   * Save jobs to localStorage
   */
  private saveJobs(jobs: StoredJob[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(jobs));
    } catch (error) {
      console.error('Error saving jobs to localStorage:', error);
    }
  }
}
