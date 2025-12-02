# Ketchup VS Code Extension - Quick Start

## Installation & First Recap in 5 Minutes

### Step 1: Install Dependencies (1 min)

```bash
cd ketchup-vscode
npm install
```

### Step 2: Start Development Mode (30 sec)

```bash
# Terminal 1: Compile TypeScript
npm run watch
```

Then in VS Code:
- Press `F5` or Run → Start Debugging
- A new "Extension Development Host" window opens

### Step 3: Test in Development Host (2 min)

In the new window:

1. **Open a Git Repository**
   - File → Open Folder
   - Choose any git repo (or use ketchup-webapp)

2. **Click the Ketchup Icon**
   - Activity Bar (left sidebar)
   - Icon should appear at bottom

3. **Connect**
   - Click "Not connected" or run Command: `Ketchup: Connect Workspace`
   - Browser opens for authentication
   - Log in to your Ketchup account
   - Should see "Successfully connected!"

4. **Create First Recap**
   - Click `+` icon in Recaps view
   - Select "Last 7 Days"
   - Click "Generate Recap"
   - Wait ~30-60 seconds
   - View your recap!

### Step 4: Make a Change (1 min)

1. Edit `src/extension.ts`:
```typescript
// Change welcome message
vscode.window.showInformationMessage(
  'Welcome to Ketchup! 🎬 Your custom message here.',
  'Get Started'
);
```

2. In Extension Development Host window:
   - Press `Cmd/Ctrl + R` to reload
   - Or Command Palette → Developer: Reload Window

3. Close and reopen the workspace to see new message

## Common Development Tasks

### View Debug Logs

```typescript
// In extension.ts or any file
console.log('Debug info:', someVariable);

// In webview HTML
console.log('Webview debug:', data);
```

Then check:
- Extension Host: Help → Toggle Developer Tools → Console
- Webview: Right-click webview → Inspect Element → Console

### Test API Calls

```typescript
// In extension.ts
const repos = await apiClient.getRepositories();
console.log('User repos:', repos);
```

### Update Webview UI

```typescript
// In DraftRecapPanel.ts, edit getStyles()
.btn-primary {
  background: #D4A574; // Try different color
}
```

Reload extension host to see changes.

### Test Commands

1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Type "Ketchup:"
3. See all available commands
4. Test each one

## Troubleshooting

### "Extension not activating"
- Check you opened a workspace with .git folder
- View Extension Host console for errors
- Verify `activationEvents` in package.json

### "Cannot find module"
- Run `npm install` again
- Check `tsconfig.json` paths
- Restart VS Code

### "API calls return 401"
- Clear saved tokens:
  ```typescript
  // In Extension Host Debug Console:
  await context.secrets.delete('ketchup.accessToken');
  await context.secrets.delete('ketchup.refreshToken');
  ```
- Reconnect via `Ketchup: Connect Workspace`

### "Webview blank/not loading"
- Check webview HTML in DevTools
- Verify `enableScripts: true` in webview options
- Check console for CSP errors

## Next Steps

1. **Read DEVELOPMENT.md** - Full development guide
2. **Explore `src/` files** - Understand architecture
3. **Try adding a feature** - Start small (e.g., new setting)
4. **Review webapp code** - Match design patterns
5. **Test with real repos** - Try different scenarios

## Quick Reference

### File Structure
```
src/
├── extension.ts          # Start here
├── api/                  # API calls
├── git/                  # Git operations
├── views/                # Sidebar trees
└── webviews/             # Modal panels
```

### Key Commands (during development)
- `F5` - Launch extension host
- `Cmd/Ctrl + R` - Reload extension host
- `Cmd/Ctrl + Shift + P` - Command palette
- `Cmd/Ctrl + Shift + D` - Debug view

### Environment
- Extension runs in: **Extension Host** (separate VS Code instance)
- Webviews run in: **Iframe** (sandboxed HTML/CSS/JS)
- API calls: **axios** (see KetchupApiClient.ts)
- Git operations: **simple-git** (see GitService.ts)

## Getting Help

- **Discord**: [discord.gg/ketchup](https://discord.gg/ketchup)
- **Docs**: [docs.gitketchup.com](https://docs.gitketchup.com)
- **Issues**: GitHub Issues tab

---

**You're ready to build! 🚀**

If you get stuck, remember:
1. Check the console
2. Read the error message
3. Search VS Code Extension API docs
4. Ask in Discord

Happy coding! 🎬
