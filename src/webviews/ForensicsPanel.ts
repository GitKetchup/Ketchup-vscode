import * as vscode from 'vscode';
import { apiClient } from '../api/KetchupApiClient';
import { ForensicsData, Repository } from '../types';

/**
 * Forensics Panel Webview
 * Displays code forensics: complexity hotspots, security alerts, dead code, quick wins
 */
export class ForensicsPanel {
  public static currentPanel: ForensicsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private forensicsData: ForensicsData | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private repository: Repository
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'init':
            await this.loadData();
            break;
          case 'refresh':
            await this.loadData();
            break;
          case 'openFile':
            await this.handleOpenFile(message.file);
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
    if (ForensicsPanel.currentPanel) {
      ForensicsPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupForensics',
      `🔍 Forensics - ${repository.name}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ForensicsPanel.currentPanel = new ForensicsPanel(panel, context, repository);
    await ForensicsPanel.currentPanel.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.panel.webview.html = this.getLoadingHtml();
      this.forensicsData = await apiClient.getForensics(this.repository.id);

      // Check for empty state
      if (
        this.forensicsData.complexity_hotspots.length === 0 &&
        this.forensicsData.security_summary.total_vulnerabilities === 0 &&
        this.forensicsData.dead_code.estimated_lines === 0
      ) {
        this.panel.webview.html = this.getEmptyStateHtml();
        return;
      }

      this.panel.webview.html = this.getHtmlContent(this.forensicsData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.panel.webview.html = this.getErrorHtml(errorMessage);
    }
  }

  private async handleOpenFile(filePath: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        await vscode.window.showTextDocument(uri);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
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
  .icon { font-size: 48px; margin-bottom: 16px; }
  button { padding: 12px 24px; background: #8B4049; color: #FAFAFA; border: none; border-radius: 8px; cursor: pointer; margin-top: 16px; }
</style></head>
<body>
  <div class="icon">⚠️</div>
  <h2>Failed to load forensics</h2>
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
    <div class="empty-icon">🔍</div>
    <h2 class="empty-title">No Forensics Yet</h2>
    <p class="empty-desc">
      We haven't found any code issues yet. This might simply mean we haven't analyzed your codebase deep enough.
    </p>
    <button class="action-btn" onclick="retry()">Run Analysis</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function retry() { vscode.postMessage({ type: 'refresh' }); }
  </script>
</body>
</html>`;
  }

