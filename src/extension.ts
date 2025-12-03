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
      const url = apiClient.getWebUrl(`/repositories?url=${encodeURIComponent(remoteUrl)}`);
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
  const scheme = vscode.env.uriScheme;
  const callbackUri = await vscode.env.asExternalUri(
    vscode.Uri.parse(`${scheme}://ketchup.ketchup-vscode/auth/callback`)
  );

  const authUrl = apiClient.getWebUrl('/vscode/auth');
  const fullAuthUrl = `${authUrl}?redirect_uri=${encodeURIComponent(callbackUri.toString())}`;

  const selection = await vscode.window.showInformationMessage(
    'Opening browser for authentication...',
    'Open Browser',
    'Enter Code Manually'
  );

  if (selection === 'Enter Code Manually') {
    const code = await vscode.window.showInputBox({
      prompt: 'Paste the authorization code from the browser',
      placeHolder: 'Paste code here...'
    });
    
    if (code) {
      await handleAuthCode(code);
    }
  } else if (selection === 'Open Browser') {
    vscode.env.openExternal(vscode.Uri.parse(fullAuthUrl));
  } else {
    // Default action if they just closed the notification but didn't click a button
    // We can still open the browser or just do nothing. 
    // Let's open it to be helpful, or wait. 
    // Actually, let's just open it if they didn't explicitly cancel.
    vscode.env.openExternal(vscode.Uri.parse(fullAuthUrl));
  }
}

/**
 * Handle OAuth callback
 */
/**
 * Handle OAuth callback
 */
async function handleAuthCallback(uri: vscode.Uri) {
  // Handle malformed query strings with double ? (e.g. ?windowId=12?code=...)
  // This can happen if the auth server appends ?code= without checking for existing params
  const sanitizedQuery = uri.query.replace(/\?/g, '&');
  const query = new URLSearchParams(sanitizedQuery);
  
  const accessToken = query.get('access_token');
  const refreshToken = query.get('refresh_token');
  const code = query.get('code');
  const error = query.get('error');

  if (error) {
    vscode.window.showErrorMessage(`Authentication failed: ${error}`);
    return;
  }

  if (accessToken && refreshToken) {
    await handleAuthTokens(accessToken, refreshToken);
    return;
  }

  if (code) {
    // Fallback for legacy flow or manual entry
    await handleAuthCode(code);
    return;
  }

  vscode.window.showErrorMessage('No authentication tokens received');
}

/**
 * Handle tokens directly
 */
async function handleAuthTokens(accessToken: string, refreshToken: string) {
  try {
    await apiClient.setSession(accessToken, refreshToken);
    vscode.window.showInformationMessage('Successfully connected to Ketchup!');
    vscode.commands.executeCommand('ketchup.refreshRecaps');
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    vscode.window.showErrorMessage(`Authentication failed: ${message}`);
  }
}

/**
 * Exchange code for token
 */
async function handleAuthCode(code: string) {
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
  } catch (error: any) {
    const message = error.message || JSON.stringify(error);
    vscode.window.showErrorMessage(`Authentication failed: ${message}`);
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
        const url = apiClient.getWebUrl(`/repositories?url=${encodeURIComponent(remoteUrl)}`);
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
