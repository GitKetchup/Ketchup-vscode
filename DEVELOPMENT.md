# Ketchup VS Code Extension - Development Guide

## Prerequisites

- Node.js 20.x or higher
- npm or yarn
- VS Code 1.85.0 or higher
- Git

## Project Structure

```
ketchup-vscode/
├── src/
│   ├── extension.ts           # Main entry point, activation logic
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces & types
│   ├── api/
│   │   └── KetchupApiClient.ts # Cloud API client
│   ├── git/
│   │   └── GitService.ts      # Git operations & parsing
│   ├── views/
│   │   ├── RecapsTreeProvider.ts
│   │   └── SchedulesTreeProvider.ts
│   └── webviews/
│       ├── DraftRecapPanel.ts
│       └── RecapDetailPanel.ts
├── media/                     # Icons and images
├── dist/                      # Compiled output
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
└── README.md                  # User documentation
```

## Setup

### 1. Install Dependencies

```bash
cd ketchup-vscode
npm install
```

### 2. Configure Environment

The extension uses these configuration values (can be changed in VS Code settings):

- `ketchup.apiUrl` - API endpoint (default: https://app.gitketchup.com)
- `ketchup.mode` - Operation mode (cloud/local/mixed)
- `ketchup.defaultTimeRange` - Default days for recaps (7/14/30)
- `ketchup.autoRefresh` - Auto-refresh on startup (boolean)

### 3. Compile TypeScript

```bash
# One-time compile
npm run compile

# Watch mode (recommended for development)
npm run watch
```

### 4. Run the Extension

1. Open the project in VS Code
2. Press `F5` or go to Run → Start Debugging
3. A new "Extension Development Host" window will open
4. Open a git repository in that window
5. Click the Ketchup icon in the Activity Bar

## Development Workflow

### Running Locally

```bash
# Terminal 1: Watch TypeScript compilation
npm run watch

# Terminal 2: Press F5 in VS Code to launch Extension Host
```

### Testing Changes

1. Make changes to source files in `src/`
2. TypeScript will auto-compile (if watch is running)
3. In the Extension Development Host window:
   - Press `Cmd/Ctrl + R` to reload the window
   - Or use Developer: Reload Window from Command Palette

### Debugging

- Set breakpoints in TypeScript files (`.ts`)
- Use VS Code's Debug Console
- Check Extension Host Developer Tools (Help → Toggle Developer Tools)

### Webview Development

Webviews are defined inline in the TypeScript files:

- `DraftRecapPanel.ts` - Draft recap modal
- `RecapDetailPanel.ts` - Recap detail viewer

To edit webview UI:
1. Edit `getHtmlContent()` and `getStyles()` methods
2. Reload extension host window
3. Re-open the webview panel

**Pro tip**: Use `retainContextWhenHidden: true` in webview options to keep state during development.

## Architecture

### Extension Lifecycle

```
1. activate() called when VS Code starts or workspace opens
2. Register commands, tree providers, webviews
3. Check authentication state
4. Auto-refresh if enabled
5. Listen for URI callback (OAuth)
```

### Authentication Flow

```
User → Command: "Connect Workspace"
  ↓
Extension → Open browser: app.gitketchup.com/vscode/auth
  ↓
User authenticates in browser
  ↓
Browser → Redirect: vscode://ketchup.ketchup-vscode/auth/callback?code=xxx
  ↓
Extension → Exchange code for token via API
  ↓
Extension → Store token in SecretStorage
  ↓
Extension → Fetch repos, refresh tree views
```

### Draft Recap Flow

```
User → Click "Draft Recap"
  ↓
Extension → Check auth & repo connection
  ↓
Extension → Open DraftRecapPanel webview
  ↓
Webview → Request commits from extension
  ↓
Extension → GitService.getCommits() or API.getCommits()
  ↓
Extension → Send commits to webview
  ↓
User → Select commits, click "Generate"
  ↓
Webview → Message extension with selection
  ↓
Extension → API.createRecap()
  ↓
Extension → Poll API.getRecap() until status = READY
  ↓
Extension → Show success, refresh tree view
```

## API Integration

### Base URL

Default: `https://app.gitketchup.com`
Configurable via `ketchup.apiUrl` setting

### Endpoints Used

```typescript
// Auth
POST /v1/auth/vscode/callback
POST /v1/auth/refresh

// Repos
GET  /v1/repos/lookup?remoteUrl=...
GET  /v1/repos
GET  /v1/repos/:id

// Recaps
GET  /v1/recaps?repositoryId=...
GET  /v1/recaps/:id
POST /v1/recaps

// Commits
POST /api/github/commits

// Assets
GET  /v1/recaps/:id/assets
POST /v1/recaps/:id/assets
GET  /v1/assets/:id

// Schedules
GET  /v1/schedules?repositoryId=...
POST /v1/schedules/:id/trigger
```

### Authentication

- Bearer token stored in VS Code SecretStorage
- Automatically added to requests via axios interceptor
- Auto-refreshes on 401 responses
- Logout clears tokens and prompts re-auth

## Building for Production

### 1. Compile

```bash
npm run compile
```

### 2. Package

```bash
npm run package
# Creates: ketchup-vscode-0.1.0.vsix
```

### 3. Test VSIX

```bash
code --install-extension ketchup-vscode-0.1.0.vsix
```

### 4. Publish to Marketplace

```bash
# First time: Create publisher
vsce create-publisher your-publisher-name

# Login
vsce login your-publisher-name

# Publish
npm run deploy
```

## Adding New Features

### Adding a Command

1. **Register in package.json**:
```json
{
  "contributes": {
    "commands": [
      {
        "command": "ketchup.myNewCommand",
        "title": "Ketchup: My New Command",
        "icon": "$(icon-name)"
      }
    ]
  }
}
```

2. **Register handler in extension.ts**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('ketchup.myNewCommand', async () => {
    // Your logic here
  })
);
```

### Adding a Webview

1. Create new file: `src/webviews/MyPanel.ts`
2. Follow pattern from `DraftRecapPanel.ts`
3. Key methods:
   - `static render()` - Create/show panel
   - `getHtmlContent()` - Return HTML string
   - `getStyles()` - Return CSS string
   - Message handlers for webview ↔ extension communication

### Adding API Methods

1. Add types to `src/types/index.ts`
2. Add method to `KetchupApiClient.ts`:
```typescript
async getMyResource(id: string): Promise<MyResource> {
  const response = await this.axios.get<MyResource>(`/v1/my-resources/${id}`);
  return response.data;
}
```

## Design Guidelines

### Colors (Match webapp)

```css
--ketchup-red: #5C1C1C;
--ketchup-bright: #8B4049;
--ketchup-dark: #3A0F0F;
--ketchup-glow: #D4A574;
--ketchup-gold: #E8B863;

