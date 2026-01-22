# Contributing to Ketchup VSCode Extension

Thank you for your interest in contributing! This guide will help you get started.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ketchup-dev/ketchup.git
cd ketchup/ketchup-vscode

# Install dependencies
npm install

# Run in debug mode
# Press F5 in VS Code to launch Extension Development Host
```

## Development

### Project Structure

```
src/
├── extension.ts           # Entry point
├── auth/
│   └── AuthProvider.ts    # OAuth authentication
├── api/
│   └── KetchupClient.ts   # API client
├── sidepanel/
│   └── SidepanelProvider.ts  # Webview UI
└── commands/
    └── recap.ts           # Command implementations
```

### Adding a New Command

1. **Register command in package.json**:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "ketchup.myCommand",
        "title": "Ketchup: My Command"
      }
    ]
  }
}
```

2. **Implement in src/commands/**:

```typescript
// src/commands/myCommand.ts
import * as vscode from 'vscode';

export async function myCommand() {
  // Implementation
  vscode.window.showInformationMessage('Hello from my command!');
}
```

3. **Register in extension.ts**:

```typescript
import { myCommand } from './commands/myCommand';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ketchup.myCommand', myCommand)
  );
}
```

### Testing

```bash
# Run tests
npm test

# Test in Extension Development Host
# Press F5 in VS Code
```

### Building

```bash
# Compile TypeScript
npm run compile

# Package extension
npm install -g @vscode/vsce
vsce package
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Make** your changes
4. **Add tests** for new functionality
5. **Run tests**: `npm test`
6. **Run linter**: `npm run lint`
7. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add new command"
   ```
8. **Push** to your fork
9. **Open** a Pull Request

## Commit Convention

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

## Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [VSCode Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Ketchup Development Guide](../ketchup-webapp/DEVELOPMENT.md)

## Need Help?

- 📖 [Documentation](https://docs.gitketchup.com)
- 💬 [Discord](https://discord.gg/ketchup)
- 📧 [Email](mailto:support@gitketchup.com)
