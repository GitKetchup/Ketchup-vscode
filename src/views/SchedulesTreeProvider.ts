import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { createGitService } from '../git/GitService';
import { Schedule } from '../types';

/**
 * TreeView provider for Schedules sidebar
 */
export class SchedulesTreeProvider implements vscode.TreeDataProvider<ScheduleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ScheduleTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ScheduleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ScheduleTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ScheduleTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ScheduleTreeItem): Promise<ScheduleTreeItem[]> {
    if (!element) {
      const isAuth = await apiClient.isAuthenticated();

      if (!isAuth) {
        return [
          new ScheduleTreeItem(
            'Not connected',
            '',
            vscode.TreeItemCollapsibleState.None,
            'info'
          ),
        ];
      }

      const gitService = createGitService();
      if (!gitService || !(await gitService.isGitRepository())) {
        return [
          new ScheduleTreeItem(
            'No repository',
            '',
            vscode.TreeItemCollapsibleState.None,
            'info'
          ),
        ];
      }

      const remoteUrl = await gitService.getRemoteUrl();
      if (!remoteUrl) {
        return [];
      }

      const repo = await apiClient.lookupRepository(remoteUrl);
      if (!repo) {
        return [];
      }

      try {
        const schedules = await apiClient.getSchedules(repo.id);

        if (schedules.length === 0) {
          return [
            new ScheduleTreeItem(
              'No schedules',
              'Create schedules in Ketchup web app',
              vscode.TreeItemCollapsibleState.None,
              'info'
            ),
          ];
        }

        return schedules.map(
          (schedule) =>
            new ScheduleTreeItem(
              schedule.name,
              schedule.enabled ? 'Enabled' : 'Disabled',
              vscode.TreeItemCollapsibleState.None,
              'schedule',
              {
                command: 'ketchup.editSchedule',
                title: 'Edit Schedule',
                arguments: [schedule],
              },
              schedule
            )
        );
      } catch (error) {
        return [
          new ScheduleTreeItem(
            'Error loading schedules',
            error instanceof Error ? error.message : JSON.stringify(error),
            vscode.TreeItemCollapsibleState.None,
            'error'
          ),
        ];
      }
    }

    return [];
  }
}

class ScheduleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'schedule' | 'info' | 'error' = 'info',
    public readonly command?: vscode.Command,
    public readonly schedule?: Schedule
  ) {
    super(label, collapsibleState);

    this.description = description;
    this.tooltip = this.createTooltip();
    this.contextValue = type;

    switch (type) {
      case 'schedule':
        this.iconPath = schedule?.enabled
          ? new vscode.ThemeIcon('watch', new vscode.ThemeColor('charts.green'))
          : new vscode.ThemeIcon('watch', new vscode.ThemeColor('charts.gray'));
        break;
      case 'info':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
      case 'error':
        this.iconPath = new vscode.ThemeIcon('error');
        break;
    }
  }

  private createTooltip(): vscode.MarkdownString | string {
    if (this.schedule) {
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**${this.schedule.name}**\n\n`);
      tooltip.appendMarkdown(`- **Cron:** \`${this.schedule.cron}\`\n`);
      tooltip.appendMarkdown(`- **Enabled:** ${this.schedule.enabled ? 'Yes' : 'No'}\n`);
      if (this.schedule.nextRun) {
        tooltip.appendMarkdown(`- **Next Run:** ${new Date(this.schedule.nextRun).toLocaleString()}\n`);
      }
      return tooltip;
    }

    return this.description || this.label;
  }
}
