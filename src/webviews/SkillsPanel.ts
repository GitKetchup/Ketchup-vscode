import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { SkillsGraph, Repository } from '../types';

/**
 * Skills Panel Webview
 * Displays contributor skills graph, bus factor, and language distribution
 */
export class SkillsPanel {
  public static currentPanel: SkillsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private repository: Repository
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type === 'init' || message.type === 'refresh') {
          await this.loadData();
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
    if (SkillsPanel.currentPanel) {
      SkillsPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupSkills',
      `👥 Skills - ${repository.name}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    SkillsPanel.currentPanel = new SkillsPanel(panel, context, repository);
    await SkillsPanel.currentPanel.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.panel.webview.html = this.getLoadingHtml();
      const data = await apiClient.getSkillsGraph(this.repository.id);

      // Check for empty state
      if (data.contributors.length === 0) {
        this.panel.webview.html = this.getEmptyStateHtml();
        return;
      }

      this.panel.webview.html = this.getHtmlContent(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.panel.webview.html = this.getErrorHtml(errorMessage);
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html><head><style>
  body { background: #08080A; color: #FAFAFA; display: flex; justify-content: center; align-items: center; min-height: 80vh; font-family: system-ui; }
  .loader { width: 48px; height: 48px; border: 3px solid rgba(139, 64, 73, 0.2); border-top-color: #8B4049; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body><div class="loader"></div></body></html>`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html><head><style>
  body { background: #08080A; color: #FAFAFA; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 80vh; font-family: system-ui; text-align: center; }
  button { padding: 12px 24px; background: #8B4049; color: #FAFAFA; border: none; border-radius: 8px; cursor: pointer; margin-top: 16px; }
</style></head>
<body>
  <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
  <h2>Failed to load skills</h2>
  <p style="color: #A0A0A8">${this.escapeHtml(message)}</p>
  <button onclick="vscode.postMessage({type:'init'})">Retry</button>
  <script>const vscode = acquireVsCodeApi();</script>
</body></html>`;
  }

  private getEmptyStateHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Data</title>
  <style>
    ${this.getStyles()}
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
    .empty-icon { font-size: 64px; margin-bottom: 8px; opacity: 0.8; }
    .empty-title { font-size: 24px; font-weight: 700; color: #FAFAFA; }
    .empty-desc { color: #A0A0A8; font-size: 14px; max-width: 400px; line-height: 1.6; }
    .action-btn { padding: 12px 24px; background: #8B4049; color: #FAFAFA; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .action-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="empty-container">
    <div class="empty-icon">👥</div>
    <h2 class="empty-title">Unknown Team</h2>
    <p class="empty-desc">
      We haven't met your team yet. Once we analyze the commit history, we'll build a skills profile for everyone.
    </p>
    <button class="action-btn" onclick="retry()">Start Analysis</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function retry() { vscode.postMessage({ type: 'refresh' }); }
  </script>
</body>
</html>`;
  }

  private getHtmlContent(data: SkillsGraph): string {
    const totalCommits = data.contributors.reduce((acc, c) => acc + c.commits, 0);
    
    // Sort languages by count
    const sortedLangs = Object.entries(data.language_distribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>👥 Skills Graph</h1>
      <span class="repo-name">${this.escapeHtml(this.repository.fullName)}</span>
    </header>

    <!-- Summary Cards -->
    <div class="summary-row">
      <div class="summary-card">
        <div class="summary-value">${data.team_size}</div>
        <div class="summary-label">Team Size</div>
      </div>
      <div class="summary-card ${data.bus_factor <= 2 ? 'warning' : ''}">
        <div class="summary-value">${data.bus_factor}</div>
        <div class="summary-label">Bus Factor</div>
        ${data.bus_factor <= 2 ? '<div class="warning-text">⚠️ Knowledge concentration risk</div>' : ''}
      </div>
      <div class="summary-card">
        <div class="summary-value">${totalCommits}</div>
        <div class="summary-label">Total Commits</div>
      </div>
    </div>

    <div class="grid">
      <!-- Contributors -->
      <section class="card">
        <h3>🧑‍💻 Contributors</h3>
        <div class="contributors">
          ${data.contributors.slice(0, 10).map((c, i) => `
            <div class="contributor">
              <div class="rank">${i + 1}</div>
              <div class="contributor-info">
                <div class="contributor-name">${this.escapeHtml(c.username)}</div>
                <div class="contributor-meta">
                  <span>${c.primary_language}</span>
                  <span>•</span>
                  <span>${c.commits} commits</span>
                </div>
              </div>
              <div class="leverage">
                <div class="leverage-bar" style="width: ${Math.min(c.leverage_index * 100, 100)}%"></div>
              </div>
            </div>
          `).join('')}
          ${data.contributors.length === 0 ? '<p class="empty">No contributor data available</p>' : ''}
        </div>
      </section>

      <!-- Language Distribution -->
      <section class="card">
        <h3>📊 Languages</h3>
        <div class="languages">
          ${sortedLangs.map(([lang, count]) => {
            const total = Object.values(data.language_distribution).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return `
              <div class="lang-row">
                <span class="lang-name">${this.escapeHtml(lang)}</span>
                <div class="lang-bar-container">
                  <div class="lang-bar" style="width: ${pct}%"></div>
                </div>
                <span class="lang-pct">${pct}%</span>
              </div>
            `;
          }).join('')}
          ${sortedLangs.length === 0 ? '<p class="empty">No language data available</p>' : ''}
        </div>
      </section>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'init' });
  </script>
</body></html>`;
  }

  private getStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui; background: #08080A; color: #FAFAFA; }
      .container { max-width: 1000px; margin: 0 auto; padding: 24px; }
      .header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; }
      .header h1 { font-size: 24px; }
      .repo-name { font-size: 14px; color: #A0A0A8; font-family: monospace; }
      .summary-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
      .summary-card { background: #0F0F12; border: 1px solid rgba(92, 92, 102, 0.3); border-radius: 12px; padding: 20px; text-align: center; }
      .summary-card.warning { border-color: rgba(245, 158, 11, 0.5); background: rgba(245, 158, 11, 0.05); }
      .summary-value { font-size: 36px; font-weight: 700; color: #8B4049; }
      .summary-label { font-size: 12px; color: #A0A0A8; margin-top: 4px; }
      .warning-text { font-size: 11px; color: #F59E0B; margin-top: 8px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .card { background: #0F0F12; border: 1px solid rgba(92, 92, 102, 0.3); border-radius: 12px; padding: 20px; }
      .card h3 { font-size: 16px; margin-bottom: 16px; }
      .contributors { display: flex; flex-direction: column; gap: 12px; }
      .contributor { display: flex; align-items: center; gap: 12px; }
      .rank { width: 24px; height: 24px; background: rgba(139, 64, 73, 0.2); color: #8B4049; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
      .contributor-info { flex: 1; }
      .contributor-name { font-size: 14px; font-weight: 500; }
      .contributor-meta { font-size: 12px; color: #A0A0A8; display: flex; gap: 6px; }
      .leverage { width: 60px; height: 6px; background: rgba(139, 64, 73, 0.2); border-radius: 3px; overflow: hidden; }
      .leverage-bar { height: 100%; background: #8B4049; border-radius: 3px; }
      .languages { display: flex; flex-direction: column; gap: 12px; }
      .lang-row { display: flex; align-items: center; gap: 12px; }
      .lang-name { width: 80px; font-size: 13px; }
      .lang-bar-container { flex: 1; height: 8px; background: rgba(139, 64, 73, 0.15); border-radius: 4px; overflow: hidden; }
      .lang-bar { height: 100%; background: linear-gradient(90deg, #8B4049, #D4A574); border-radius: 4px; }
      .lang-pct { width: 40px; font-size: 12px; color: #A0A0A8; text-align: right; }
      .empty { color: #A0A0A8; font-size: 14px; text-align: center; padding: 24px; }
      @media (max-width: 700px) { .grid, .summary-row { grid-template-columns: 1fr; } }
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  public dispose(): void {
    SkillsPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
