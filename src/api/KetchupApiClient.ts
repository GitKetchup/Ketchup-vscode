import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';
import {
  Repository,
  Recap,
  DraftRecapRequest,
  Asset,
  Schedule,
  Commit,
  ApiError,
  AuthTokenResponse,
  IntelligenceSummary,
  ForensicsData,
  SkillsGraph
} from '../types';
import { extensionContext } from '../context/ExtensionContext';

/**
 * Ketchup API Client
 * Handles all communication with the Ketchup cloud backend
 */
export class KetchupApiClient {
  private axios: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getApiUrl();
    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.axios.interceptors.request.use(
      async (config) => {
        const token = await this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          const refreshed = await this.refreshAccessToken();
          if (refreshed && error.config) {
            return this.axios.request(error.config);
          }
          // Refresh failed, logout
          await this.handleLogout();
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private getApiUrl(): string {
    const config = vscode.workspace.getConfiguration('ketchup');
    const configuredUrl = config.get<string>('apiUrl');
    
    // Default to localhost for development
    const defaultUrl = 'http://localhost:3003';
    
    let url = configuredUrl || defaultUrl;

    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    
    // Ensure URL ends with /api
    if (!url.endsWith('/api')) {
      url = `${url}/api`;
    }
    
    console.log('[API] Using base URL:', url);
    return url;
  }

  private async getAccessToken(): Promise<string | undefined> {
    return await extensionContext.getSecrets().get('ketchup.accessToken');
  }

  private async setAccessToken(token: string): Promise<void> {
    await extensionContext.getSecrets().store('ketchup.accessToken', token);
  }

  private async getRefreshToken(): Promise<string | undefined> {
    return await extensionContext.getSecrets().get('ketchup.refreshToken');
  }

  private async setRefreshToken(token: string): Promise<void> {
    await extensionContext.getSecrets().store('ketchup.refreshToken', token);
  }

  private handleError(error: AxiosError): ApiError {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      statusCode: error.response?.status,
    };

    if (error.response?.data) {
      const data = error.response.data as any;
      apiError.message = data.message || data.error || apiError.message;
      apiError.code = data.code;
    } else if (error.message) {
      apiError.message = error.message;
    }

    return apiError;
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const response = await this.axios.post<AuthTokenResponse>('/v1/auth/refresh', {
        refreshToken,
      });

      await this.setAccessToken(response.data.accessToken);
      await this.setRefreshToken(response.data.refreshToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async handleLogout(): Promise<void> {
    await extensionContext.getSecrets().delete('ketchup.accessToken');
    await extensionContext.getSecrets().delete('ketchup.refreshToken');
    vscode.window.showWarningMessage('Session expired. Please log in again.');
    // Do NOT automatically connect, as this causes a loop if auth fails repeatedly
    // vscode.commands.executeCommand('ketchup.connect');
  }

  // ===== Authentication =====

  async exchangeCodeForToken(code: string): Promise<AuthTokenResponse> {
    const response = await this.axios.post<AuthTokenResponse>('/v1/auth/vscode/callback', {
      code,
    });
    await this.setAccessToken(response.data.accessToken);
    await this.setRefreshToken(response.data.refreshToken);
    return response.data;
  }

  async setSession(accessToken: string, refreshToken: string): Promise<void> {
    await this.setAccessToken(accessToken);
    await this.setRefreshToken(refreshToken);
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }

  async logout(): Promise<void> {
    await this.handleLogout();
  }

  // ===== Repositories =====

  async lookupRepository(remoteUrl: string): Promise<Repository | null> {
    try {
      console.log('[API] Looking up repository:', remoteUrl);
      const response = await this.axios.get<Repository>('/v1/repos/lookup', {
        params: { url: remoteUrl },
      });
      console.log('[API] Lookup successful:', response.status);
      return response.data;
    } catch (error) {
      const apiError = error as ApiError;
      console.log('[API] Lookup failed:', apiError.statusCode, apiError.message);
      
      if (apiError.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getRepositories(): Promise<Repository[]> {
    const response = await this.axios.get<Repository[]>('/v1/repos');
    return response.data;
  }

  async getRepository(id: string): Promise<Repository> {
    const response = await this.axios.get<Repository>(`/v1/repos/${id}`);
    return response.data;
  }

  // ===== Recaps =====

  async getRecaps(repositoryId: string, limit = 20): Promise<Recap[]> {
    const response = await this.axios.get<Recap[]>('/v1/recaps', {
      params: { repositoryId, limit },
    });
    return response.data;
  }

  async getRecap(id: string): Promise<Recap> {
    const response = await this.axios.get<Recap>(`/v1/recaps/${id}`);
    return response.data;
  }

  async createRecap(request: DraftRecapRequest): Promise<Recap> {
    const response = await this.axios.post<Recap>('/v1/recaps', request);
    return response.data;
  }

  async pollRecapStatus(id: string, maxAttempts = 60, intervalMs = 2000): Promise<Recap> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const poll = setInterval(async () => {
        try {
          attempts++;
          const recap = await this.getRecap(id);

          if (recap.status === 'READY') {
            clearInterval(poll);
            resolve(recap);
          } else if (recap.status === 'FAILED') {
            clearInterval(poll);
            reject(new Error('Recap generation failed'));
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            reject(new Error('Recap generation timed out'));
          }
        } catch (error) {
          clearInterval(poll);
          reject(error);
        }
      }, intervalMs);
    });
  }

  // ===== Commits =====

  async getCommits(
    repositoryId: string,
    from: string,
    to: string,
    branch?: string
  ): Promise<Commit[]> {
    const response = await this.axios.post<{ commits: Commit[] }>('/github/commits', {
      projectId: repositoryId,
      from,
      to,
      branch,
    });
    return response.data.commits;
  }

  // ===== Assets =====

  async getAssets(recapId: string): Promise<Asset[]> {
    const response = await this.axios.get<Asset[]>(`/v1/recaps/${recapId}/assets`);
    return response.data;
  }

  async generateAsset(
    recapId: string,
    type: Asset['type'],
    options?: Record<string, any>
  ): Promise<Asset> {
    const response = await this.axios.post<Asset>(`/v1/recaps/${recapId}/assets`, {
      type,
      options,
    });
    return response.data;
  }

  async pollAssetStatus(assetId: string, maxAttempts = 30, intervalMs = 3000): Promise<Asset> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const poll = setInterval(async () => {
        try {
          attempts++;
          const response = await this.axios.get<Asset>(`/v1/assets/${assetId}`);
          const asset = response.data;

          if (asset.status === 'COMPLETED') {
            clearInterval(poll);
            resolve(asset);
          } else if (asset.status === 'FAILED') {
            clearInterval(poll);
            reject(new Error('Asset generation failed'));
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            reject(new Error('Asset generation timed out'));
          }
        } catch (error) {
          clearInterval(poll);
          reject(error);
        }
      }, intervalMs);
    });
  }

