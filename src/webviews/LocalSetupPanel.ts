import * as vscode from 'vscode';
import * as os from 'os';
import { LocalEngineClient } from '../api/LocalEngineClient';

/**
 * LocalSetupPanel - Onboarding wizard for local mode setup
 * 
 * Guides users through:
 * 1. Pre-flight checks (detect Ollama/LM Studio)
 * 2. Model recommendations based on system RAM
 * 3. Auto-pull suggested models
 * 4. Test connection before enabling
 */
export class LocalSetupPanel {
  public static currentPanel: LocalSetupPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly localClient: LocalEngineClient;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.context = context;
    this.localClient = LocalEngineClient.getInstance(context);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'init':
            await this.handleInit();
            break;
          case 'checkOllama':
            await this.handleCheckOllama();
            break;
          case 'checkLMStudio':
            await this.handleCheckLMStudio();
            break;
          case 'installBinary':
            await this.handleInstallBinary();
            break;
          case 'pullModel':
            await this.handlePullModel(message.payload.model);
            break;
          case 'testConnection':
            await this.handleTestConnection(message.payload);
            break;
          case 'saveSettings':
            await this.handleSaveSettings(message.payload);
            break;
          case 'openOllamaDownload':
            vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai/download'));
            break;
          case 'openLMStudioDownload':
            vscode.env.openExternal(vscode.Uri.parse('https://lmstudio.ai'));
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static async render(context: vscode.ExtensionContext): Promise<void> {
    if (LocalSetupPanel.currentPanel) {
      LocalSetupPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ketchupLocalSetup',
      'Ketchup Local Mode Setup',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    LocalSetupPanel.currentPanel = new LocalSetupPanel(panel, context);
  }

  private dispose(): void {
    LocalSetupPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  private async handleInit(): Promise<void> {
    const systemRam = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const platform = os.platform();
    const arch = os.arch();

    // Check for existing LLM providers
    const ollamaAvailable = await this.localClient.isOllamaAvailable();
    const lmStudioAvailable = await this.localClient.isLMStudioAvailable();

    // Check if binary is installed
    const binaryInstalled = await this.localClient.isBinaryInstalled();
    const binaryVersion = await this.localClient.getInstalledVersion();

    // Get model recommendations
    let recommendations: any[] = [];
    try {
      recommendations = await this.localClient.getModelRecommendations(systemRam);
    } catch {
      // If engine not running, provide static recommendations
      recommendations = this.getStaticRecommendations(systemRam);
    }

    this.panel.webview.postMessage({
      type: 'initData',
      payload: {
        systemRam,
        platform,
        arch,
        ollamaAvailable,
        lmStudioAvailable,
        binaryInstalled,
        binaryVersion,
        recommendations,
      },
    });
  }

  private getStaticRecommendations(ramGb: number): any[] {
    const all = [
      {
        model_id: 'llama3.2:1b',
        display_name: 'Llama 3.2 1B',
        min_ram_gb: 4,
        quality_tier: 'basic',
        description: 'Fast but limited. Good for quick summaries only.',
        pull_command: 'ollama pull llama3.2:1b',
      },
      {
        model_id: 'llama3.2:3b',
        display_name: 'Llama 3.2 3B',
        min_ram_gb: 8,
        quality_tier: 'basic',
        description: 'Balanced speed and quality for basic recaps.',
        pull_command: 'ollama pull llama3.2:3b',
      },
      {
        model_id: 'qwen2.5-coder:7b',
        display_name: 'Qwen 2.5 Coder 7B',
        min_ram_gb: 12,
        quality_tier: 'standard',
        description: 'Excellent for code understanding. Recommended for most users.',
        pull_command: 'ollama pull qwen2.5-coder:7b',
      },
      {
        model_id: 'deepseek-coder-v2:16b',
        display_name: 'DeepSeek Coder V2 16B',
        min_ram_gb: 24,
        quality_tier: 'premium',
        description: 'Best local quality. Requires powerful hardware.',
        pull_command: 'ollama pull deepseek-coder-v2:16b',
      },
    ];

    return all.filter(m => m.min_ram_gb <= ramGb);
  }

  private async handleCheckOllama(): Promise<void> {
    const available = await this.localClient.isOllamaAvailable();
    this.panel.webview.postMessage({
      type: 'ollamaStatus',
      payload: { available },
    });
  }

  private async handleCheckLMStudio(): Promise<void> {
    const available = await this.localClient.isLMStudioAvailable();
    this.panel.webview.postMessage({
      type: 'lmStudioStatus',
      payload: { available },
    });
  }

  private async handleInstallBinary(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Installing Ketchup Local Engine...',
          cancellable: false,
        },
        async (progress) => {
          await this.localClient.ensureBinaryInstalled(progress);
        }
      );

      const version = await this.localClient.getInstalledVersion();
      this.panel.webview.postMessage({
        type: 'binaryInstalled',
        payload: { success: true, version },
      });
    } catch (error: any) {
      this.panel.webview.postMessage({
        type: 'binaryInstalled',
        payload: { success: false, error: error.message },
      });
    }
  }

  private async handlePullModel(modelId: string): Promise<void> {
    // Open terminal to run ollama pull
    const terminal = vscode.window.createTerminal('Ketchup Model Setup');
    terminal.show();
    terminal.sendText(`ollama pull ${modelId}`);

    this.panel.webview.postMessage({
      type: 'modelPullStarted',
      payload: { model: modelId },
    });
  }

  private async handleTestConnection(payload: { endpoint: string; model: string }): Promise<void> {
    try {
      // Start the local engine if not running
      await this.localClient.ensureBinaryInstalled();
      await this.localClient.start();

      const health = await this.localClient.checkHealth();

      this.panel.webview.postMessage({
        type: 'connectionTest',
        payload: {
          success: health.healthy,
          models: health.models || [],
          modelCount: health.model_count || 0,
          error: health.error,
        },
      });
    } catch (error: any) {
      this.panel.webview.postMessage({
        type: 'connectionTest',
        payload: {
          success: false,
          error: error.message,
        },
      });
    }
  }

  private async handleSaveSettings(payload: {
    mode: 'local' | 'mixed';
    endpoint: string;
    model: string;
  }): Promise<void> {
    const config = vscode.workspace.getConfiguration('ketchup');

    await config.update('mode', payload.mode, vscode.ConfigurationTarget.Global);
    await config.update('localLlmEndpoint', payload.endpoint, vscode.ConfigurationTarget.Global);
    await config.update('localModel', payload.model, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(
      `Ketchup Local Mode enabled! Using ${payload.model} at ${payload.endpoint}`
    );

    this.panel.dispose();
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ketchup Local Mode Setup</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>🍅 Ketchup Local Mode</h1>
      <p class="subtitle">Run code intelligence 100% on your machine</p>
    </header>

    <!-- Step 1: System Check -->
    <section class="step" id="step1">
      <div class="step-header">
        <span class="step-number">1</span>
        <h2>System Check</h2>
      </div>
      <div class="step-content">
        <div class="system-info" id="systemInfo">
          <div class="info-row">
            <span class="label">RAM:</span>
            <span class="value" id="ramValue">Checking...</span>
          </div>
          <div class="info-row">
            <span class="label">Platform:</span>
            <span class="value" id="platformValue">Checking...</span>
          </div>
          <div class="info-row">
            <span class="label">Engine:</span>
            <span class="value" id="engineValue">Checking...</span>
          </div>
        </div>

        <div class="provider-checks">
          <div class="provider" id="ollamaCheck">
            <span class="status-icon">⏳</span>
            <span class="provider-name">Ollama</span>
            <span class="provider-status" id="ollamaStatus">Checking...</span>
            <button class="btn-small" id="ollamaDownload" style="display:none;">Download</button>
          </div>
          <div class="provider" id="lmStudioCheck">
            <span class="status-icon">⏳</span>
            <span class="provider-name">LM Studio</span>
            <span class="provider-status" id="lmStudioStatus">Checking...</span>
            <button class="btn-small" id="lmStudioDownload" style="display:none;">Download</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Step 2: Model Selection -->
    <section class="step" id="step2">
      <div class="step-header">
        <span class="step-number">2</span>
        <h2>Choose a Model</h2>
      </div>
      
      <div class="quality-notice">
        <strong>⚠️ Quality Notice:</strong> Local models produce lower quality recaps than cloud.
        For the best experience, we recommend:
        <ul>
          <li>Using a <strong>7B+ parameter model</strong> for standard quality</li>
          <li>Using <strong>16B+</strong> for near-cloud quality</li>
          <li>Or connect your own trusted inference endpoint</li>
        </ul>
      </div>

      <div class="step-content">
        <div class="models-grid" id="modelsGrid">
          <div class="loading">Loading recommendations...</div>
        </div>
      </div>
    </section>

    <!-- Step 3: Configuration -->
    <section class="step" id="step3">
      <div class="step-header">
        <span class="step-number">3</span>
        <h2>Configure Endpoint</h2>
      </div>
      <div class="step-content">
        <div class="form-group">
          <label for="modeSelect">Mode</label>
          <select id="modeSelect">
            <option value="local">Local (100% on-device)</option>
            <option value="mixed">Mixed (Local analytics, Cloud assets)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="endpointInput">LLM Endpoint</label>
          <input type="text" id="endpointInput" value="http://localhost:11434/v1" placeholder="http://localhost:11434/v1">
          <small>Ollama, LM Studio, or any OpenAI-compatible endpoint</small>
        </div>

        <div class="form-group">
          <label for="modelInput">Model</label>
          <input type="text" id="modelInput" value="llama3.2" placeholder="llama3.2">
          <small>Will be used for local recap generation</small>
        </div>

        <div class="custom-endpoint-hint">
          <strong>💡 Pro Tip:</strong> You can use any OpenAI-compatible endpoint:
          <ul>
            <li>Together.ai: <code>https://api.together.xyz/v1</code></li>
            <li>Groq: <code>https://api.groq.com/openai/v1</code></li>
            <li>Your own server: <code>http://your-server:8000/v1</code></li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Step 4: Test & Enable -->
    <section class="step" id="step4">
      <div class="step-header">
        <span class="step-number">4</span>
        <h2>Test & Enable</h2>
      </div>
      <div class="step-content">
        <div class="test-result" id="testResult" style="display:none;">
          <span class="test-icon"></span>
          <span class="test-message"></span>
        </div>

        <div class="actions">
          <button class="btn-secondary" id="testBtn">Test Connection</button>
          <button class="btn-primary" id="enableBtn" disabled>Enable Local Mode</button>
        </div>
      </div>
    </section>
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
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #08080A;
        color: #FAFAFA;
        line-height: 1.6;
      }

      .container {
        max-width: 700px;
        margin: 0 auto;
        padding: 32px 24px;
      }

      .header {
        text-align: center;
        margin-bottom: 40px;
      }

      .header h1 {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .subtitle {
        color: #A0A0A8;
        font-size: 16px;
      }

      .step {
        background: #0F0F12;
        border: 1px solid #2A2A2E;
        border-radius: 12px;
        margin-bottom: 24px;
        overflow: hidden;
      }

      .step-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: #161619;
        border-bottom: 1px solid #2A2A2E;
      }

      .step-number {
        width: 28px;
        height: 28px;
        background: #8B4049;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 600;
      }

      .step-header h2 {
        font-size: 16px;
        font-weight: 600;
      }

      .step-content {
        padding: 20px;
      }

      .system-info {
        background: #08080A;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #2A2A2E;
      }

      .info-row:last-child {
        border-bottom: none;
      }

      .label {
        color: #A0A0A8;
      }

      .value {
        font-weight: 500;
      }

      .provider-checks {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .provider {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #08080A;
        border-radius: 8px;
      }

      .status-icon {
        font-size: 18px;
      }

      .provider-name {
        font-weight: 500;
        flex: 1;
      }

      .provider-status {
        color: #A0A0A8;
        font-size: 14px;
      }

      .quality-notice {
        background: linear-gradient(135deg, rgba(139, 64, 73, 0.15), rgba(139, 64, 73, 0.05));
        border: 1px solid rgba(139, 64, 73, 0.3);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        font-size: 14px;
      }

      .quality-notice ul {
        margin-top: 8px;
        margin-left: 20px;
      }

      .custom-endpoint-hint {
        background: #161619;
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
        font-size: 13px;
      }

      .custom-endpoint-hint code {
        background: #08080A;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
      }

      .custom-endpoint-hint ul {
        margin-top: 8px;
        margin-left: 20px;
      }

      .models-grid {
        display: grid;
        gap: 12px;
      }

      .model-card {
        background: #08080A;
        border: 1px solid #2A2A2E;
        border-radius: 8px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .model-card:hover {
        border-color: #8B4049;
      }

      .model-card.selected {
        border-color: #8B4049;
        background: rgba(139, 64, 73, 0.1);
      }

      .model-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .model-name {
        font-weight: 600;
      }

      .model-tier {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .tier-basic { background: #3a3a3e; color: #a0a0a8; }
      .tier-standard { background: #4a4a2e; color: #e8b863; }
      .tier-premium { background: #2a4a2e; color: #6ace6a; }

      .model-desc {
        font-size: 13px;
        color: #A0A0A8;
        margin-bottom: 12px;
      }

      .model-actions {
        display: flex;
        gap: 8px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: #A0A0A8;
        margin-bottom: 8px;
      }

      .form-group input,
      .form-group select {
        width: 100%;
        padding: 12px;
        background: #08080A;
        border: 1px solid #2A2A2E;
        border-radius: 8px;
        color: #FAFAFA;
        font-size: 14px;
      }

      .form-group small {
        display: block;
        margin-top: 4px;
        color: #5C5C66;
        font-size: 12px;
      }

      .actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 16px;
      }

      .btn-small {
        padding: 4px 12px;
        font-size: 12px;
        background: #8B4049;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }

      .btn-secondary {
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 500;
        background: transparent;
        border: 1px solid #5C5C66;
        border-radius: 8px;
        color: #FAFAFA;
        cursor: pointer;
      }

      .btn-primary {
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 600;
        background: #8B4049;
        border: none;
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
      }

      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .test-result {
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .test-result.success {
        background: rgba(106, 206, 106, 0.1);
        border: 1px solid rgba(106, 206, 106, 0.3);
      }

      .test-result.error {
        background: rgba(206, 106, 106, 0.1);
        border: 1px solid rgba(206, 106, 106, 0.3);
      }

      .loading {
        text-align: center;
        padding: 32px;
        color: #A0A0A8;
      }
    `;
  }

  private getScript(): string {
    return `
      const vscode = acquireVsCodeApi();

      let state = {
        systemRam: 0,
        ollamaAvailable: false,
        lmStudioAvailable: false,
        selectedModel: null,
        recommendations: [],
      };

      // Initialize
      vscode.postMessage({ type: 'init' });

      // Handle messages
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
          case 'initData':
            handleInitData(message.payload);
            break;
          case 'ollamaStatus':
            updateOllamaStatus(message.payload.available);
            break;
          case 'lmStudioStatus':
            updateLMStudioStatus(message.payload.available);
            break;
          case 'binaryInstalled':
            updateBinaryStatus(message.payload);
            break;
          case 'connectionTest':
            showTestResult(message.payload);
            break;
        }
      });

      function handleInitData(data) {
        state = { ...state, ...data };

        document.getElementById('ramValue').textContent = data.systemRam + ' GB';
        document.getElementById('platformValue').textContent = data.platform + ' (' + data.arch + ')';
        document.getElementById('engineValue').textContent = data.binaryInstalled 
          ? 'v' + data.binaryVersion + ' ✓'
          : 'Not installed';

        updateOllamaStatus(data.ollamaAvailable);
        updateLMStudioStatus(data.lmStudioAvailable);
        renderModels(data.recommendations);
      }

      function updateOllamaStatus(available) {
        state.ollamaAvailable = available;
        const check = document.getElementById('ollamaCheck');
        const status = document.getElementById('ollamaStatus');
        const download = document.getElementById('ollamaDownload');

        check.querySelector('.status-icon').textContent = available ? '✅' : '❌';
        status.textContent = available ? 'Running' : 'Not detected';
        download.style.display = available ? 'none' : 'inline-block';

        if (available) {
          document.getElementById('endpointInput').value = 'http://localhost:11434/v1';
        }
      }

      function updateLMStudioStatus(available) {
        state.lmStudioAvailable = available;
        const check = document.getElementById('lmStudioCheck');
        const status = document.getElementById('lmStudioStatus');
        const download = document.getElementById('lmStudioDownload');

        check.querySelector('.status-icon').textContent = available ? '✅' : '❌';
        status.textContent = available ? 'Running' : 'Not detected';
        download.style.display = available ? 'none' : 'inline-block';

        if (available && !state.ollamaAvailable) {
          document.getElementById('endpointInput').value = 'http://localhost:1234/v1';
        }
      }

      function updateBinaryStatus(result) {
        const engineValue = document.getElementById('engineValue');
        if (result.success) {
          engineValue.textContent = 'v' + result.version + ' ✓';
        } else {
          engineValue.textContent = 'Install failed: ' + result.error;
        }
      }

      function renderModels(recommendations) {
        const grid = document.getElementById('modelsGrid');
        if (!recommendations.length) {
          grid.innerHTML = '<div class="loading">No models found for your system</div>';
          return;
        }

        grid.innerHTML = recommendations.map(model => {
          const tierClass = 'tier-' + model.quality_tier;
          return \`
            <div class="model-card" data-model="\${model.model_id}">
              <div class="model-header">
                <span class="model-name">\${model.display_name}</span>
                <span class="model-tier \${tierClass}">\${model.quality_tier}</span>
              </div>
              <div class="model-desc">\${model.description}</div>
              <div class="model-meta">RAM: \${model.min_ram_gb}GB minimum</div>
              <div class="model-actions">
                <button class="btn-small" onclick="pullModel('\${model.model_id}')">Pull with Ollama</button>
              </div>
            </div>
          \`;
        }).join('');

        // Click to select
        document.querySelectorAll('.model-card').forEach(card => {
          card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.selectedModel = card.dataset.model;
            document.getElementById('modelInput').value = state.selectedModel;
          });
        });
      }

      function pullModel(modelId) {
        vscode.postMessage({ type: 'pullModel', payload: { model: modelId } });
      }

      function showTestResult(result) {
        const testResult = document.getElementById('testResult');
        const enableBtn = document.getElementById('enableBtn');

        testResult.style.display = 'flex';
        testResult.className = 'test-result ' + (result.success ? 'success' : 'error');
        
        if (result.success) {
          testResult.querySelector('.test-icon').textContent = '✅';
          testResult.querySelector('.test-message').textContent = 
            'Connected! Found ' + result.modelCount + ' models.';
          enableBtn.disabled = false;
        } else {
          testResult.querySelector('.test-icon').textContent = '❌';
          testResult.querySelector('.test-message').textContent = 
            'Connection failed: ' + (result.error || 'Unknown error');
          enableBtn.disabled = true;
        }
      }

      // Button handlers
      document.getElementById('ollamaDownload').addEventListener('click', () => {
        vscode.postMessage({ type: 'openOllamaDownload' });
      });

      document.getElementById('lmStudioDownload').addEventListener('click', () => {
        vscode.postMessage({ type: 'openLMStudioDownload' });
      });

      document.getElementById('testBtn').addEventListener('click', () => {
        vscode.postMessage({
          type: 'testConnection',
          payload: {
            endpoint: document.getElementById('endpointInput').value,
            model: document.getElementById('modelInput').value,
          }
        });
      });

      document.getElementById('enableBtn').addEventListener('click', () => {
        vscode.postMessage({
          type: 'saveSettings',
          payload: {
            mode: document.getElementById('modeSelect').value,
            endpoint: document.getElementById('endpointInput').value,
            model: document.getElementById('modelInput').value,
          }
        });
      });
    `;
  }
}
