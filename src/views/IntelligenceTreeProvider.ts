import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { createGitService } from '../git/GitService';

/**
 * Intelligence Tree Provider
 * Shows intelligence actions in the sidebar (Momentum, Forensics, Skills)
 */
export class IntelligenceTreeProvider implements vscode.TreeDataProvider<IntelligenceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<IntelligenceItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private isConnected: boolean = false;
  private repositoryId: string | null = null;
  private repositoryName: string | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.checkConnection();
  }

  refresh(): void {
    this.checkConnection();
    this._onDidChangeTreeData.fire();
  }

  private async checkConnection(): Promise<void> {
    try {
      const isAuth = await apiClient.isAuthenticated();
      if (!isAuth) {
        this.isConnected = false;
        this.repositoryId = null;
        return;
      }

      const gitService = createGitService();
      if (!gitService) {
        this.isConnected = false;
        return;
      }

      const remoteUrl = await gitService.getRemoteUrl();
      if (!remoteUrl) {
        this.isConnected = false;
        return;
      }

      const repo = await apiClient.lookupRepository(remoteUrl);
      if (repo) {
        this.isConnected = true;
        this.repositoryId = repo.id;
        this.repositoryName = repo.name;
      } else {
        this.isConnected = false;
      }
    } catch (error) {
      this.isConnected = false;
    }
  }

  getTreeItem(element: IntelligenceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: IntelligenceItem): Promise<IntelligenceItem[]> {
    if (element) {
      return []; // No nested items
    }

    if (!this.isConnected) {
      return [
        new IntelligenceItem(
          'Connect to view intelligence',
          'info',
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'ketchup.connect',
            title: 'Connect',
          }
        ),
      ];
    }

    // Main intelligence actions
    return [
      new IntelligenceItem(
        '⚡ Momentum Dashboard',
        'momentum',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ketchup.viewMomentum',
          title: 'View Momentum',
        },
        'Team velocity vs complexity'
      ),
      new IntelligenceItem(
        '🔍 Code Forensics',
        'forensics',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ketchup.viewForensics',
          title: 'View Forensics',
        },
        'Complexity, security, dead code'
      ),
      new IntelligenceItem(
        '👥 Skills Graph',
        'skills',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ketchup.viewSkills',
          title: 'View Skills',
        },
        'Contributor expertise & bus factor'
      ),
    ];
  }
}

export class IntelligenceItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly itemType: 'momentum' | 'forensics' | 'skills' | 'info',
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly description?: string
  ) {
    super(label, collapsibleState);

    this.tooltip = description || label;
    this.contextValue = itemType;

    // Set icons based on type
    switch (itemType) {
      case 'momentum':
        this.iconPath = new vscode.ThemeIcon('pulse');
        break;
      case 'forensics':
        this.iconPath = new vscode.ThemeIcon('search');
        break;
      case 'skills':
        this.iconPath = new vscode.ThemeIcon('organization');
        break;
      case 'info':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
    }
  }
}