  // ===== Schedules =====

  async getSchedules(repositoryId: string): Promise<Schedule[]> {
    const response = await this.axios.get<{ schedules: any[] }>('/schedules', {
      params: { repositoryId },
    });
    
    // Map backend response to Schedule interface
    return response.data.schedules.map(s => ({
      id: s.id,
      repositoryId: repositoryId, // Backend doesn't return this in the list view sometimes
      name: s.repo_full_name + ' - ' + s.cadence, // Fallback name
      cron: s.time_of_day + ' ' + s.day_of_week, // Fallback cron display
      enabled: s.status === 'active',
      lastRun: s.last_run_at,
      nextRun: s.next_run_at,
      config: {
        branch: 'main', // Default
      }
    }));
  }

  async createSchedule(repositoryId: string, schedule: Partial<Schedule>): Promise<Schedule> {
    // Parse cron to extract day and time (simplified)
    // Expected format: "0 9 * * 1" (Weekly Mon 9am)
    const parts = (schedule.cron || '').split(' ');
    const dayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = parts[4] ? dayMap[parseInt(parts[4])] : 'Monday';
    const time = `${parts[1] || '09'}:${parts[0] || '00'}`;

    const payload = {
      repo_id: repositoryId,
      frequency: 'weekly', // Default to weekly for now
      config: {
        day,
        time,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startDate: new Date().toISOString().split('T')[0],
      },
      destinations: [] // Default empty
    };

    const response = await this.axios.post('/schedules', payload);
    return response.data;
  }

  async updateSchedule(id: string, schedule: Partial<Schedule>): Promise<Schedule> {
    const updates: any = {};

    if (schedule.enabled !== undefined) {
      updates.status = schedule.enabled ? 'active' : 'paused';
    }

    if (schedule.cron) {
      const parts = schedule.cron.split(' ');
      const dayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = parts[4] ? dayMap[parseInt(parts[4])] : 'Monday';
      const time = `${parts[1] || '09'}:${parts[0] || '00'}`;
      
      updates.config = {
        day,
        time
      };
    }

    const response = await this.axios.patch(`/schedules/${id}`, updates);
    return response.data;
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.axios.delete(`/schedules/${id}`);
  }

