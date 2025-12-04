import * as vscode from 'vscode';
import simpleGit, { SimpleGit, DefaultLogFields, LogResult } from 'simple-git';
import { Commit } from '../types';

/**
 * Git Service
 * Handles all git operations: reading repo info, commits, contributors, etc.
 */
export class GitService {
  private git: SimpleGit;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.git = simpleGit(workspaceRoot);
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the remote URL of the repository (typically 'origin')
   */
  async getRemoteUrl(remoteName = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === remoteName);
      console.log(`[Ketchup-GitService] Found remotes: ${JSON.stringify(remotes.map(r => r.name))}, looking for: ${remoteName}`);

      if (!origin) {
        return null;
      }

      // Normalize URL format
      let url = origin.refs.fetch || origin.refs.push;

      // Convert SSH to HTTPS format for consistency
      if (url.startsWith('git@github.com:')) {
        url = url.replace('git@github.com:', 'https://github.com/');
      }

      // Remove .git suffix if present
      if (url.endsWith('.git')) {
        url = url.slice(0, -4);
      }

      return url;
    } catch (error) {
      console.error('Failed to get remote URL:', error);
      return null;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.branchLocal();
      return branch.current;
    } catch (error) {
      console.error('Failed to get current branch:', error);
      return 'main';
    }
  }

  /**
   * Get repository name from remote URL or directory
   */
  async getRepositoryName(): Promise<string> {
    const remoteUrl = await this.getRemoteUrl();

    if (remoteUrl) {
      // Extract name from URL: https://github.com/owner/repo -> repo
      const match = remoteUrl.match(/\/([^\/]+?)(?:\.git)?$/);
      if (match) {
        return match[1];
      }
    }

    // Fallback to directory name
    const parts = this.workspaceRoot.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Get commits within a date range
   */
  async getCommits(
    from: Date,
    to: Date,
    branch?: string
  ): Promise<Commit[]> {
    try {
      const branchName = branch || await this.getCurrentBranch();

      const log: LogResult<DefaultLogFields> = await this.git.log({
        from: from.toISOString(),
        to: to.toISOString(),
        [branchName]: null,
      });

      return log.all.map((commit) => ({
        sha: commit.hash,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
          date: commit.date,
        },
        url: '', // Will be populated by API if needed
      }));
    } catch (error) {
      console.error('Failed to get commits:', error);
      return [];
    }
  }

  /**
   * Get commits with more detailed info using git log
   */
  async getDetailedCommits(
    from: Date,
    to: Date,
    branch?: string
  ): Promise<Commit[]> {
    try {
      const branchName = branch || await this.getCurrentBranch();
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];

      const log: LogResult<DefaultLogFields> = await this.git.log([
        branchName,
        `--since=${fromStr}`,
        `--until=${toStr}`,
        '--format=%H|%an|%ae|%aI|%s',
        '--numstat',
      ]);

      return log.all.map((commit: any) => {
        const parts = commit.message.split('|');
        return {
          sha: parts[0] || commit.hash,
          message: parts[4] || commit.message,
          author: {
            name: parts[1] || commit.author_name,
            email: parts[2] || commit.author_email,
            date: parts[3] || commit.date,
          },
          url: '',
          stats: commit.diff?.files
            ? {
                additions: commit.diff.insertions || 0,
                deletions: commit.diff.deletions || 0,
                total: (commit.diff.insertions || 0) + (commit.diff.deletions || 0),
              }
            : undefined,
        };
      });
    } catch (error) {
      console.error('Failed to get detailed commits:', error);
      // Fallback to simple commits
      return this.getCommits(from, to, branch);
    }
  }

  /**
   * Get unique contributors from commits
   */
  async getContributors(from: Date, to: Date, branch?: string): Promise<string[]> {
    const commits = await this.getCommits(from, to, branch);
    const contributors = new Set(commits.map((c) => c.author.name));
    return Array.from(contributors).sort();
  }

  /**
   * Get commit count in date range
   */
  async getCommitCount(from: Date, to: Date, branch?: string): Promise<number> {
    const commits = await this.getCommits(from, to, branch);
    return commits.length;
  }

  /**
   * Get repository metadata
   */
  async getRepositoryMetadata() {
    try {
      const remoteUrl = await this.getRemoteUrl();
      const branch = await this.getCurrentBranch();
      const name = await this.getRepositoryName();

      return {
        name,
        remoteUrl,
        branch,
        workspaceRoot: this.workspaceRoot,
      };
    } catch (error) {
      console.error('Failed to get repository metadata:', error);
      throw error;
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return !status.isClean();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get GitHub owner/repo from URL
   */
  async getGitHubRepoInfo(): Promise<{ owner: string; repo: string } | null> {
    const remoteUrl = await this.getRemoteUrl();
    if (!remoteUrl) {
      return null;
    }

    // Parse GitHub URL: https://github.com/owner/repo
    const match = remoteUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }

    return null;
  }
}

/**
 * Create GitService instance for current workspace
 */
export function createGitService(): GitService | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  return new GitService(workspaceFolders[0].uri.fsPath);
}
