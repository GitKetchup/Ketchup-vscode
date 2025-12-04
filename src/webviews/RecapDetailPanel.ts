import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { Recap, Asset } from '../types';

/**
 * Recap Detail Webview Panel
 * Shows the completed recap with story points and asset generation options
 */
export class RecapDetailPanel {
  public static currentPanels: Map<string, RecapDetailPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private recapId: string
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'init':
            await this.loadRecapData();
            break;
          case 'generateAsset':
            await this.handleGenerateAsset(message.payload);
            break;
          case 'openInBrowser':
            await this.handleOpenInBrowser();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static async render(context: vscode.ExtensionContext, recapId: string): Promise<void> {
    // Reuse existing panel if available
    const existing = RecapDetailPanel.currentPanels.get(recapId);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupRecapDetail',
      'Loading recap...',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const detailPanel = new RecapDetailPanel(panel, context, recapId);
    RecapDetailPanel.currentPanels.set(recapId, detailPanel);

    // Load initial data
    await detailPanel.loadRecapData();
  }

  private async loadRecapData(): Promise<void> {
    try {
      const [recap, assets] = await Promise.all([
        apiClient.getRecap(this.recapId),
        apiClient.getAssets(this.recapId),
      ]);

      this.panel.title = recap.title;
      this.panel.webview.html = this.getHtmlContent(recap, assets);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      vscode.window.showErrorMessage(`Failed to load recap: ${errorMessage}`);
      this.panel.dispose();
    }
  }

