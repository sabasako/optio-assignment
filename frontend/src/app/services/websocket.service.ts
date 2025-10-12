import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface JobProgressUpdate {
  jobId: string;
  recordId: number;
  processedAt: string;
  workerId: string;
  progress: {
    processedCount: number;
    totalRecords: number;
    percentage: number;
    remainingRecords: number;
    estimatedTimeRemaining: string;
  };
  timestamp: string;
}

export interface JobCompletedUpdate {
  jobId: string;
  totalRecords: number;
  processedCount: number;
  timestamp: string;
}

export interface JobStartedUpdate {
  jobId: string;
  totalRecords: number;
  recordsPerMinute: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket: Socket | null = null;
  private readonly wsUrl = 'http://localhost:3003/updates';
  private initialized = false;

  private progressSubject = new Subject<JobProgressUpdate>();
  private completedSubject = new Subject<JobCompletedUpdate>();
  private startedSubject = new Subject<JobStartedUpdate>();
  private connectionSubject = new BehaviorSubject<boolean>(false);

  public progress$ = this.progressSubject.asObservable();
  public completed$ = this.completedSubject.asObservable();
  public started$ = this.startedSubject.asObservable();
  public connection$ = this.connectionSubject.asObservable();

  constructor() {
    // Auto-connect on service initialization
    this.connect();
  }

  connect(): void {
    // If already initialized and connected, emit current status and return
    if (this.initialized && this.socket?.connected) {
      console.log('WebSocket already connected');
      this.connectionSubject.next(true);
      return;
    }

    // If already initialized but not connected, just emit current status
    if (this.initialized && this.socket) {
      console.log('WebSocket exists but not connected');
      this.connectionSubject.next(false);
      return;
    }

    this.initialized = true;

    this.socket = io(this.wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.connectionSubject.next(true);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.connectionSubject.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.connectionSubject.next(false);
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      this.connectionSubject.next(true);
    });

    this.socket.on('job.progress', (data: JobProgressUpdate) => {
      this.progressSubject.next(data);
    });

    this.socket.on('job.completed', (data: JobCompletedUpdate) => {
      this.completedSubject.next(data);
    });

    this.socket.on('job.started', (data: JobStartedUpdate) => {
      this.startedSubject.next(data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  subscribeToJob(jobId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, connecting now...');
      this.connect();

      // Wait for connection and then subscribe
      setTimeout(() => {
        this.socket?.emit('subscribe', { jobId });
      }, 1000);
    } else {
      this.socket.emit('subscribe', { jobId });
    }

    console.log('Subscribed to job:', jobId);
  }

  unsubscribeFromJob(jobId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe', { jobId });
      console.log('Unsubscribed from job:', jobId);
    }
  }

  ping(): void {
    if (this.socket?.connected) {
      this.socket.emit('ping');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
