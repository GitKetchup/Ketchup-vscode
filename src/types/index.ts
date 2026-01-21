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
  summary: {
    summary: string;
    bulletins: any[];
    channels?: any;
  };
  // storyPoints: StoryPoint[]; // Deprecated/Removed in favor of summary.bulletins
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

// ============================================
// Intelligence Platform Types
// ============================================

export interface MomentumData {
  score: number;
  grade: string;
  interpretation: string;
  velocity_growth: number;
  complexity_growth: number;
  period: {
    start: string;
    end: string;
  };
  highlights: MomentumHighlight[];
}

export interface MomentumHighlight {
  type: 'positive' | 'warning' | 'neutral';
  icon: string;
  title: string;
  description: string;
}

export interface VelocityPulseContributor {
  username: string;
  email?: string;
  avatarUrl?: string;
  commits: number;
  velocity: number;
  velocity_delta: number;
  trend: 'up' | 'down' | 'stable';
  leverage_index: number;
}

export interface VelocityPulse {
  contributors: VelocityPulseContributor[];
  period_days: number;
  total_commits: number;
  top_contributor?: string;
}

export interface HealthTrend {
  delta: number;
  interpretation: string;
  breakdown: {
    security_fixes: number;
    security_new: number;
    dead_code_removed: number;
    quick_wins_resolved: number;
  };
  sparkline: number[]; // Last 8 weeks of health scores
}

export interface IntelligenceSummary {
  momentum: MomentumData;
  velocity_pulse: VelocityPulse;
  health_trend: HealthTrend;
  flow_score: number;
  overall_grade: string;
  narration?: string;
}

export interface ForensicsData {
  complexity_hotspots: ComplexityHotspot[];
  security_summary: SecuritySummary;
  dead_code: DeadCodeMetrics;
  quick_wins: QuickWin[];
  overall_health: string;
}

export interface ComplexityHotspot {
  file: string;
  function_name?: string;
  complexity: number;
  loc: number;
  language: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface SecuritySummary {
  total_vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  grade: string;
  last_scan?: string;
}

export interface DeadCodeMetrics {
  estimated_lines: number;
  unused_functions: number;
  unused_imports: number;
  unused_variables: number;
}

export interface QuickWin {
  type: 'complexity' | 'security' | 'dead_code' | 'test' | 'docs';
  title: string;
  description: string;
  file?: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ContributorProfile {
  username: string;
  email?: string;
  avatarUrl?: string;
  commits: number;
  leverage_index: number;
  velocity_trend: number;
  primary_language: string;
  languages: Record<string, number>;
  frameworks: string[];
  modules: string[];
  bus_factor_contribution: number;
  first_seen?: string;
  last_active?: string;
}

export interface SkillsGraph {
  contributors: ContributorProfile[];
  team_size: number;
  bus_factor: number;
  language_distribution: Record<string, number>;
  framework_distribution: Record<string, number>;
  module_ownership: Record<string, string>; // module -> primary owner
}

