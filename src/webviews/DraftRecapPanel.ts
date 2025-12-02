import * as vscode from 'vscode';
import { Repository } from '../types';
import { GitService } from '../git/GitService';
import { apiClient } from '../api/KetchupApiClient';

/**
 * Draft Recap Webview Panel
 * Matches the design of your existing "Draft Update for Ketchup" modal
 */
export class DraftRecapPanel {
  public static currentPanel: DraftRecapPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private repository: Repository,
    private gitService: GitService
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'init':
            await this.handleInit();
            break;
          case 'fetchCommits':
            await this.handleFetchCommits(message.payload);
            break;
          case 'generateRecap':
            await this.handleGenerateRecap(message.payload);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static async render(
    context: vscode.ExtensionContext,
    repository: Repository,
    gitService: GitService
  ): Promise<void> {
    if (DraftRecapPanel.currentPanel) {
      DraftRecapPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupDraftRecap',
      `Draft Recap: ${repository.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DraftRecapPanel.currentPanel = new DraftRecapPanel(panel, context, repository, gitService);
  }

  private async handleInit(): Promise<void> {
    const metadata = await this.gitService.getRepositoryMetadata();
    this.panel.webview.postMessage({
      type: 'initData',
      payload: {
        repository: this.repository,
        metadata,
      },
    });
  }

  private async handleFetchCommits(payload: { from: string; to: string }): Promise<void> {
    try {
      const from = new Date(payload.from);
      const to = new Date(payload.to);

      // Try to get commits from cloud API first (includes GitHub metadata)
      let commits;
      try {
        commits = await apiClient.getCommits(this.repository.id, payload.from, payload.to);
      } catch (error) {
        // Fallback to local git
        commits = await this.gitService.getDetailedCommits(from, to);
      }

      this.panel.webview.postMessage({
        type: 'commitsLoaded',
        payload: { commits },
      });
    } catch (error) {
      this.panel.webview.postMessage({
        type: 'error',
        payload: { message: `Failed to fetch commits: ${error}` },
      });
    }
  }

  private async handleGenerateRecap(payload: {
    timeRange: { from: string; to: string };
    commitShas: string[];
  }): Promise<void> {
    try {
      // Create recap
      const recap = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Creating recap...',
          cancellable: false,
        },
        async () => {
          return await apiClient.createRecap({
            repositoryId: this.repository.id,
            timeRange: payload.timeRange,
            commitShas: payload.commitShas,
          });
        }
      );

      // Poll for completion
      const finalRecap = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating story recap...',
          cancellable: false,
        },
        async () => {
          return await apiClient.pollRecapStatus(recap.id);
        }
      );

      this.panel.webview.postMessage({
        type: 'recapGenerated',
        payload: { recap: finalRecap },
      });

      // Show success and offer to view
      const selection = await vscode.window.showInformationMessage(
        'Recap created successfully!',
        'View Recap',
        'Dismiss'
      );

      if (selection === 'View Recap') {
        vscode.commands.executeCommand('ketchup.viewRecap', finalRecap);
        this.panel.dispose();
      }

      // Refresh tree view
      vscode.commands.executeCommand('ketchup.refreshRecaps');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate recap: ${error}`);
      this.panel.webview.postMessage({
        type: 'error',
        payload: { message: `Failed to generate recap: ${error}` },
      });
    }
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Draft Recap</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1 class="title">
        <span class="icon">✨</span>
        Draft Update for <span class="repo-name" id="repoName">Repository</span>
      </h1>
      <p class="subtitle">Customize the scope of your recap.</p>
    </header>

    <div class="content">
      <!-- Time Range Section -->
      <section class="section">
        <label class="section-label">TIME RANGE</label>
        <div class="time-range-pills">
          <button class="pill" data-days="1">Last 24 Hours</button>
          <button class="pill active" data-days="7">Last 7 Days</button>
          <button class="pill" data-days="14">Last 14 Days</button>
          <button class="pill" data-days="30">Last 30 Days</button>
        </div>
        <div class="date-display" id="dateDisplay">Select a range</div>
      </section>

