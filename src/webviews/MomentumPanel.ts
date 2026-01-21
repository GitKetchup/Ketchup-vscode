import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { IntelligenceSummary, Repository } from '../types';

/**
 * Momentum Dashboard Webview Panel
 * Displays team momentum, velocity pulse, and health trends
 */
export class MomentumPanel {
  public static currentPanel: MomentumPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private intelligenceData: IntelligenceSummary | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private repository: Repository
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'init':
            await this.loadData();
            break;
          case 'refresh':
            await this.handleRefresh();
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

  public static async render(
    context: vscode.ExtensionContext,
    repository: Repository
  ): Promise<void> {
    // Reuse existing panel if available
    if (MomentumPanel.currentPanel) {
      MomentumPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupMomentum',
      `⚡ Momentum - ${repository.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    MomentumPanel.currentPanel = new MomentumPanel(panel, context, repository);
    await MomentumPanel.currentPanel.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      // Show loading state
      this.panel.webview.html = this.getLoadingHtml();

      this.intelligenceData = await apiClient.getIntelligenceSummary(this.repository.id);

      // Check for empty state
      if (this.intelligenceData.velocity_pulse.total_commits === 0 && this.intelligenceData.momentum.score === 1.0) {
        this.panel.webview.html = this.getEmptyStateHtml();
        return;
      }

      this.panel.webview.html = this.getHtmlContent(this.intelligenceData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.panel.webview.html = this.getErrorHtml(errorMessage);
    }
  }

  private async handleRefresh(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing intelligence data...',
          cancellable: false,
        },
        async () => {
          await apiClient.refreshIntelligence(this.repository.id);
          await this.loadData();
        }
      );
      vscode.window.showInformationMessage('Intelligence data refreshed!');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to refresh data');
    }
  }

  private async handleOpenInBrowser(): Promise<void> {
    const url = apiClient.getWebUrl(`/repositories/${this.repository.fullName}/momentum`);
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading...</title>
  <style>
    ${this.getBaseStyles()}
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      gap: 24px;
    }
    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(139, 64, 73, 0.2);
      border-top-color: #8B4049;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      color: #A0A0A8;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <div class="loading-text">Calculating momentum...</div>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    ${this.getBaseStyles()}
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      gap: 24px;
      text-align: center;
    }
    .error-icon {
      font-size: 48px;
    }
    .error-title {
      font-size: 20px;
      font-weight: 600;
      color: #FAFAFA;
    }
    .error-message {
      color: #A0A0A8;
      max-width: 400px;
    }
    .retry-btn {
      padding: 12px 24px;
      background: #8B4049;
      color: #FAFAFA;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    .retry-btn:hover {
      background: #A04D58;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <div class="error-title">Failed to load momentum data</div>
    <div class="error-message">${this.escapeHtml(message)}</div>
    <button class="retry-btn" onclick="retry()">Retry</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function retry() {
      vscode.postMessage({ type: 'init' });
    }
  </script>
</body>
</html>`;
  }

  private getEmptyStateHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Data</title>
  <style>
    ${this.getBaseStyles()}
    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      gap: 24px;
      text-align: center;
      padding: 24px;
    }
    .empty-icon {
      font-size: 64px;
      margin-bottom: 8px;
      opacity: 0.8;
    }
    .empty-title {
      font-size: 24px;
      font-weight: 700;
      color: #FAFAFA;
    }
    .empty-desc {
      color: #A0A0A8;
      font-size: 14px;
      max-width: 400px;
      line-height: 1.6;
    }
    .action-btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, #8B4049 0%, #D4A574 100%);
      color: #FAFAFA;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      margin-top: 16px;
      transition: opacity 0.2s;
    }
    .action-btn:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="empty-container">
    <div class="empty-icon">🌱</div>
    <h2 class="empty-title">Waiting for Momentum</h2>
    <p class="empty-desc">
      We haven't analyzed enough commit data yet to calculate momentum. 
      Push more code or trigger a deep-dive analysis to get started.
    </p>
    <button class="action-btn" onclick="refresh()">Run Deep Dive</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  private getHtmlContent(data: IntelligenceSummary): string {
    const { momentum, velocity_pulse, health_trend, flow_score, overall_grade } = data;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Momentum Dashboard</title>
  <style>
    ${this.getBaseStyles()}
    ${this.getDashboardStyles()}
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="header-left">
          <h1 class="title">⚡ Momentum Dashboard</h1>
          <span class="repo-name">${this.escapeHtml(this.repository.fullName)}</span>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" onclick="refresh()">
            <span>↻</span> Refresh
          </button>
          <button class="btn-icon" onclick="openInBrowser()">
            <span>↗</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Grid -->
    <div class="dashboard-grid">
      <!-- Hero: Momentum Gauge -->
      <section class="card hero-card">
        <div class="gauge-container">
          ${this.renderMomentumGauge(momentum.score, momentum.grade)}
        </div>
        <div class="momentum-details">
          <h2 class="momentum-interpretation">${this.escapeHtml(momentum.interpretation)}</h2>
          <div class="momentum-stats">
            <div class="stat">
              <span class="stat-label">Velocity Growth</span>
              <span class="stat-value ${momentum.velocity_growth >= 0 ? 'positive' : 'negative'}">
                ${momentum.velocity_growth >= 0 ? '+' : ''}${momentum.velocity_growth.toFixed(1)}%
              </span>
            </div>
            <div class="stat">
              <span class="stat-label">Complexity Growth</span>
              <span class="stat-value ${momentum.complexity_growth <= 0 ? 'positive' : 'negative'}">
                ${momentum.complexity_growth >= 0 ? '+' : ''}${momentum.complexity_growth.toFixed(1)}%
              </span>
            </div>
            <div class="stat">
              <span class="stat-label">Flow Score</span>
              <span class="stat-value">${flow_score}/100</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Velocity Pulse -->
      <section class="card">
        <h3 class="card-title">📊 Velocity Pulse</h3>
        <p class="card-subtitle">${velocity_pulse.total_commits} commits from ${velocity_pulse.contributors.length} contributors</p>
        <div class="velocity-chart">
          ${velocity_pulse.contributors.slice(0, 6).map(c => this.renderContributorBar(c, velocity_pulse.total_commits)).join('')}
        </div>
      </section>

      <!-- Health Trend -->
      <section class="card">
        <h3 class="card-title">💚 Codebase Health</h3>
        <div class="health-content">
          <div class="health-delta ${health_trend.delta >= 0 ? 'positive' : 'negative'}">
            ${health_trend.delta >= 0 ? '↑' : '↓'} ${Math.abs(health_trend.delta)}
          </div>
          <p class="health-interpretation">${this.escapeHtml(health_trend.interpretation)}</p>
          <div class="health-sparkline">
            ${this.renderSparkline(health_trend.sparkline)}
          </div>
          <div class="health-breakdown">
            <div class="breakdown-item positive">
              <span class="breakdown-icon">🛡️</span>
              <span>${health_trend.breakdown.security_fixes} security fixes</span>
            </div>
            <div class="breakdown-item ${health_trend.breakdown.security_new > 0 ? 'negative' : ''}">
              <span class="breakdown-icon">⚠️</span>
              <span>${health_trend.breakdown.security_new} new alerts</span>
            </div>
            <div class="breakdown-item positive">
              <span class="breakdown-icon">🧹</span>
              <span>${health_trend.breakdown.dead_code_removed} dead code removed</span>
            </div>
            <div class="breakdown-item positive">
              <span class="breakdown-icon">✨</span>
              <span>${health_trend.breakdown.quick_wins_resolved} quick wins resolved</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Highlights -->
      ${momentum.highlights && momentum.highlights.length > 0 ? `
      <section class="card highlights-card">
        <h3 class="card-title">🎯 Key Insights</h3>
        <div class="highlights">
          ${momentum.highlights.map(h => `
            <div class="highlight ${h.type}">
              <span class="highlight-icon">${h.icon}</span>
              <div class="highlight-content">
                <div class="highlight-title">${this.escapeHtml(h.title)}</div>
                <div class="highlight-desc">${this.escapeHtml(h.description)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
      ` : ''}

      <!-- Overall Grade -->
      <section class="card grade-card">
        <div class="overall-grade ${this.getGradeClass(overall_grade)}">${overall_grade}</div>
        <div class="grade-label">Overall Grade</div>
      </section>
    </div>

    ${data.narration ? `
    <section class="narration-section">
      <h3>📝 Narration</h3>
      <p class="narration-text">${this.escapeHtml(data.narration)}</p>
    </section>
    ` : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
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

  private renderMomentumGauge(score: number, grade: string): string {
    // SVG gauge with animated arc
    const normalizedScore = Math.min(Math.max(score, 0), 2); // Cap at 2 for display
    const percentage = (normalizedScore / 2) * 100;
    const angle = (percentage / 100) * 180; // Half circle
    const strokeDashoffset = 283 - (283 * percentage) / 100;

    return `
      <svg class="gauge-svg" viewBox="0 0 200 120">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#EF4444"/>
            <stop offset="50%" style="stop-color:#F59E0B"/>
            <stop offset="100%" style="stop-color:#10B981"/>
          </linearGradient>
        </defs>
        <!-- Background arc -->
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(92, 92, 102, 0.3)"
          stroke-width="12"
          stroke-linecap="round"
        />
        <!-- Progress arc -->
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGradient)"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray="251"
          stroke-dashoffset="${251 - (251 * percentage) / 100}"
          class="gauge-progress"
        />
        <!-- Center text -->
        <text x="100" y="85" text-anchor="middle" class="gauge-score">${score.toFixed(2)}</text>
        <text x="100" y="110" text-anchor="middle" class="gauge-grade">${grade}</text>
      </svg>
    `;
  }

  private renderContributorBar(
    contributor: { username: string; commits: number; velocity_delta: number; trend: string },
    totalCommits: number
  ): string {
    const percentage = (contributor.commits / totalCommits) * 100;
    const trendIcon = contributor.trend === 'up' ? '↑' : contributor.trend === 'down' ? '↓' : '→';
    const trendClass = contributor.trend;

    return `
      <div class="contributor-bar">
        <div class="contributor-info">
          <span class="contributor-name">${this.escapeHtml(contributor.username)}</span>
          <span class="contributor-trend ${trendClass}">${trendIcon} ${contributor.velocity_delta.toFixed(0)}%</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${percentage}%"></div>
        </div>
        <span class="contributor-commits">${contributor.commits}</span>
      </div>
    `;
  }

  private renderSparkline(data: number[]): string {
    if (!data || data.length === 0) return '';

    const width = 200;
    const height = 40;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}">
        <polyline
          points="${points}"
          fill="none"
          stroke="#8B4049"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    `;
  }

  private getGradeClass(grade: string): string {
    if (grade.startsWith('A')) return 'grade-a';
    if (grade.startsWith('B')) return 'grade-b';
    if (grade.startsWith('C')) return 'grade-c';
    if (grade.startsWith('D')) return 'grade-d';
    return 'grade-f';
  }

  private getBaseStyles(): string {
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
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }
    `;
  }

  private getDashboardStyles(): string {
    return `
      .header {
        margin-bottom: 24px;
      }

      .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-left {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }

      .title {
        font-size: 28px;
        font-weight: 700;
        color: #FAFAFA;
      }

      .repo-name {
        font-size: 14px;
        color: #A0A0A8;
        font-family: monospace;
      }

      .header-actions {
        display: flex;
        gap: 8px;
      }

      .btn-secondary {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: rgba(139, 64, 73, 0.1);
        border: 1px solid rgba(139, 64, 73, 0.3);
        border-radius: 8px;
        color: #FAFAFA;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-secondary:hover {
        background: rgba(139, 64, 73, 0.2);
        border-color: #8B4049;
      }

      .btn-icon {
        padding: 8px 12px;
        background: transparent;
        border: 1px solid #5C5C66;
        border-radius: 8px;
        color: #A0A0A8;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-icon:hover {
        border-color: #8B4049;
        color: #8B4049;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }

      @media (max-width: 900px) {
        .dashboard-grid {
          grid-template-columns: 1fr;
        }
      }

      .card {
        background: #0F0F12;
        border: 1px solid rgba(92, 92, 102, 0.3);
        border-radius: 16px;
        padding: 24px;
      }

      .hero-card {
        grid-column: span 2;
        display: flex;
        align-items: center;
        gap: 40px;
        background: linear-gradient(135deg, rgba(139, 64, 73, 0.1) 0%, rgba(15, 15, 18, 1) 100%);
        border-color: rgba(139, 64, 73, 0.3);
      }

      @media (max-width: 900px) {
        .hero-card {
          grid-column: span 1;
          flex-direction: column;
        }
      }

      .gauge-container {
        flex-shrink: 0;
      }

      .gauge-svg {
        width: 200px;
        height: 120px;
      }

      .gauge-progress {
        transition: stroke-dashoffset 1s ease-out;
      }

      .gauge-score {
        font-size: 32px;
        font-weight: 700;
        fill: #FAFAFA;
      }

      .gauge-grade {
        font-size: 16px;
        font-weight: 600;
        fill: #A0A0A8;
      }

      .momentum-details {
        flex: 1;
      }

      .momentum-interpretation {
        font-size: 20px;
        font-weight: 600;
        color: #FAFAFA;
        margin-bottom: 20px;
      }

      .momentum-stats {
        display: flex;
        gap: 32px;
      }

      .stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .stat-label {
        font-size: 12px;
        color: #A0A0A8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .stat-value {
        font-size: 18px;
        font-weight: 600;
      }

      .stat-value.positive { color: #10B981; }
      .stat-value.negative { color: #EF4444; }

      .card-title {
        font-size: 16px;
        font-weight: 600;
        color: #FAFAFA;
        margin-bottom: 8px;
      }

      .card-subtitle {
        font-size: 12px;
        color: #A0A0A8;
        margin-bottom: 16px;
      }

      .velocity-chart {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .contributor-bar {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .contributor-info {
        width: 140px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .contributor-name {
        font-size: 13px;
        color: #FAFAFA;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .contributor-trend {
        font-size: 11px;
        font-weight: 600;
      }

      .contributor-trend.up { color: #10B981; }
      .contributor-trend.down { color: #EF4444; }
      .contributor-trend.stable { color: #A0A0A8; }

      .bar-container {
        flex: 1;
        height: 8px;
        background: rgba(139, 64, 73, 0.15);
        border-radius: 4px;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #8B4049, #D4A574);
        border-radius: 4px;
        transition: width 0.5s ease-out;
      }

      .contributor-commits {
        font-size: 12px;
        color: #A0A0A8;
        width: 30px;
        text-align: right;
      }

      .health-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .health-delta {
        font-size: 32px;
        font-weight: 700;
      }

      .health-delta.positive { color: #10B981; }
      .health-delta.negative { color: #EF4444; }

      .health-interpretation {
        font-size: 14px;
        color: #A0A0A8;
        line-height: 1.5;
      }

      .sparkline-svg {
        width: 100%;
        height: 40px;
      }

      .health-breakdown {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .breakdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #A0A0A8;
      }

      .breakdown-item.positive { color: #10B981; }
      .breakdown-item.negative { color: #EF4444; }

      .breakdown-icon {
        font-size: 16px;
      }

      .highlights-card {
        grid-column: span 2;
      }

      @media (max-width: 900px) {
        .highlights-card {
          grid-column: span 1;
        }
      }

      .highlights {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .highlight {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.02);
      }

      .highlight.positive {
        background: rgba(16, 185, 129, 0.05);
        border-left: 3px solid #10B981;
      }

      .highlight.warning {
        background: rgba(245, 158, 11, 0.05);
        border-left: 3px solid #F59E0B;
      }

      .highlight.neutral {
        background: rgba(160, 160, 168, 0.05);
        border-left: 3px solid #A0A0A8;
      }

      .highlight-icon {
        font-size: 20px;
      }

      .highlight-content {
        flex: 1;
      }

      .highlight-title {
        font-size: 14px;
        font-weight: 600;
        color: #FAFAFA;
        margin-bottom: 4px;
      }

      .highlight-desc {
        font-size: 13px;
        color: #A0A0A8;
        line-height: 1.4;
      }

      .grade-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .overall-grade {
        font-size: 64px;
        font-weight: 800;
        line-height: 1;
        margin-bottom: 8px;
      }

      .grade-a { color: #10B981; }
      .grade-b { color: #3B82F6; }
      .grade-c { color: #F59E0B; }
      .grade-d { color: #F97316; }
      .grade-f { color: #EF4444; }

      .grade-label {
        font-size: 14px;
        color: #A0A0A8;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .narration-section {
        margin-top: 24px;
        padding: 24px;
        background: rgba(139, 64, 73, 0.05);
        border: 1px solid rgba(139, 64, 73, 0.2);
        border-radius: 12px;
      }

      .narration-section h3 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .narration-text {
        font-size: 14px;
        color: #A0A0A8;
        line-height: 1.6;
        font-style: italic;
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

  public dispose(): void {
    MomentumPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
