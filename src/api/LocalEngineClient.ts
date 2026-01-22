import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { ChildProcess, spawn } from 'child_process';
import { createHash } from 'crypto';

/**
 * Configuration for the local engine
 */
interface LocalEngineConfig {
  version: string;
  binaryPath: string;
  endpoint: string;
  model: string;
}

/**
 * Model recommendation from the local engine
 */
interface ModelRecommendation {
  model_id: string;
  display_name: string;
  min_ram_gb: number;
  quality_tier: 'basic' | 'standard' | 'premium';
  description: string;
  pull_command: string;
}

/**
 * Health check result
 */
interface HealthCheckResult {
  healthy: boolean;
  endpoint: string;
  models?: string[];
  model_count?: number;
  error?: string;
}

/**
 * Local recap result
 */
interface LocalRecapResult {
  title: string;
  summary: string;
  story_points: Array<{
    type: string;
    title: string;
    description: string;
    commits: string[];
    risk: 'low' | 'medium' | 'high';
  }>;
  generated_locally: boolean;
  model_used: string;
  quality_disclaimer: string;
}

/**
 * CDN manifest for binary downloads
 */
interface CDNManifest {
  version: string;
  binaries: {
    [platform: string]: {
      url?: string;
      sha256: string;
    };
  };
  minimumExtensionVersion?: string;
}

/**
 * Get platform identifier for binary downloads
 */