      <!-- Contributors Section -->
      <section class="section" id="contributorsSection" style="display: none;">
        <label class="section-label">
          <span class="icon-small">👥</span>
          CONTRIBUTORS
        </label>
        <div class="contributors-pills" id="contributorsPills"></div>
      </section>

      <!-- Activity Snapshot -->
      <section class="section">
        <div class="snapshot-card">
          <h3 class="snapshot-title">
            <span class="icon-small">✓</span>
            Activity Snapshot
          </h3>
          <div class="snapshot-grid">
            <div class="snapshot-item">
              <div class="snapshot-value" id="commitCount">0</div>
              <div class="snapshot-label">Commits</div>
            </div>
            <div class="snapshot-item">
              <div class="snapshot-value" id="authorCount">0</div>
              <div class="snapshot-label">Authors</div>
            </div>
            <div class="snapshot-item">
              <div class="snapshot-value ketchup" id="selectedCount">0</div>
              <div class="snapshot-label">Selected</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Commits List -->
      <section class="section">
        <div class="commits-container">
          <div class="commits-header">
            <span class="commits-title" id="commitsTitle">Commits (0/0)</span>
            <div class="commits-actions">
              <button class="btn-ghost" id="selectAllBtn">Select All</button>
              <button class="btn-ghost" id="clearBtn">Clear</button>
            </div>
          </div>
          <div class="commits-list" id="commitsList">
            <div class="loading">Loading commits...</div>
          </div>
        </div>
      </section>
    </div>

    <footer class="footer">
      <button class="btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn-primary" id="generateBtn">
        <span class="icon-small">✓</span>
        Generate Recap
      </button>
    </footer>
  </div>