  private getHtmlContent(data: ForensicsData): string {
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
      <h1>🔍 Code Forensics</h1>
      <span class="repo-name">${this.escapeHtml(this.repository.fullName)}</span>
      <span class="health-badge ${data.overall_health.toLowerCase()}">${data.overall_health}</span>
    </header>

    <div class="grid">
      <!-- Security Summary -->
      <section class="card">
        <h3>🛡️ Security</h3>
        <div class="security-grade grade-${data.security_summary.grade.toLowerCase()}">${data.security_summary.grade}</div>
        <div class="security-counts">
          <span class="count critical">${data.security_summary.critical} Critical</span>
          <span class="count high">${data.security_summary.high} High</span>
          <span class="count medium">${data.security_summary.medium} Medium</span>
          <span class="count low">${data.security_summary.low} Low</span>
        </div>
      </section>

      <!-- Dead Code -->
      <section class="card">
        <h3>🧹 Dead Code</h3>
        <div class="metric">${data.dead_code.estimated_lines}</div>
        <div class="metric-label">Estimated Lines</div>
        <div class="breakdown">
          <span>${data.dead_code.unused_functions} functions</span>
          <span>${data.dead_code.unused_imports} imports</span>
          <span>${data.dead_code.unused_variables} variables</span>
        </div>
      </section>

      <!-- Complexity Hotspots -->
      <section class="card wide">
        <h3>🔥 Complexity Hotspots</h3>
        <div class="table">
          ${data.complexity_hotspots.slice(0, 8).map(h => `
            <div class="row" onclick="openFile('${this.escapeHtml(h.file)}')">
              <span class="file">${this.escapeHtml(h.file.split('/').pop() || h.file)}</span>
              <span class="badge ${h.risk.toLowerCase()}">${h.risk}</span>
              <span class="complexity">CC: ${h.complexity}</span>
            </div>
          `).join('')}
          ${data.complexity_hotspots.length === 0 ? '<p class="empty">No complexity hotspots detected ✨</p>' : ''}
        </div>
      </section>

      <!-- Quick Wins -->
      <section class="card wide">
        <h3>💡 Quick Wins</h3>
        <div class="quick-wins">
          ${data.quick_wins.slice(0, 6).map(qw => `
            <div class="quick-win">
              <span class="qw-icon">${this.getQuickWinIcon(qw.type)}</span>
              <div class="qw-content">
                <div class="qw-title">${this.escapeHtml(qw.title)}</div>
                <div class="qw-desc">${this.escapeHtml(qw.description)}</div>
              </div>
              <span class="qw-impact ${qw.impact.toLowerCase()}">${qw.impact}</span>
            </div>
          `).join('')}
          ${data.quick_wins.length === 0 ? '<p class="empty">No quick wins available</p>' : ''}
        </div>
      </section>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function openFile(file) { vscode.postMessage({ type: 'openFile', file }); }
    vscode.postMessage({ type: 'init' });
  </script>
</body></html>`;
  }

  private getQuickWinIcon(type: string): string {
    const icons: Record<string, string> = {
      complexity: '🔧',
      security: '🔒',
      dead_code: '🗑️',
      test: '🧪',
      docs: '📝',
    };
    return icons[type] || '💡';
  }

  private getStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui; background: #08080A; color: #FAFAFA; }
      .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
      .header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
      .header h1 { font-size: 24px; }
      .repo-name { font-size: 14px; color: #A0A0A8; font-family: monospace; }
      .health-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
      .health-badge.excellent { background: rgba(16, 185, 129, 0.2); color: #10B981; }
      .health-badge.good { background: rgba(59, 130, 246, 0.2); color: #3B82F6; }
      .health-badge.fair { background: rgba(245, 158, 11, 0.2); color: #F59E0B; }
      .health-badge.poor, .health-badge.critical { background: rgba(239, 68, 68, 0.2); color: #EF4444; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
      .card { background: #0F0F12; border: 1px solid rgba(92, 92, 102, 0.3); border-radius: 12px; padding: 20px; }
      .card.wide { grid-column: span 2; }
      .card h3 { font-size: 16px; margin-bottom: 16px; }
      .security-grade { font-size: 48px; font-weight: 700; text-align: center; margin: 16px 0; }
      .grade-a { color: #10B981; } .grade-b { color: #3B82F6; } .grade-c { color: #F59E0B; } .grade-d, .grade-f { color: #EF4444; }
      .security-counts { display: flex; gap: 12px; flex-wrap: wrap; }
      .count { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
      .count.critical { background: rgba(239, 68, 68, 0.2); color: #EF4444; }
      .count.high { background: rgba(249, 115, 22, 0.2); color: #F97316; }
      .count.medium { background: rgba(245, 158, 11, 0.2); color: #F59E0B; }
      .count.low { background: rgba(160, 160, 168, 0.2); color: #A0A0A8; }
      .metric { font-size: 36px; font-weight: 700; color: #8B4049; }
      .metric-label { font-size: 12px; color: #A0A0A8; margin-bottom: 12px; }
      .breakdown { display: flex; gap: 12px; font-size: 12px; color: #A0A0A8; }
      .table { display: flex; flex-direction: column; gap: 8px; }
      .row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px; cursor: pointer; }
      .row:hover { background: rgba(139, 64, 73, 0.1); }
      .file { flex: 1; font-size: 13px; color: #FAFAFA; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      .badge.critical { background: #EF4444; color: #fff; } .badge.high { background: #F97316; color: #fff; }
      .badge.medium { background: #F59E0B; color: #000; } .badge.low { background: #A0A0A8; color: #000; }
      .complexity { font-size: 12px; color: #A0A0A8; font-family: monospace; }
      .quick-wins { display: flex; flex-direction: column; gap: 12px; }
      .quick-win { display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px; }
      .qw-icon { font-size: 20px; }
      .qw-content { flex: 1; }
      .qw-title { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
      .qw-desc { font-size: 12px; color: #A0A0A8; }
      .qw-impact { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      .qw-impact.high { background: rgba(16, 185, 129, 0.2); color: #10B981; }
      .qw-impact.medium { background: rgba(59, 130, 246, 0.2); color: #3B82F6; }
      .qw-impact.low { background: rgba(160, 160, 168, 0.2); color: #A0A0A8; }
      .empty { color: #A0A0A8; font-size: 14px; text-align: center; padding: 24px; }
      @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } .card.wide { grid-column: span 1; } }
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  public dispose(): void {
    ForensicsPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
