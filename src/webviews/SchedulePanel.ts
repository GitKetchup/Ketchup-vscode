import * as vscode from 'vscode';
import { Schedule, Repository } from '../types';
import { apiClient } from '../api/KetchupApiClient';
import { GitService, createGitService } from '../git/GitService';

/**
 * Schedule Webview Panel
 * Allows creating and editing schedules
 */
export class SchedulePanel {
  public static currentPanel: SchedulePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private repository: Repository,
    private schedule?: Schedule
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
          case 'saveSchedule':
            await this.handleSaveSchedule(message.payload);
            break;
          case 'cancel':
            this.dispose();
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
    schedule?: Schedule
  ): Promise<void> {
    // If we already have a panel, check if it's the same schedule or a new one
    // For simplicity, we'll just dispose the old one and create a new one
    if (SchedulePanel.currentPanel) {
      SchedulePanel.currentPanel.dispose();
    }

    const title = schedule ? `Edit Schedule: ${schedule.name}` : 'Create New Schedule';

    const panel = vscode.window.createWebviewPanel(
      'ketchupSchedule',
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SchedulePanel.currentPanel = new SchedulePanel(panel, context, repository, schedule);
  }

  private async handleInit(): Promise<void> {
    // Get branches
    const gitService = createGitService();
    let branches: string[] = ['main', 'master'];
    try {
      if (gitService) {
        branches = await gitService.getBranches();
      }
    } catch (e) {
      console.warn('Failed to fetch branches, using defaults');
    }

    this.panel.webview.postMessage({
      type: 'initData',
      payload: {
        repository: this.repository,
        schedule: this.schedule,
        branches,
      },
    });
  }

  private async handleSaveSchedule(payload: Partial<Schedule>): Promise<void> {
    try {
      if (this.schedule && this.schedule.id) {
        // Update
        await apiClient.updateSchedule(this.schedule.id, payload);
        vscode.window.showInformationMessage('Schedule updated successfully!');
      } else {
        // Create
        await apiClient.createSchedule(this.repository.id, payload);
        vscode.window.showInformationMessage('Schedule created successfully!');
      }

      // Refresh tree view
      vscode.commands.executeCommand('ketchup.refreshSchedules');
      
      this.dispose();
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      vscode.window.showErrorMessage(`Failed to save schedule: ${message}`);
      this.panel.webview.postMessage({
        type: 'error',
        payload: { message },
      });
    }
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedule Recap</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1 class="title">
        <span class="icon">📅</span>
        ${this.schedule ? 'Edit Schedule' : 'Create New Schedule'}
      </h1>
      <p class="subtitle">Automate your recaps with a recurring schedule.</p>
    </header>

    <div class="content">
      <form id="scheduleForm">
        <!-- Name -->
        <div class="form-group">
          <label class="label">Schedule Name</label>
          <input type="text" id="name" class="input" placeholder="e.g. Weekly Update" required>
        </div>

        <!-- Branch -->
        <div class="form-group">
          <label class="label">Branch</label>
          <select id="branch" class="select">
            <option value="main">main</option>
          </select>
          <p class="help-text">The branch to analyze for this recap.</p>
        </div>

        <!-- Cron -->
        <div class="form-group">
          <label class="label">Frequency</label>
          <div class="cron-presets">
            <button type="button" class="pill" data-cron="0 9 * * 1">Weekly (Mon 9am)</button>
            <button type="button" class="pill" data-cron="0 9 * * 5">Weekly (Fri 9am)</button>
            <button type="button" class="pill" data-cron="0 9 * * *">Daily (9am)</button>
            <button type="button" class="pill" data-cron="0 0 1 * *">Monthly (1st)</button>
          </div>
          <input type="text" id="cron" class="input" placeholder="Cron expression (e.g. 0 9 * * 1)" required>
          <p class="help-text">Standard cron expression. <a href="https://crontab.guru/" target="_blank">Need help?</a></p>
        </div>

        <!-- Time Range -->
        <div class="form-group">
          <label class="label">Time Range (Days)</label>
          <select id="timeRange" class="select">
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
        </div>

        <!-- Enabled -->
        <div class="form-group checkbox-group">
          <label class="checkbox-container">
            <input type="checkbox" id="enabled" checked>
            <span class="checkmark"></span>
            <span class="checkbox-label">Enable this schedule</span>
          </label>
        </div>
      </form>
    </div>

    <footer class="footer">
      <button class="btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn-primary" id="saveBtn">
        <span class="icon-small">💾</span>
        Save Schedule
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
        max-width: 600px;
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
        margin-right: 8px;
      }

      .subtitle {
        font-size: 14px;
        color: #A0A0A8;
      }

      .form-group {
        margin-bottom: 24px;
      }

      .label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        color: #A0A0A8;
        margin-bottom: 8px;
      }

      .input, .select {
        width: 100%;
        padding: 10px 12px;
        background: #1C1C20;
        border: 1px solid #5C5C66;
        border-radius: 8px;
        color: #FAFAFA;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      .input:focus, .select:focus {
        border-color: #8B4049;
      }

      .help-text {
        font-size: 11px;
        color: #5C5C66;
        margin-top: 6px;
      }

      .help-text a {
        color: #8B4049;
        text-decoration: none;
      }

      .cron-presets {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .pill {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #5C5C66;
        background: transparent;
        color: #A0A0A8;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .pill:hover {
        border-color: #8B4049;
        color: #FAFAFA;
      }

      .checkbox-container {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
      }

      .checkbox-container input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
      }

      .checkmark {
        height: 18px;
        width: 18px;
        background-color: #1C1C20;
        border: 1px solid #5C5C66;
        border-radius: 4px;
        margin-right: 10px;
        position: relative;
      }

      .checkbox-container:hover input ~ .checkmark {
        border-color: #8B4049;
      }

      .checkbox-container input:checked ~ .checkmark {
        background-color: #8B4049;
        border-color: #8B4049;
      }

      .checkmark:after {
        content: "";
        position: absolute;
        display: none;
      }

      .checkbox-container input:checked ~ .checkmark:after {
        display: block;
      }

      .checkbox-container .checkmark:after {
        left: 5px;
        top: 2px;
        width: 4px;
        height: 8px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .footer {
        margin-top: 32px;
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
    `;
  }

  private getScript(): string {
    return `
      const vscode = acquireVsCodeApi();
      let state = {
        schedule: null,
        branches: []
      };

      // Initialize
      vscode.postMessage({ type: 'init' });

      // Handle messages
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
          case 'initData':
            state.schedule = message.payload.schedule;
            state.branches = message.payload.branches;
            initForm();
            break;
          case 'error':
            // Error handling if needed
            break;
        }
      });

      function initForm() {
        // Populate branches
        const branchSelect = document.getElementById('branch');
        branchSelect.innerHTML = state.branches.map(b => 
          \`<option value="\${b}">\${b}</option>\`
        ).join('');

        if (state.schedule) {
          document.getElementById('name').value = state.schedule.name;
          document.getElementById('cron').value = state.schedule.cron;
          document.getElementById('branch').value = state.schedule.branch || 'main';
          document.getElementById('timeRange').value = state.schedule.timeRange || 7;
          document.getElementById('enabled').checked = state.schedule.enabled;
        }
      }

      // Cron presets
      document.querySelectorAll('.pill[data-cron]').forEach(pill => {
        pill.addEventListener('click', () => {
          document.getElementById('cron').value = pill.dataset.cron;
        });
      });

      // Save
      document.getElementById('saveBtn').addEventListener('click', () => {
        const name = document.getElementById('name').value;
        const cron = document.getElementById('cron').value;
        const branch = document.getElementById('branch').value;
        const timeRange = parseInt(document.getElementById('timeRange').value);
        const enabled = document.getElementById('enabled').checked;

        if (!name || !cron) {
          return; // Add validation UI later
        }

        vscode.postMessage({
          type: 'saveSchedule',
          payload: {
            name,
            cron,
            branch,
            timeRange,
            enabled
          }
        });
      });

      // Cancel
      document.getElementById('cancelBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'cancel' });
      });
    `;
  }

  public dispose(): void {
    SchedulePanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