  async triggerSchedule(scheduleId: string): Promise<void> {
    await this.axios.post(`/v1/schedules/${scheduleId}/trigger`);
  }

  // ===== Intelligence Platform =====

  /**
   * Get the full intelligence summary for a project
   * Includes momentum, velocity pulse, health trend, and flow score
   */
  async getIntelligenceSummary(projectId: string): Promise<IntelligenceSummary> {
    // Fetch momentum data from backend
    const response = await this.axios.get<any>(`/projects/${projectId}/momentum?history=true`);
    const data = response.data;
    
    // Transform backend response to match IntelligenceSummary interface
    const momentum = data.momentum || data;
    
    return {
      momentum: {
        score: momentum.score ?? 1.0,
        grade: momentum.grade ?? 'C',
        interpretation: momentum.interpretation ?? 'Keeping pace',
        velocity_growth: momentum.velocity_growth_percent ?? 0,
        complexity_growth: momentum.complexity_growth_percent ?? 0,
        period: momentum.period ?? {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        highlights: this.extractMomentumHighlights(momentum),
      },
      velocity_pulse: {
        contributors: [], // Would need separate API call
        period_days: 7,
        total_commits: momentum.current_period?.commits ?? 0,
        top_contributor: undefined,
      },
      health_trend: {
        delta: 0,
        interpretation: 'Stable',
        breakdown: {
          security_fixes: 0,
          security_new: 0,
          dead_code_removed: 0,
          quick_wins_resolved: 0,
        },
        sparkline: data.history?.map((h: any) => h.momentum_score * 100) ?? [],
      },
      flow_score: 75, // Default - would need process analysis
      overall_grade: momentum.grade ?? 'C',
      narration: momentum.interpretation,
    };
  }

  /**
   * Extract highlights from momentum data
   */
  private extractMomentumHighlights(momentum: any): Array<{
    type: 'positive' | 'warning' | 'neutral';
    icon: string;
    title: string;
    description: string;
  }> {
    const highlights = [];
    
    // Velocity highlight
    if (momentum.velocity_growth_percent > 20) {
      highlights.push({
        type: 'positive' as const,
        icon: '🚀',
        title: 'Velocity Surge',
        description: `Commit rate up ${Math.round(momentum.velocity_growth_percent)}% vs last period`,
      });
    } else if (momentum.velocity_growth_percent < -20) {
      highlights.push({
        type: 'warning' as const,
        icon: '📉',
        title: 'Velocity Drop',
        description: `Commit rate down ${Math.abs(Math.round(momentum.velocity_growth_percent))}% vs last period`,
      });
    }
    
    // Complexity highlight
    if (momentum.complexity_growth_percent < 0) {
      highlights.push({
        type: 'positive' as const,
        icon: '✨',
        title: 'Complexity Reduced',
        description: `Code got ${Math.abs(Math.round(momentum.complexity_growth_percent))}% simpler`,
      });
    } else if (momentum.complexity_growth_percent > 15) {
      highlights.push({
        type: 'warning' as const,
        icon: '⚠️',
        title: 'Complexity Growing',
        description: `Technical debt increasing at ${Math.round(momentum.complexity_growth_percent)}%`,
      });
    }
    
    // Momentum score highlight
    if (momentum.score >= 1.5) {
      highlights.push({
        type: 'positive' as const,
        icon: '🏆',
        title: 'Ahead of the Curve',
        description: 'Shipping faster than debt accumulates',
      });
    } else if (momentum.score < 0.7) {
      highlights.push({
        type: 'warning' as const,
        icon: '🐌',
        title: 'Falling Behind',
        description: 'Complexity growing faster than velocity',
      });
    }
    
    return highlights;
  }

  /**
   * Get forensics data for a project
   * Includes complexity hotspots, security summary, dead code metrics, and quick wins
   */
  async getForensics(projectId: string): Promise<ForensicsData> {
    const response = await this.axios.get<any>(`/projects/${projectId}/forensics`);
    const data = response.data;
    
    // Transform backend response to match ForensicsData interface
    return {
      complexity_hotspots: (data.code_vitals?.items ?? []).slice(0, 10).map((cv: any) => ({
        file: cv.file_path ?? cv.file ?? 'unknown',
        function_name: cv.function_name,
        complexity: cv.complexity_score ?? 0,
        loc: cv.lines_of_code ?? 0,
        language: cv.language ?? 'unknown',
        risk: cv.complexity_score > 30 ? 'CRITICAL' : cv.complexity_score > 20 ? 'HIGH' : cv.complexity_score > 10 ? 'MEDIUM' : 'LOW',
      })),
      security_summary: {
        total_vulnerabilities: data.security_alerts?.total ?? 0,
        critical: data.security_alerts?.by_severity?.critical ?? 0,
        high: data.security_alerts?.by_severity?.high ?? 0,
        medium: data.security_alerts?.by_severity?.medium ?? 0,
        low: data.security_alerts?.by_severity?.low ?? 0,
        grade: this.getSecurityGrade(data.security_alerts?.by_severity),
        last_scan: data.snapshot_date,
      },
      dead_code: {
        estimated_lines: (data.dead_code?.items ?? []).reduce((acc: number, dc: any) => acc + (dc.lines ?? 0), 0),
        unused_functions: data.dead_code?.by_type?.functions ?? 0,
        unused_imports: data.dead_code?.by_type?.imports ?? 0,
        unused_variables: data.dead_code?.by_type?.variables ?? 0,
      },
      quick_wins: (data.quick_wins?.items ?? []).slice(0, 10).map((qw: any) => ({
        type: qw.category ?? 'complexity',
        title: qw.title ?? qw.description ?? 'Quick win',
        description: qw.suggested_action ?? qw.description ?? '',
        file: qw.file_path,
        impact: (qw.priority === 'critical' || qw.priority === 'high') ? 'HIGH' : qw.priority === 'medium' ? 'MEDIUM' : 'LOW',
        effort: 'LOW',
      })),
      overall_health: this.getOverallHealth(data),
    };
  }

  private getSecurityGrade(severity: any): string {
    if (!severity) return 'A';
    if (severity.critical > 0) return 'F';
    if (severity.high > 2) return 'D';
    if (severity.high > 0) return 'C';
    if (severity.medium > 5) return 'B';
    return 'A';
  }

  private getOverallHealth(data: any): string {
    let score = 100;
    
    // Deduct for security issues
    score -= (data.security_alerts?.by_severity?.critical ?? 0) * 20;
    score -= (data.security_alerts?.by_severity?.high ?? 0) * 10;
    score -= (data.security_alerts?.by_severity?.medium ?? 0) * 3;
    
    // Deduct for high complexity
    score -= (data.code_vitals?.high_complexity_count ?? 0) * 5;
    
    // Deduct for dead code
    score -= Math.min((data.dead_code?.total ?? 0), 10) * 2;
    
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 25) return 'Poor';
    return 'Critical';
  }

