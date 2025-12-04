import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { createGitService } from '../git/GitService';
import { Recap } from '../types';

/**
 * TreeView provider for Recaps sidebar
 */
export class RecapsTreeProvider implements vscode.TreeDataProvider<RecapTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<RecapTreeItem | undefined | null | void> =
    new vscode.EventEmitter<RecapTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RecapTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RecapTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RecapTreeItem): Promise<RecapTreeItem[]> {
    if (!element) {
      // Root level - check authentication and repo connection
      try {
        const isAuth = await apiClient.isAuthenticated();

        if (!isAuth) {
          return [
            new RecapTreeItem(
              '🔌 Connect to Ketchup',
              'Click to authenticate',
              vscode.TreeItemCollapsibleState.None,
              'info',
              {
                command: 'ketchup.connect',
                title: 'Connect to Ketchup',
              }
            ),
          ];
        }

        const gitService = createGitService();
        if (!gitService) {
          return [
            new RecapTreeItem(
              'No workspace open',
              'Open a Git repository to get started',
              vscode.TreeItemCollapsibleState.None,
              'info'
            ),
          ];
        }

        const isGitRepo = await gitService.isGitRepository();
        if (!isGitRepo) {
          return [
            new RecapTreeItem(
              'Not a Git repository',
              'This workspace is not a Git repository',
              vscode.TreeItemCollapsibleState.None,
              'info'
            ),
          ];
        }

        const remoteUrl = await gitService.getRemoteUrl();
        if (!remoteUrl) {
          return [
            new RecapTreeItem(
              'No remote configured',
              'Add a GitHub remote to continue',
              vscode.TreeItemCollapsibleState.None,
              'info'
            ),
          ];
        }

        const repo = await apiClient.lookupRepository(remoteUrl);
        if (!repo) {
          const repoInfo = await gitService.getGitHubRepoInfo();
          const repoName = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'this repository';
          
          return [
            new RecapTreeItem(
              `⚠️ ${repoName} not connected`,
              'Click to connect to Ketchup',
              vscode.TreeItemCollapsibleState.None,
              'warning',
              {
                command: 'ketchup.connect',
                title: 'Connect Repository',
              }
            ),
          ];
        }

        // Fetch recaps
        const recaps = await apiClient.getRecaps(repo.id);

        if (recaps.length === 0) {
          return [
            new RecapTreeItem(
              '📝 No recaps yet',
              'Create your first recap',
              vscode.TreeItemCollapsibleState.None,
              'info',
              {
                command: 'ketchup.draftRecap',
                title: 'Draft Recap',
              }
            ),
          ];
        }

        return recaps.map((recap) => new RecapTreeItem(
          recap.title,
          this.formatDate(recap.createdAt),
          vscode.TreeItemCollapsibleState.None,
          'recap',
          {
            command: 'ketchup.viewRecap',
            title: 'View Recap',
            arguments: [recap],
          },
          recap
        ));
      } catch (error) {
        console.error('[Recaps Tree] Error:', error);
        return [
          new RecapTreeItem(
            '❌ Error loading recaps',
            error instanceof Error ? error.message : JSON.stringify(error),
            vscode.TreeItemCollapsibleState.None,
            'error',
            {
              command: 'ketchup.refreshRecaps',
              title: 'Retry',
            }
          ),
        ];
      }
    }

    return [];
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  }
}

class RecapTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'recap' | 'info' | 'warning' | 'error' = 'info',
    public readonly command?: vscode.Command,
    public readonly recap?: Recap
  ) {
    super(label, collapsibleState);

    this.description = description;
    this.tooltip = this.createTooltip();
    this.contextValue = type;

    // Set icons based on type
    switch (type) {
      case 'recap':
        this.iconPath = new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('charts.red'));
        break;
      case 'info':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
      case 'warning':
        this.iconPath = new vscode.ThemeIcon('warning');
        break;
      case 'error':
        this.iconPath = new vscode.ThemeIcon('error');
        break;
    }

    if (command) {
      this.command = command;
    }
  }

  private createTooltip(): vscode.MarkdownString | string {
    if (this.recap) {
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**${this.recap.title}**\n\n`);
      tooltip.appendMarkdown(`${this.recap.summary}\n\n`);
      tooltip.appendMarkdown(`---\n\n`);
      tooltip.appendMarkdown(`- **Commits:** ${this.recap.commits.length}\n`);
      tooltip.appendMarkdown(`- **Story Points:** ${this.recap.storyPoints.length}\n`);
      tooltip.appendMarkdown(`- **Status:** ${this.recap.status}\n`);
      return tooltip;
    }

    return this.description || this.label;
  }
}
