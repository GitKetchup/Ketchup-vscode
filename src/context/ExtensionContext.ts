import * as vscode from 'vscode';

/**
 * Global extension context manager
 * Provides safe access to context across the extension
 */
class ExtensionContextManager {
  private static instance: ExtensionContextManager;
  private context?: vscode.ExtensionContext;

  private constructor() {}

  static getInstance(): ExtensionContextManager {
    if (!ExtensionContextManager.instance) {
      ExtensionContextManager.instance = new ExtensionContextManager();
    }
    return ExtensionContextManager.instance;
  }

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  getContext(): vscode.ExtensionContext {
    if (!this.context) {
      throw new Error('Extension context not initialized');
    }
    return this.context;
  }

  getSecrets(): vscode.SecretStorage {
    return this.getContext().secrets;
  }

  getGlobalState(): vscode.Memento {
    return this.getContext().globalState;
  }

  getWorkspaceState(): vscode.Memento {
    return this.getContext().workspaceState;
  }
}

export const extensionContext = ExtensionContextManager.getInstance();
