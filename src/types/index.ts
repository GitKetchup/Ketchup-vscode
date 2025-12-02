/**
 * Ketchup VS Code Extension Types
 * Mirrors cloud API types for consistency
 */

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  remoteUrl: string;
  defaultBranch: string;
  isActive: boolean;
}

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    login?: string;
    avatarUrl?: string;
    date: string;
  };
  url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface StoryPoint {
  id: string;
  type: 'FEATURE' | 'REFACTOR' | 'FIX' | 'DOCS' | 'STYLE' | 'TEST' | 'CHORE';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  commitShas: string[];
}

export interface Recap {
  id: string;
  repositoryId: string;
  title: string;
  summary: string;
  storyPoints: StoryPoint[];
  commits: Commit[];
  timeRange: {
    from: string;
    to: string;
  };
  status: 'DRAFT' | 'PROCESSING' | 'READY' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  recapId: string;
  type: 'AUDIO' | 'VIDEO' | 'CHANGELOG' | 'X_POST' | 'LINKEDIN_POST' | 'VISUAL';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  url?: string;
  content?: string;
  metadata?: {
    duration?: number;
    fileSize?: number;
    format?: string;
  };
  createdAt: string;
}

export interface Schedule {
  id: string;
  repositoryId: string;
  name: string;
  cron: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  config: {
    branch?: string;
    includeAuthors?: string[];
    excludeAuthors?: string[];
  };
}

export interface DraftRecapRequest {
  repositoryId: string;
  timeRange: {
    from: string;
    to: string;
  };
  commitShas: string[];
  includeAuthors?: string[];
  branch?: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}