--bg-dark: #08080A;
--bg-card: #0F0F12;
--bg-elevated: #161619;
--bg-surface: #1C1C20;

--text-primary: #FAFAFA;
--text-secondary: #A0A0A8;
--text-muted: #5C5C66;
```

### Typography

- Font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
- Headings: 700 weight
- Body: 400-500 weight
- Labels: 11px, uppercase, 700 weight, letter-spacing: 0.05em

### Components

- **Cards**: `background: #0F0F12`, `border: 1px solid #5C5C66`, `border-radius: 12px`
- **Pills/Buttons**: `border-radius: 8px`, ketchup-bright on active
- **Icons**: Use VS Code codicons or emoji
- **Spacing**: 8px base unit (8, 16, 24, 32)

## Troubleshooting

### Extension won't activate
- Check Extension Host console (Help → Toggle Developer Tools)
- Verify `package.json` activationEvents
- Ensure workspace has .git folder

### API calls failing
- Check network tab in Extension Host DevTools
- Verify API URL in settings
- Check token in SecretStorage (use VS Code API to read)

### Webview not updating
- Hard reload: Cmd/Ctrl + R in Extension Host window
- Check webview HTML in DevTools
- Verify message passing with console.log()

### Git operations failing
- Ensure workspace is a git repo
- Check git remote exists: `git remote -v`
- Verify simple-git version compatibility

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [TreeView API](https://code.visualstudio.com/api/extension-guides/tree-view)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/ketchup-vscode/issues)
- Docs: [docs.gitketchup.com](https://docs.gitketchup.com)
- Discord: [Join community](https://discord.gg/ketchup)
