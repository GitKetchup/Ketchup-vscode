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
      const recap = await apiClient.getRecap(this.recapId);
      const [assets, repo] = await Promise.all([
        apiClient.getAssets(this.recapId),
        apiClient.getRepository(recap.repositoryId),
      ]);

      this.panel.title = recap.title;

      // If commits are missing from the recap object (e.g. not stored in metadata), fetch them
      if (!recap.commits || recap.commits.length === 0) {
        try {
          // Use a default lookback if timeRange is missing (though it should be there)
          const to = recap.timeRange?.to || new Date().toISOString();
          const from = recap.timeRange?.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          
          const commits = await apiClient.getCommits(recap.repositoryId, from, to);
          recap.commits = commits;
        } catch (err) {
          console.error('Failed to fetch commits for recap:', err);
          // Continue rendering without commits if fetch fails
        }
      }

      this.panel.webview.html = this.getHtmlContent(recap, assets, repo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      vscode.window.showErrorMessage(`Failed to load recap: ${errorMessage}`);
      // this.panel.dispose(); // Don't dispose, let user retry or see error
    }
  }

  private async handleGenerateAsset(payload: { type: Asset['type']; options?: any }): Promise<void> {
    try {
      const asset = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating ${payload.type.toLowerCase().replace('_', ' ')}...`,
          cancellable: false,
        },
        async () => {
          const newAsset = await apiClient.generateAsset(this.recapId, payload.type, payload.options);
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
    try {
      const recap = await apiClient.getRecap(this.recapId);
      const repo = await apiClient.getRepository(recap.repositoryId);
      // Construct URL: /repositories/:owner/:repo?recapId=:recapId
      // repo.fullName is usually "owner/repo"
      const url = apiClient.getWebUrl(`/repositories/${repo.fullName}?recapId=${recap.id}`);
      vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
      vscode.window.showErrorMessage('Failed to open in browser');
    }
  }

  private getHtmlContent(recap: Recap, assets: Asset[], repo: any): string {
    const riskColors = {
      Low: '#10B981',
      Medium: '#F59E0B',
      High: '#EF4444',
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
      INFRA: '🏗️',
    };
    
    // Handle new summary structure
    const summaryText = (typeof recap.summary === 'string' ? recap.summary : recap.summary?.summary) || '';
    const bulletins = typeof recap.summary === 'object' && recap.summary?.bulletins ? recap.summary.bulletins : [];
    // Fallback to old storyPoints if bulletins is empty (for backward compatibility if needed)
    // const displayPoints = bulletins.length > 0 ? bulletins : (recap as any).storyPoints || [];
    const displayPoints = bulletins;

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
      <p class="summary">${this.escapeHtml(summaryText)}</p>
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
          ${displayPoints.length} story points
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
          ${displayPoints.map((point: any, index: number) => `
            <div class="story-card">
              <div class="story-header">
                <span class="story-number">${index + 1}</span>
                <div class="story-badges">
                  <span class="badge badge-type">${typeIcons[point.type as keyof typeof typeIcons] || ''} ${point.type}</span>
                  <span class="badge badge-risk" style="--risk-color: ${riskColors[point.risk_level as keyof typeof riskColors] || riskColors.LOW}">${point.risk_level} Risk</span>
                </div>
              </div>
              <h3 class="story-title">${this.escapeHtml(point.content)}</h3>
              <!-- <p class="story-description">${this.escapeHtml(point.description || '')}</p> -->
              <div class="story-commits">
                <span class="story-commits-label">${point.linked_commit_ids?.length || 0} commit${(point.linked_commit_ids?.length || 0) !== 1 ? 's' : ''}</span>
                ${point.linked_commit_ids && point.linked_commit_ids.length > 0 ? `
                  <div class="linked-commits-list">
                    ${point.linked_commit_ids.map((sha: string) => `
                      <span class="commit-tag" title="${sha}">
                        <span class="icon-small">GitCommit</span>
                        ${sha.substring(0, 7)}
                      </span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </main>

      <!-- Right: Assets -->
      <aside class="assets-panel">
        <div class="assets-section">
          <h3 class="sidebar-title">Create New</h3>
          <div class="asset-grid">
            <button class="create-card" onclick="generateAsset('AUDIO')">
              <div class="create-icon audio">🎵</div>
              <span class="create-label">Audio Recaps</span>
            </button>
            <button class="create-card" onclick="generateAsset('VIDEO')">
              <div class="create-icon video">🎬</div>
              <span class="create-label">Video Recaps</span>
            </button>
            <button class="create-card" onclick="generateAsset('CHANGELOG')">
              <div class="create-icon changelog">📋</div>
              <span class="create-label">Changelog</span>
            </button>
            <button class="create-card" onclick="generateAsset('X_POST')">
              <div class="create-icon social">🐦</div>
              <span class="create-label">X Post</span>
            </button>
            <button class="create-card" onclick="generateAsset('LINKEDIN_POST')">
              <div class="create-icon social">💼</div>
              <span class="create-label">LinkedIn Post</span>
            </button>
          </div>
          
          <!-- Cinematic Card -->
          <button class="cinematic-card" onclick="generateAsset('VIDEO', { visualStyle: 'Cinematic', isCinematicFlow: true })">
            <div class="cinematic-content">
              <div class="cinematic-badge">
                <span class="icon">🎬</span>
                <span>Featured</span>
              </div>
              <h3 class="cinematic-title">Cinematic Recap</h3>
              <p class="cinematic-desc">Create a high-production video recap with dynamic visuals and music.</p>
            </div>
            <div class="cinematic-arrow">→</div>
          </button>
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

    function generateAsset(type, options) {
      vscode.postMessage({ type: 'generateAsset', payload: { type, options } });
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
        margin-bottom: 8px;
        display: block;
      }

      .linked-commits-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .commit-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        background: #0F0F12;
        border: 1px solid #5C5C66;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #A0A0A8;
        cursor: default;
      }

      .commit-tag:hover {
        border-color: #8B4049;
        color: #FAFAFA;
      }

      .icon-small {
        font-size: 10px;
        font-family: sans-serif; /* Reset font for icon if needed, or use SVG */
        display: none; /* Hide text icon for now, just use SHA */
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

      .asset-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }

      .create-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(92, 92, 102, 0.3);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        min-height: 80px;
        text-align: center;
      }

      .create-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: #8B4049;
        transform: translateY(-1px);
      }

      .create-icon {
        font-size: 20px;
        margin-bottom: 8px;
        padding: 6px;
        border-radius: 6px;
      }

      .create-icon.audio { background: rgba(244, 114, 182, 0.1); color: #F472B6; }
      .create-icon.video { background: rgba(251, 146, 60, 0.1); color: #FB923C; }
      .create-icon.changelog { background: rgba(96, 165, 250, 0.1); color: #60A5FA; }
      .create-icon.social { background: rgba(255, 255, 255, 0.1); color: #FFFFFF; }

      .create-label {
        font-size: 11px;
        font-weight: 500;
        color: #FAFAFA;
      }

      .cinematic-card {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        background: linear-gradient(135deg, rgba(255, 183, 0, 0.1), rgba(249, 115, 22, 0.05));
        border: 1px solid rgba(255, 183, 0, 0.3);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        margin-top: 8px;
      }

      .cinematic-card:hover {
        border-color: rgba(255, 183, 0, 0.6);
        box-shadow: 0 4px 12px rgba(255, 183, 0, 0.1);
      }

      .cinematic-content {
        flex: 1;
      }

      .cinematic-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(255, 183, 0, 0.2);
        border-radius: 4px;
        color: #FFB700;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .cinematic-title {
        font-size: 16px;
        font-weight: 700;
        color: #FAFAFA;
        margin-bottom: 4px;
      }

      .cinematic-desc {
        font-size: 11px;
        color: #A0A0A8;
        line-height: 1.4;
      }

      .cinematic-arrow {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-center;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        color: #FAFAFA;
        margin-left: 12px;
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