  private async handleGenerateAsset(payload: { type: Asset['type'] }): Promise<void> {
    try {
      const asset = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating ${payload.type.toLowerCase().replace('_', ' ')}...`,
          cancellable: false,
        },
        async () => {
          const newAsset = await apiClient.generateAsset(this.recapId, payload.type);
          return await apiClient.pollAssetStatus(newAsset.id);
        }
      );

      vscode.window.showInformationMessage(`${payload.type} generated successfully!`);

      // Reload recap data to show new asset
      await this.loadRecapData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      vscode.window.showErrorMessage(`Failed to generate asset: ${errorMessage}`);
    }
  }

  private async handleOpenInBrowser(): Promise<void> {
    const recap = await apiClient.getRecap(this.recapId);
    const url = apiClient.getWebUrl(`/repositories/${recap.repositoryId}/recaps/${recap.id}`);
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private getHtmlContent(recap: Recap, assets: Asset[]): string {
    const riskColors = {
      LOW: '#10B981',
      MEDIUM: '#F59E0B',
      HIGH: '#EF4444',
    };

    const typeIcons = {
      FEATURE: '✨',
      REFACTOR: '♻️',
      FIX: '🐛',
      DOCS: '📝',
      STYLE: '💄',
      TEST: '🧪',
      CHORE: '🔧',
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${recap.title}</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <h1 class="title">${recap.title}</h1>
        <button class="btn-icon" onclick="openInBrowser()">
          <span>↗</span>
        </button>
      </div>
      <p class="summary">${recap.summary}</p>
      <div class="meta">
        <span class="meta-item">
          <span class="icon">📅</span>
          ${new Date(recap.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span class="meta-item">
          <span class="icon">📝</span>
          ${recap.commits.length} commits
        </span>
        <span class="meta-item">
          <span class="icon">✨</span>
          ${recap.storyPoints.length} story points
        </span>
      </div>
    </header>

    <div class="content-grid">
      <!-- Left: Commits -->
      <aside class="sidebar">
        <div class="sidebar-section">
          <h3 class="sidebar-title">Commits</h3>
          <div class="commits-list">
            ${recap.commits.map((commit) => `
              <div class="commit-card">
                <div class="commit-message">${this.escapeHtml(commit.message)}</div>
                <div class="commit-meta">
                  <span class="commit-sha">${commit.sha.substring(0, 7)}</span>
                  <span>•</span>
                  <span>${commit.author.name}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </aside>

      <!-- Center: Story Points -->
      <main class="main-content">
        <h2 class="section-title">Story Points</h2>
        <div class="story-points">
          ${recap.storyPoints.map((point, index) => `
            <div class="story-card">
              <div class="story-header">
                <span class="story-number">${index + 1}</span>
                <div class="story-badges">
                  <span class="badge badge-type">${typeIcons[point.type] || ''} ${point.type}</span>
                  <span class="badge badge-risk" style="--risk-color: ${riskColors[point.risk]}">${point.risk} Risk</span>
                </div>
              </div>
              <h3 class="story-title">${this.escapeHtml(point.title)}</h3>
              <p class="story-description">${this.escapeHtml(point.description)}</p>
              <div class="story-commits">
                <span class="story-commits-label">${point.commitShas.length} commit${point.commitShas.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </main>

      <!-- Right: Assets -->
      <aside class="assets-panel">
        <div class="assets-section">
          <h3 class="sidebar-title">Create New</h3>
          <div class="asset-buttons">
            <button class="asset-btn" onclick="generateAsset('AUDIO')">
              <span class="icon">🎵</span>
              <span>Audio Recap</span>
            </button>
            <button class="asset-btn" onclick="generateAsset('VIDEO')">
              <span class="icon">🎬</span>
              <span>Video Recap</span>
            </button>
            <button class="asset-btn" onclick="generateAsset('CHANGELOG')">
              <span class="icon">📋</span>
              <span>Changelog</span>
            </button>
            <button class="asset-btn" onclick="generateAsset('X_POST')">
              <span class="icon">🐦</span>
              <span>X Post</span>
            </button>
            <button class="asset-btn" onclick="generateAsset('LINKEDIN_POST')">
              <span class="icon">💼</span>
              <span>LinkedIn Post</span>
            </button>
          </div>
        </div>

        ${assets.length > 0 ? `
          <div class="assets-section">
            <h3 class="sidebar-title">Generated Assets</h3>
            <div class="assets-list">
              ${assets.map((asset) => `
                <div class="asset-card">
                  <div class="asset-icon">${this.getAssetIcon(asset.type)}</div>
                  <div class="asset-info">
                    <div class="asset-name">${this.formatAssetType(asset.type)}</div>
                    <div class="asset-status ${asset.status.toLowerCase()}">${asset.status}</div>
                  </div>
                  ${asset.status === 'COMPLETED' && asset.url ? `
                    <button class="btn-icon-small" onclick="window.open('${asset.url}', '_blank')">
                      ↗
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </aside>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function generateAsset(type) {
      vscode.postMessage({ type: 'generateAsset', payload: { type } });
    }

    function openInBrowser() {
      vscode.postMessage({ type: 'openInBrowser' });
    }

    // Initialize
    vscode.postMessage({ type: 'init' });
  </script>
</body>
</html>`;
  }

  private getStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #08080A;
        color: #FAFAFA;
        overflow-x: hidden;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
      }

      .header {
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 1px solid #5C5C66;
      }

      .header-content {
        display: flex;
        justify-content: space-between;
        align-items: start;
        margin-bottom: 16px;
      }

      .title {
        font-size: 32px;
        font-weight: 700;
        color: #FAFAFA;
        line-height: 1.2;
      }

      .summary {
        font-size: 16px;
        color: #A0A0A8;
        line-height: 1.6;
        margin-bottom: 16px;
      }

      .meta {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #A0A0A8;
      }

      .icon {
        font-size: 16px;
      }

      .content-grid {
        display: grid;
        grid-template-columns: 280px 1fr 300px;
        gap: 24px;
      }

      @media (max-width: 1200px) {
        .content-grid {
          grid-template-columns: 1fr;
        }
      }

      /* Sidebar (Commits) */
      .sidebar {
        background: #0F0F12;
        border: 1px solid #5C5C66;
        border-radius: 12px;
        padding: 20px;
        max-height: calc(100vh - 200px);
        overflow-y: auto;
      }

      .sidebar-title {
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #A0A0A8;
        margin-bottom: 16px;
      }

      .commits-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .commit-card {
        padding: 12px;
        background: rgba(139, 64, 73, 0.05);
        border: 1px solid rgba(92, 92, 102, 0.3);
        border-radius: 8px;
      }

      .commit-message {
        font-size: 13px;
        color: #FAFAFA;
        margin-bottom: 6px;
        line-height: 1.4;
      }

      .commit-meta {
        font-size: 11px;
        color: #A0A0A8;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .commit-sha {
        font-family: 'Courier New', monospace;
        color: #5C5C66;
      }

      /* Main Content (Story Points) */
      .main-content {
        min-width: 0;
      }

      .section-title {
        font-size: 20px;
        font-weight: 700;
        color: #FAFAFA;
        margin-bottom: 20px;
      }

      .story-points {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .story-card {
        background: #0F0F12;
        border: 1px solid #5C5C66;
        border-radius: 12px;
        padding: 24px;
      }

      .story-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .story-number {
        display: inline-flex;
        align-items: center;
        justify-center;
        width: 28px;
        height: 28px;
        background: #8B4049;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        border-radius: 50%;
      }

      .story-badges {
        display: flex;
        gap: 8px;
      }

      .badge {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .badge-type {
        background: rgba(139, 64, 73, 0.15);
        color: #8B4049;
        border: 1px solid rgba(139, 64, 73, 0.3);
      }

      .badge-risk {
        background: rgba(var(--risk-color-rgb), 0.15);
        color: var(--risk-color);
        border: 1px solid var(--risk-color);
      }

      .story-title {
        font-size: 18px;
        font-weight: 600;
        color: #FAFAFA;
        margin-bottom: 12px;
        line-height: 1.3;
      }

      .story-description {
        font-size: 14px;
        color: #A0A0A8;
        line-height: 1.6;
        margin-bottom: 16px;
      }

      .story-commits-label {
        font-size: 12px;
        color: #5C5C66;
      }

      /* Assets Panel */
      .assets-panel {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .assets-section {
        background: #0F0F12;
        border: 1px solid #5C5C66;
        border-radius: 12px;
        padding: 20px;
      }

      .asset-buttons {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .asset-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: rgba(139, 64, 73, 0.1);
        border: 1px solid rgba(139, 64, 73, 0.3);
        border-radius: 8px;
        color: #FAFAFA;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .asset-btn:hover {
        background: rgba(139, 64, 73, 0.2);
        border-color: #8B4049;
      }

      .assets-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .asset-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: rgba(139, 64, 73, 0.05);
        border: 1px solid rgba(92, 92, 102, 0.3);
        border-radius: 8px;
      }

      .asset-icon {
        font-size: 20px;
      }

      .asset-info {
        flex: 1;
        min-width: 0;
      }

      .asset-name {
        font-size: 13px;
        font-weight: 500;
        color: #FAFAFA;
        margin-bottom: 2px;
      }

      .asset-status {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .asset-status.completed {
        color: #10B981;
      }

      .asset-status.processing {
        color: #F59E0B;
      }

      .asset-status.failed {
        color: #EF4444;
      }

      .btn-icon, .btn-icon-small {
        background: transparent;
        border: 1px solid #5C5C66;
        border-radius: 8px;
        color: #A0A0A8;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-icon {
        padding: 8px 12px;
        font-size: 16px;
      }

      .btn-icon-small {
        padding: 4px 8px;
        font-size: 14px;
      }

      .btn-icon:hover, .btn-icon-small:hover {
        border-color: #8B4049;
        color: #8B4049;
      }

      ::-webkit-scrollbar {
        width: 6px;
      }

      ::-webkit-scrollbar-track {
        background: #08080A;
      }

      ::-webkit-scrollbar-thumb {
        background: #8B4049;
        border-radius: 3px;
      }
    `;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private getAssetIcon(type: Asset['type']): string {
    const icons: { [key: string]: string } = {
      AUDIO: '🎵',
      VIDEO: '🎬',
      CHANGELOG: '📋',
      X_POST: '🐦',
      LINKEDIN_POST: '💼',
      VISUAL: '🖼️',
    };
    return icons[type] || '📄';
  }

  private formatAssetType(type: Asset['type']): string {
    return type.toLowerCase().replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  public dispose(): void {
    RecapDetailPanel.currentPanels.delete(this.recapId);
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