  <script>
    ${this.getScript()}
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
        max-width: 800px;
        margin: 0 auto;
        padding: 24px;
      }

      .header {
        margin-bottom: 32px;
        text-align: center;
      }

      .title {
        font-size: 24px;
        font-weight: 700;
        color: #FAFAFA;
        margin-bottom: 8px;
      }

      .icon {
        color: #8B4049;
        margin-right: 8px;
      }

      .icon-small {
        font-size: 14px;
        margin-right: 4px;
      }

      .repo-name {
        color: #8B4049;
      }

      .subtitle {
        font-size: 14px;
        color: #A0A0A8;
      }

      .section {
        margin-bottom: 24px;
      }

      .section-label {
        display: flex;
        align-items: center;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #A0A0A8;
        margin-bottom: 12px;
      }

      .time-range-pills, .contributors-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }

      .pill {
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid #5C5C66;
        background: #1C1C20;
        color: #A0A0A8;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .pill:hover {
        border-color: #8B4049;
        background: #1C1C20;
      }

      .pill.active {
        border-color: #8B4049;
        background: #8B4049;
        color: #000;
      }

      .date-display {
        text-align: center;
        font-size: 12px;
        color: #A0A0A8;
      }

      .snapshot-card {
        background: linear-gradient(135deg, rgba(139, 64, 73, 0.1) 0%, #08080A 100%);
        border: 1px solid rgba(139, 64, 73, 0.2);
        border-radius: 12px;
        padding: 20px;
      }

      .snapshot-title {
        font-size: 14px;
        font-weight: 700;
        color: #FAFAFA;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
      }

      .snapshot-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
      }

      .snapshot-item {
        background: rgba(8, 8, 10, 0.5);
        border: 1px solid rgba(92, 92, 102, 0.5);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
      }

      .snapshot-value {
        font-size: 28px;
        font-weight: 700;
        color: #FAFAFA;
        margin-bottom: 4px;
      }

      .snapshot-value.ketchup {
        color: #8B4049;
      }

      .snapshot-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #A0A0A8;
        font-weight: 700;
      }

      .commits-container {
        background: rgba(15, 15, 18, 0.5);
        border: 1px solid #5C5C66;
        border-radius: 12px;
        overflow: hidden;
        max-height: 500px;
        display: flex;
        flex-direction: column;
      }

      .commits-header {
        padding: 12px 16px;
        border-bottom: 1px solid #5C5C66;
        background: #0F0F12;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .commits-title {
        font-size: 14px;
        font-weight: 500;
        color: #FAFAFA;
      }

      .commits-actions {
        display: flex;
        gap: 8px;
      }

      .btn-ghost {
        padding: 4px 12px;
        font-size: 12px;
        color: #A0A0A8;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: color 0.2s;
      }

      .btn-ghost:hover {
        color: #FAFAFA;
      }

      .commits-list {
        flex: 1;
        overflow-y: auto;
      }

      .loading, .empty {
        padding: 48px;
        text-align: center;
        color: #A0A0A8;
        font-size: 14px;
      }

      .commit-item {
        display: flex;
        align-items: start;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(92, 92, 102, 0.3);
        cursor: pointer;
        transition: background 0.2s;
      }

      .commit-item:hover {
        background: rgba(139, 64, 73, 0.05);
      }

      .commit-item.selected {
        background: rgba(139, 64, 73, 0.1);
      }

      .checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid #5C5C66;
        border-radius: 4px;
        cursor: pointer;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .checkbox.checked {
        background: #8B4049;
        border-color: #8B4049;
      }

      .commit-info {
        flex: 1;
        min-width: 0;
      }

      .commit-message {
        font-size: 14px;
        color: #FAFAFA;
        margin-bottom: 4px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .commit-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #A0A0A8;
      }

      .commit-sha {
        font-family: 'Courier New', monospace;
        color: #5C5C66;
      }

      .footer {
        margin-top: 24px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding-top: 24px;
        border-top: 1px solid #5C5C66;
      }

      .btn-secondary {
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        color: #A0A0A8;
        background: transparent;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: color 0.2s;
      }

      .btn-secondary:hover {
        color: #FAFAFA;
      }

      .btn-primary {
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 600;
        color: #000;
        background: #8B4049;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .btn-primary:hover {
        background: #D4A574;
      }

      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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

  private getScript(): string {
    return `
      const vscode = acquireVsCodeApi();

      let state = {
        commits: [],
        selectedCommits: new Set(),
        selectedAuthors: new Set(),
        timeRange: {
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          to: new Date()
        }
      };

      // Initialize
      vscode.postMessage({ type: 'init' });

      // Handle messages from extension
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
          case 'initData':
            document.getElementById('repoName').textContent = message.payload.repository.name;
            fetchCommits();
            break;
          case 'commitsLoaded':
            state.commits = message.payload.commits;
            state.selectedCommits = new Set(state.commits.map(c => c.sha));
            renderCommits();
            renderContributors();
            updateSnapshot();
            break;
          case 'error':
            showError(message.payload.message);
            break;
        }
      });

      // Time range pills
      document.querySelectorAll('.pill[data-days]').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('.pill[data-days]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const days = parseInt(pill.dataset.days);
          state.timeRange = {
            from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            to: new Date()
          };
          updateDateDisplay();
          fetchCommits();
        });
      });

      // Buttons
      document.getElementById('selectAllBtn').addEventListener('click', () => {
        state.selectedCommits = new Set(getFilteredCommits().map(c => c.sha));
        renderCommits();
        updateSnapshot();
      });

      document.getElementById('clearBtn').addEventListener('click', () => {
        state.selectedCommits.clear();
        renderCommits();
        updateSnapshot();
      });

      document.getElementById('cancelBtn').addEventListener('click', () => {
        window.close();
      });

      document.getElementById('generateBtn').addEventListener('click', () => {
        if (state.selectedCommits.size === 0) {
          showError('Please select at least one commit');
          return;
        }
        vscode.postMessage({
          type: 'generateRecap',
          payload: {
            timeRange: {
              from: state.timeRange.from.toISOString(),
              to: state.timeRange.to.toISOString()
            },
            commitShas: Array.from(state.selectedCommits)
          }
        });
      });

      function fetchCommits() {
        document.getElementById('commitsList').innerHTML = '<div class="loading">Loading commits...</div>';
        vscode.postMessage({
          type: 'fetchCommits',
          payload: {
            from: state.timeRange.from.toISOString(),
            to: state.timeRange.to.toISOString()
          }
        });
      }

      function getFilteredCommits() {
        if (state.selectedAuthors.size === 0) {
          return state.commits;
        }
        return state.commits.filter(c => state.selectedAuthors.has(c.author.name));
      }

      function renderCommits() {
        const filtered = getFilteredCommits();
        const list = document.getElementById('commitsList');

        if (filtered.length === 0) {
          list.innerHTML = '<div class="empty">No commits found in this range</div>';
          return;
        }

        list.innerHTML = filtered.map(commit => \`
          <div class="commit-item \${state.selectedCommits.has(commit.sha) ? 'selected' : ''}"
               data-sha="\${commit.sha}">
            <div class="checkbox \${state.selectedCommits.has(commit.sha) ? 'checked' : ''}"></div>
            <div class="commit-info">
              <div class="commit-message">\${escapeHtml(commit.message)}</div>
              <div class="commit-meta">
                <span class="commit-sha">\${commit.sha.substring(0, 7)}</span>
                <span>•</span>
                <span>\${commit.author.name}</span>
                <span>•</span>
                <span>\${formatDate(commit.author.date)}</span>
              </div>
            </div>
          </div>
        \`).join('');

        // Add click handlers
        document.querySelectorAll('.commit-item').forEach(item => {
          item.addEventListener('click', () => {
            const sha = item.dataset.sha;
            if (state.selectedCommits.has(sha)) {
              state.selectedCommits.delete(sha);
            } else {
              state.selectedCommits.add(sha);
            }
            renderCommits();
            updateSnapshot();
          });
        });

        updateCommitsTitle();
      }

      function renderContributors() {
        const authors = [...new Set(state.commits.map(c => c.author.name))].sort();
        if (authors.length <= 1) {
          document.getElementById('contributorsSection').style.display = 'none';
          return;
        }

        document.getElementById('contributorsSection').style.display = 'block';
        const container = document.getElementById('contributorsPills');

        container.innerHTML = \`
          <button class="pill \${state.selectedAuthors.size === 0 ? 'active' : ''}" data-author="all">
            All Authors
          </button>
          \${authors.map(author => \`
            <button class="pill \${state.selectedAuthors.has(author) ? 'active' : ''}"
                    data-author="\${escapeHtml(author)}">
              \${escapeHtml(author)}
            </button>
          \`).join('')}
        \`;

        container.querySelectorAll('.pill').forEach(pill => {
          pill.addEventListener('click', () => {
            const author = pill.dataset.author;
            if (author === 'all') {
              state.selectedAuthors.clear();
            } else {
              if (state.selectedAuthors.has(author)) {
                state.selectedAuthors.delete(author);
              } else {
                state.selectedAuthors.add(author);
              }
            }
            renderCommits();
            renderContributors();
            updateSnapshot();
          });
        });
      }

      function updateSnapshot() {
        const filtered = getFilteredCommits();
        const authors = new Set(filtered.map(c => c.author.name));

        document.getElementById('commitCount').textContent = filtered.length;
        document.getElementById('authorCount').textContent = state.selectedAuthors.size === 0 ? authors.size : state.selectedAuthors.size;
        document.getElementById('selectedCount').textContent = state.selectedCommits.size;
      }

      function updateCommitsTitle() {
        const filtered = getFilteredCommits();
        document.getElementById('commitsTitle').textContent =
          \`Commits (\${state.selectedCommits.size}/\${filtered.length})\`;
      }

      function updateDateDisplay() {
        const from = state.timeRange.from;
        const to = state.timeRange.to;
        document.getElementById('dateDisplay').textContent =
          \`\${formatDateShort(from)} – \${formatDateShort(to)}\`;
      }

      function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      }

      function formatDateShort(date) {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function showError(message) {
        // Could implement a toast/notification system
        console.error(message);
      }

      // Initial update
      updateDateDisplay();
    `;
  }

  public dispose(): void {
    DraftRecapPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
