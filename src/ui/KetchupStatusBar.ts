import * as vscode from "vscode";
import { apiClient } from "../api/KetchupApiClient";
import { createGitService } from "../git/GitService";

/**
 * Manages the Ketchup status bar item
 * Shows connection status, repository info, and sync status
 */
export class KetchupStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(private context: vscode.ExtensionContext) {
    // Create status bar item (priority 100 = left side)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    this.statusBarItem.command = "ketchup.showStatus";
    context.subscriptions.push(this.statusBarItem);

    // Show immediately
    this.statusBarItem.show();

    // Update status
    this.updateStatus();

    // Auto-refresh every 30 seconds
    this.syncInterval = setInterval(() => this.updateStatus(), 30000);
  }

  async updateStatus() {
    try {
      const isAuth = await apiClient.isAuthenticated();

      if (!isAuth) {
        this.statusBarItem.text = "$(plug) Ketchup: Not Authenticated";
        this.statusBarItem.tooltip = "Click to connect to Ketchup";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
        this.statusBarItem.command = "ketchup.connect";
        return;
      }

      const gitService = createGitService();
      if (!gitService) {
        this.statusBarItem.text = "$(ketchup-logo) Ketchup";
        this.statusBarItem.tooltip = "No workspace open";
        this.statusBarItem.backgroundColor = undefined;
        return;
      }

      const isGitRepo = await gitService.isGitRepository();
      if (!isGitRepo) {
        this.statusBarItem.text = "$(ketchup-logo) Ketchup";
        this.statusBarItem.tooltip = "Not a Git repository";
        this.statusBarItem.backgroundColor = undefined;
        return;
      }

      const remoteUrl = await gitService.getRemoteUrl();
      if (!remoteUrl) {
        this.statusBarItem.text = "$(ketchup-logo) Ketchup";
        this.statusBarItem.tooltip = "No remote configured";
        this.statusBarItem.backgroundColor = undefined;
        return;
      }

      const repo = await apiClient.lookupRepository(remoteUrl);
      if (!repo) {
        this.statusBarItem.text = "$(warning) Ketchup: Not Connected";
        this.statusBarItem.tooltip = new vscode.MarkdownString();
        this.statusBarItem.tooltip.appendMarkdown(
          "**✅ Account Connected**\n\n"
        );
        this.statusBarItem.tooltip.appendMarkdown(
          "Repository not connected to Ketchup\n\n"
        );
        this.statusBarItem.tooltip.appendMarkdown("Click to connect");
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
        this.statusBarItem.command = "ketchup.connect";
        return;
      }

      // Connected! Show repo info
      const repoInfo = await gitService.getGitHubRepoInfo();
      const repoName = repoInfo ? repoInfo.repo : repo.name;

      this.statusBarItem.text = `$(check) Ketchup: ${repoName}`;
      this.statusBarItem.tooltip = new vscode.MarkdownString();
      this.statusBarItem.tooltip.appendMarkdown(
        `**✅ Connected to Ketchup**\n\n`
      );
      this.statusBarItem.tooltip.appendMarkdown(
        `**Repository:** ${repo.fullName}\n\n`
      );
      this.statusBarItem.tooltip.appendMarkdown(
        `**Branch:** ${repo.defaultBranch}\n\n`
      );
      this.statusBarItem.tooltip.appendMarkdown(`---\n\n`);
      this.statusBarItem.tooltip.appendMarkdown(`Click to view status`);
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.command = "ketchup.showStatus";
    } catch (error) {
      console.error("[Status Bar] Error updating status:", error);
      this.statusBarItem.text = "$(error) Ketchup";
      this.statusBarItem.tooltip = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
    }
  }

  dispose() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.statusBarItem.dispose();
  }
}
