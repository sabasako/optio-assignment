import { Routes } from '@angular/router';
import { JobCreateComponent } from './components/job-create/job-create.component';
import { JobDashboardComponent } from './components/job-dashboard/job-dashboard.component';
import { JobDetailsComponent } from './components/job-details/job-details.component';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'create', component: JobCreateComponent },
  { path: 'dashboard', component: JobDashboardComponent },
  { path: 'job/:id', component: JobDetailsComponent },
  { path: '**', redirectTo: '/dashboard' },
];
