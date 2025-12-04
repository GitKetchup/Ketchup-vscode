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
  AuthTokenResponse
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
    console.log('[API] Logging out due to session expiry or error');
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
      const fullUrl = `${this.baseUrl}/v1/repos/lookup`;
      console.log(`[Ketchup-API] Request: GET ${fullUrl}?url=${encodeURIComponent(remoteUrl)}`);
      
      const response = await this.axios.get<Repository>('/v1/repos/lookup', {
        params: { url: remoteUrl },
      });
      console.log('[API] Lookup successful:', response.status, response.data);
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
    const response = await this.axios.post<{ commits: Commit[] }>('/api/github/commits', {
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
    const response = await this.axios.get<Schedule[]>('/v1/schedules', {
      params: { repositoryId },
    });
    return response.data;
  }

  async triggerSchedule(scheduleId: string): Promise<void> {
    await this.axios.post(`/v1/schedules/${scheduleId}/trigger`);
  }

  // ===== Utility =====

  getWebUrl(path: string): string {
    const baseUrl = this.baseUrl.replace('/api', '');
    return `${baseUrl}${path}`;
  }
}

export const apiClient = new KetchupApiClient();
