import * as vscode from 'vscode';
import { apiClient } from './api/KetchupApiClient';
import { createGitService } from './git/GitService';
import { RecapsTreeProvider } from './views/RecapsTreeProvider';
import { SchedulesTreeProvider } from './views/SchedulesTreeProvider';
import { DraftRecapPanel } from './webviews/DraftRecapPanel';
import { RecapDetailPanel } from './webviews/RecapDetailPanel';
import { extensionContext } from './context/ExtensionContext';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Ketchup extension is now active');

  // Store context globally for API client access
  extensionContext.setContext(context);

  // Initialize tree providers
  const recapsTreeProvider = new RecapsTreeProvider(context);
  const schedulesTreeProvider = new SchedulesTreeProvider(context);

  // Register tree views
  vscode.window.registerTreeDataProvider('ketchup.recaps', recapsTreeProvider);
  vscode.window.registerTreeDataProvider('ketchup.schedules', schedulesTreeProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.connect', async () => {
      await handleConnect(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.draftRecap', async () => {
      await handleDraftRecap(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.viewRecap', async (recap) => {
      await handleViewRecap(context, recap);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.refreshRecaps', async () => {
      recapsTreeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.openInBrowser', async (recap) => {
      const url = apiClient.getWebUrl(`/repositories/${recap.repositoryId}/recaps/${recap.id}`);
      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.logout', async () => {
      await apiClient.logout();
      vscode.window.showInformationMessage('Logged out of Ketchup');
      recapsTreeProvider.refresh();
      schedulesTreeProvider.refresh();
    })
  );

  // Auto-refresh on startup if enabled
  const config = vscode.workspace.getConfiguration('ketchup');
  if (config.get<boolean>('autoRefresh')) {
    const isAuth = await apiClient.isAuthenticated();
    if (isAuth) {
      recapsTreeProvider.refresh();
      schedulesTreeProvider.refresh();
    }
  }

  // Register URI handler for OAuth callback
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        console.log('[Ketchup] URI handler received:', uri.toString());
        console.log('[Ketchup] URI path:', uri.path);
        console.log('[Ketchup] URI query:', uri.query);

        if (uri.path === '/auth/callback') {
          console.log('[Ketchup] Handling auth callback');
          await handleAuthCallback(uri);
        } else {
          console.log('[Ketchup] Unknown URI path:', uri.path);
          vscode.window.showWarningMessage(`Ketchup received unknown URI: ${uri.path}`);
        }
      },
    })
  );

  // Show welcome message if first time
  const hasShownWelcome = context.globalState.get<boolean>('ketchup.hasShownWelcome');
  if (!hasShownWelcome) {
    const selection = await vscode.window.showInformationMessage(
      'Welcome to Ketchup! Transform your commits into cinematic story recaps.',
      'Get Started',
      'Learn More'
    );

    if (selection === 'Get Started') {
      vscode.commands.executeCommand('ketchup.connect');
    } else if (selection === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://gitketchup.com/docs'));
    }

    context.globalState.update('ketchup.hasShownWelcome', true);
  }
}

/**
 * Handle authentication/connection
 */
async function handleConnect(context: vscode.ExtensionContext) {
  const gitService = createGitService();

  if (!gitService) {
    vscode.window.showErrorMessage('Please open a workspace to use Ketchup');
    return;
  }

  const isGitRepo = await gitService.isGitRepository();
  if (!isGitRepo) {
    vscode.window.showErrorMessage('This workspace is not a Git repository');
    return;
  }

  // Check if already authenticated
  const isAuth = await apiClient.isAuthenticated();
  if (isAuth) {
    // Check if repo is connected
    const remoteUrl = await gitService.getRemoteUrl();
    if (!remoteUrl) {
      vscode.window.showErrorMessage('Could not detect remote URL');
      return;
    }

    const repo = await apiClient.lookupRepository(remoteUrl);
    if (repo) {
      vscode.window.showInformationMessage(`Already connected to ${repo.name}`);
      return;
    }

    // Repo not found, prompt to add
    const selection = await vscode.window.showInformationMessage(
      'This repository is not connected to Ketchup yet.',
      'Connect in Browser'
    );

    if (selection === 'Connect in Browser') {
      const url = apiClient.getWebUrl(`/repos/add?url=${encodeURIComponent(remoteUrl)}`);
      vscode.env.openExternal(vscode.Uri.parse(url));
    }

    return;
  }

  // Not authenticated, start OAuth flow
  await startOAuthFlow();
}

/**
 * Start OAuth authentication flow
 */
async function startOAuthFlow() {
  const authUrl = apiClient.getWebUrl('/vscode/auth');
  const callbackUri = await vscode.env.asExternalUri(
    vscode.Uri.parse('vscode://ketchup.ketchup-vscode/auth/callback')
  );

  const fullAuthUrl = `${authUrl}?redirect_uri=${encodeURIComponent(callbackUri.toString())}`;

  vscode.window.showInformationMessage('Opening browser for authentication...');
  vscode.env.openExternal(vscode.Uri.parse(fullAuthUrl));
}

/**
 * Handle OAuth callback
 */
async function handleAuthCallback(uri: vscode.Uri) {
  const query = new URLSearchParams(uri.query);
  const code = query.get('code');
  const error = query.get('error');

  if (error) {
    vscode.window.showErrorMessage(`Authentication failed: ${error}`);
    return;
  }

  if (!code) {
    vscode.window.showErrorMessage('No authorization code received');
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Authenticating with Ketchup...',
        cancellable: false,
      },
      async () => {
        await apiClient.exchangeCodeForToken(code);
      }
    );

    vscode.window.showInformationMessage('Successfully connected to Ketchup!');
    vscode.commands.executeCommand('ketchup.refreshRecaps');
  } catch (error) {
    vscode.window.showErrorMessage(`Authentication failed: ${error}`);
  }
}

/**
 * Handle draft recap creation
 */
async function handleDraftRecap(context: vscode.ExtensionContext) {
  const gitService = createGitService();

  if (!gitService) {
    vscode.window.showErrorMessage('Please open a workspace to create a recap');
    return;
  }

  const isAuth = await apiClient.isAuthenticated();
  if (!isAuth) {
    const selection = await vscode.window.showInformationMessage(
      'Please connect to Ketchup first',
      'Connect Now'
    );
    if (selection === 'Connect Now') {
      vscode.commands.executeCommand('ketchup.connect');
    }
    return;
  }

  // Get repository
  const remoteUrl = await gitService.getRemoteUrl();
  if (!remoteUrl) {
    vscode.window.showErrorMessage('Could not detect remote URL');
    return;
  }

  const repo = await apiClient.lookupRepository(remoteUrl);
  if (!repo) {
    vscode.window.showWarningMessage(
      'This repository is not connected to Ketchup yet.',
      'Connect in Browser'
    ).then(selection => {
      if (selection === 'Connect in Browser') {
        const url = apiClient.getWebUrl(`/repos/add?url=${encodeURIComponent(remoteUrl)}`);
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    });
    return;
  }

  // Open draft recap panel
  await DraftRecapPanel.render(context, repo, gitService);
}

/**
 * Handle viewing a recap
 */
async function handleViewRecap(context: vscode.ExtensionContext, recap: any) {
  await RecapDetailPanel.render(context, recap.id);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('Ketchup extension deactivated');
}