  /**
   * Get the skills graph for a project
   * Includes contributor profiles, language distribution, and bus factor
   */
  async getSkillsGraph(projectId: string): Promise<SkillsGraph> {
    const response = await this.axios.get<any>(`/projects/${projectId}/skills`);
    const data = response.data;
    
    // Transform backend response to match SkillsGraph interface
    return {
      contributors: (data.contributors ?? []).map((c: any) => ({
        username: c.username ?? 'unknown',
        email: c.email,
        avatarUrl: c.avatar_url,
        commits: c.commits_count ?? 0,
        leverage_index: c.leverage_index ?? 0,
        velocity_trend: c.velocity_trend ?? 0,
        primary_language: c.primary_language ?? 'Unknown',
        languages: c.skills_graph?.languages ?? {},
        frameworks: Object.keys(c.skills_graph?.frameworks ?? {}),
        modules: Object.keys(c.skills_graph?.modules ?? {}),
        bus_factor_contribution: c.leverage_index ?? 0,
        first_seen: c.first_seen_at,
        last_active: c.last_active_at,
      })),
      team_size: data.team_size ?? 0,
      bus_factor: data.bus_factor ?? 0,
      language_distribution: data.language_distribution ?? {},
      framework_distribution: {},
      module_ownership: {},
    };
  }

  /**
   * Refresh intelligence data by triggering a new analysis
   */
  async refreshIntelligence(projectId: string): Promise<void> {
    // Trigger deep-dive analysis
    await this.axios.post(`/projects/${projectId}/analyze-range`, {
      deep_dive: true,
    });
  }

  // ===== Utility =====

  getWebUrl(path: string): string {
    const baseUrl = this.baseUrl.replace('/api', '');
    return `${baseUrl}${path}`;
  }
}

export const apiClient = new KetchupApiClient();