function getPlatformId(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  } else if (platform === 'win32') {
    return 'win-x64';
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Get binary filename for platform
 */
function getBinaryName(): string {
  const platformId = getPlatformId();
  const isWindows = os.platform() === 'win32';
  return `ketchup-engine-${platformId}${isWindows ? '.exe' : ''}`;
}

/**
 * LocalEngineClient manages the local ketchup-engine binary lifecycle.
 * 
 * Responsibilities:
 * - Download binary from CDN if not present
 * - Verify binary integrity via SHA256
 * - Spawn and manage the engine process
 * - Communicate via JSON-RPC over HTTP
 */
export class LocalEngineClient {
  private static instance: LocalEngineClient;
  
  private context: vscode.ExtensionContext;
  private process: ChildProcess | null = null;
  private binaryPath: string | null = null;
  private serverPort: number = 9876;
  private isRunning: boolean = false;

  // CDN configuration
  private readonly CDN_BASE_URL = 'https://cdn.gitketchup.com/engine';
  private readonly MANIFEST_URL = 'https://cdn.gitketchup.com/engine/latest.json';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static getInstance(context: vscode.ExtensionContext): LocalEngineClient {
    if (!LocalEngineClient.instance) {
      LocalEngineClient.instance = new LocalEngineClient(context);
    }
    return LocalEngineClient.instance;
  }

  /**
   * Get the path where binaries are stored
   */
  private getBinaryDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'bin');
  }

  /**
   * Get the full path to the binary
   */
  private getBinaryPath(): string {
    return path.join(this.getBinaryDir(), getBinaryName());
  }

  /**
   * Check if the binary is already installed
   */
  async isBinaryInstalled(): Promise<boolean> {
    const binaryPath = this.getBinaryPath();
    try {
      await fs.promises.access(binaryPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the installed binary version (if any)
   */
  async getInstalledVersion(): Promise<string | null> {
    const versionFile = path.join(this.getBinaryDir(), 'version.txt');
    try {
      const version = await fs.promises.readFile(versionFile, 'utf-8');
      return version.trim();
    } catch {
      return null;
    }
  }

  /**
   * Fetch the latest manifest from CDN
   */
  private async fetchManifest(): Promise<CDNManifest> {
    return new Promise((resolve, reject) => {
      https.get(this.MANIFEST_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse manifest: ${e}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Download a file from URL to local path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      
      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            return this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {}); // Clean up partial download
        reject(err);
      });
    });
  }

  /**
   * Calculate SHA256 hash of a file
   */
  private async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Ensure the binary is installed and up-to-date
   */
  async ensureBinaryInstalled(
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    progress?.report({ message: 'Checking for updates...' });

    const platformId = getPlatformId();
    const binaryPath = this.getBinaryPath();
    const installedVersion = await this.getInstalledVersion();

    // Fetch manifest
    let manifest: CDNManifest;
    try {
      manifest = await this.fetchManifest();
    } catch (e) {
      // If we can't reach CDN but have a local binary, use it
      if (await this.isBinaryInstalled()) {
        console.log('[LocalEngine] CDN unreachable, using existing binary');
        this.binaryPath = binaryPath;
        return;
      }
      throw new Error(`Failed to fetch engine manifest: ${e}`);
    }

    // Check if update needed
    if (installedVersion === manifest.version && await this.isBinaryInstalled()) {
      console.log(`[LocalEngine] Binary up-to-date: v${installedVersion}`);
      this.binaryPath = binaryPath;
      return;
    }

    // Get binary info for this platform
    const binaryInfo = manifest.binaries[platformId];
    if (!binaryInfo) {
      throw new Error(`No binary available for platform: ${platformId}`);
    }

    // Download URL
    const downloadUrl = binaryInfo.url || 
      `${this.CDN_BASE_URL}/v${manifest.version}/${getBinaryName()}`;

    progress?.report({ message: `Downloading v${manifest.version}...`, increment: 10 });

    // Download
    console.log(`[LocalEngine] Downloading from: ${downloadUrl}`);
    await this.downloadFile(downloadUrl, binaryPath);

    progress?.report({ message: 'Verifying integrity...', increment: 70 });

    // Verify checksum
    const actualSha256 = await this.calculateSha256(binaryPath);
    if (actualSha256 !== binaryInfo.sha256) {
      await fs.promises.unlink(binaryPath);
      throw new Error(
        `Checksum mismatch! Expected ${binaryInfo.sha256}, got ${actualSha256}`
      );
    }

    // Make executable (Unix)
    if (os.platform() !== 'win32') {
      await fs.promises.chmod(binaryPath, 0o755);
    }

    // Save version
    const versionFile = path.join(this.getBinaryDir(), 'version.txt');
    await fs.promises.writeFile(versionFile, manifest.version);

    progress?.report({ message: 'Ready!', increment: 20 });

    console.log(`[LocalEngine] Installed v${manifest.version}`);
    this.binaryPath = binaryPath;
  }

  /**
   * Start the local engine server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[LocalEngine] Already running');
      return;
    }

    if (!this.binaryPath || !await this.isBinaryInstalled()) {
      await this.ensureBinaryInstalled();
    }

    return new Promise((resolve, reject) => {
      console.log(`[LocalEngine] Starting server on port ${this.serverPort}`);

      this.process = spawn(this.binaryPath!, ['serve', '--port', String(this.serverPort)], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data) => {
        console.log(`[LocalEngine] ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[LocalEngine] ${data.toString().trim()}`);
      });

      this.process.on('error', (err) => {
        console.error('[LocalEngine] Process error:', err);
        this.isRunning = false;
        reject(err);
      });

      this.process.on('exit', (code) => {
        console.log(`[LocalEngine] Process exited with code ${code}`);
        this.isRunning = false;
      });

      // Wait for server to be ready
      const checkReady = async (attempts: number = 0): Promise<void> => {
        if (attempts > 30) {
          reject(new Error('Engine failed to start within 30 seconds'));
          return;
        }

        try {
          const health = await this.checkHealth();
          if (health.healthy || health.model_count !== undefined) {
            this.isRunning = true;
            resolve();
            return;
          }
        } catch {
          // Not ready yet
        }

        setTimeout(() => checkReady(attempts + 1), 1000);
      };

      setTimeout(() => checkReady(), 500);
    });
  }

  /**
   * Stop the local engine server
   */
  stop(): void {
    if (this.process) {
      console.log('[LocalEngine] Stopping server');
      this.process.kill();
      this.process = null;
      this.isRunning = false;
    }
  }

  /**
   * Check health of the local engine and LLM
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.callMethod<HealthCheckResult>('health', {});
  }

  /**
   * Analyze repository complexity
   */
  async analyzeComplexity(repoPath: string): Promise<any> {
    return this.callMethod('analyze_complexity', { repo_path: repoPath });
  }

  /**
   * Run security scan
   */
  async checkSecurity(repoPath: string): Promise<any> {
    return this.callMethod('check_security', { repo_path: repoPath });
  }

  /**
   * Get momentum metrics
   */
  async getMomentum(commits: any[]): Promise<any> {
    return this.callMethod('get_momentum', { commits });
  }

  /**
   * Get contributor skills graph
   */
  async getContributorSkills(commits: any[]): Promise<any> {
    return this.callMethod('get_contributor_skills', { commits });
  }

  /**
   * Generate a recap using local LLM
   */
  async generateRecap(
    repoPath: string,
    days: number = 7,
    model?: string,
    endpoint?: string
  ): Promise<LocalRecapResult> {
    return this.callMethod<LocalRecapResult>('generate_recap', {
      repo_path: repoPath,
      days,
      model,
      endpoint,
    });
  }

  /**
   * Get model recommendations based on system RAM
   */
  async getModelRecommendations(ramGb?: number): Promise<ModelRecommendation[]> {
    const ram = ramGb || Math.round(os.totalmem() / (1024 * 1024 * 1024));
    return this.callMethod<ModelRecommendation[]>('get_model_recommendations', { ram_gb: ram });
  }

  /**
   * Call a method on the local engine via JSON-RPC
   */
  private async callMethod<T>(method: string, params: Record<string, any>): Promise<T> {
    const url = `http://localhost:${this.serverPort}`;
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ method, params });

      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.result as T);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Check if Ollama is available
   */
  async isOllamaAvailable(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const req = http.request('http://localhost:11434/api/tags', {
          method: 'GET',
          timeout: 2000,
        }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {
      return false;
    }
  }

  /**
   * Check if LM Studio is available
   */
  async isLMStudioAvailable(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const req = http.request('http://localhost:1234/v1/models', {
          method: 'GET',
          timeout: 2000,
        }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {
      return false;
    }
  }

  /**
   * Get available system RAM in GB
   */
  getSystemRamGb(): number {
    return Math.round(os.totalmem() / (1024 * 1024 * 1024));
  }
}
