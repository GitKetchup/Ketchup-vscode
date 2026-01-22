# Ketchup for VS Code

Transform your git commits into cinematic story recaps directly from VS Code. Connect your repository, select commits, and let Ketchup's AI craft narrative updates complete with video recaps, changelogs, and social media posts.

![Ketchup](https://gitketchup.com/images/hero.png)

## Features

### 🎬 Draft Recaps from Your Editor
- Select time ranges (last 7, 14, or 30 days)
- Filter by contributors
- Cherry-pick specific commits
- Preview activity snapshots before generating

### 📖 View Story Points
- AI-generated narrative summaries of your changes
- Automatic risk assessment (Low/Medium/High)
- Categorized by type (Feature, Fix, Refactor, etc.)
- Full commit history included

### 🎨 Generate Assets
Create multiple content types from a single recap:
- **Audio Recaps** - AI-narrated summaries
- **Video Recaps** - Cinematic visualizations with Veo
- **Changelogs** - Markdown-formatted release notes
- **Social Posts** - Ready-to-share X and LinkedIn updates
- **Visual Assets** - Custom graphics and banners

### ⏰ Manage Schedules
- View your automated recap schedules
- Trigger manual runs
- Quick access to edit in the web app

### 🔐 Privacy First
- **Cloud Mode (Default)**: Sends commit metadata and SHAs to Ketchup cloud
- **Local Mode (Coming Soon)**: Keep everything on your machine
- Never uploads your entire repository
- Respects .gitignore patterns

## Getting Started

### 1. Install the Extension
Search for "Ketchup" in the VS Code marketplace or install from [here](https://marketplace.visualstudio.com/items?itemName=ketchup.ketchup-vscode).

### 2. Connect Your Repository
1. Open a git repository in VS Code
2. Click the Ketchup icon in the Activity Bar
3. Click "Connect to Ketchup" or run `Ketchup: Connect Workspace`
4. Authenticate with your Ketchup account
5. Add your repository to Ketchup (if not already connected)

### 3. Create Your First Recap
1. Click the `+` icon in the Recaps view or run `Ketchup: Draft Recap`
2. Select a time range
3. Review and select commits
4. Click "Generate Recap"
5. Wait for AI processing (usually 30-60 seconds)
6. View your story recap!

## Commands

Access these via the Command Palette (`Cmd/Ctrl + Shift + P`):

- `Ketchup: Connect Workspace` - Authenticate and connect your repository
- `Ketchup: Draft Recap` - Start creating a new recap
- `Ketchup: View Recap` - Open a recap in detail view
- `Ketchup: Refresh Recaps` - Reload the recaps list
- `Ketchup: Open in Browser` - View recap on Ketchup web app
- `Ketchup: Logout` - Sign out of your Ketchup account

## Configuration

Customize Ketchup in your VS Code settings:

```jsonc
{
  // API endpoint (for self-hosted instances)
  "ketchup.apiUrl": "https://app.gitketchup.com",

  // Operation mode
  "ketchup.mode": "cloud", // "cloud" | "local" | "mixed"

  // Default time range for drafts (in days)
  "ketchup.defaultTimeRange": 7, // 7 | 14 | 30

  // Auto-refresh recaps on startup
  "ketchup.autoRefresh": true
}
```

## How It Works

### Architecture

```
┌─────────────────┐
│   VS Code       │
│   Extension     │
└────────┬────────┘
         │
         │ REST API
         │
┌────────▼────────┐
│  Ketchup Cloud  │
│  ┌───────────┐  │
│  │ Story     │  │
│  │ Generator │  │
│  └───────────┘  │
│  ┌───────────┐  │
│  │ Asset     │  │
│  │ Pipeline  │  │
│  └───────────┘  │
└─────────────────┘
```

1. **Local Git Detection**: Extension reads your repository metadata and commit history
2. **Cloud Sync**: Sends commit SHAs and metadata to Ketchup (not your full code)
3. **AI Processing**: GPT-4 analyzes commits and generates narrative story points
4. **Asset Generation**: Creates videos (Veo), audio (ElevenLabs), and text content
5. **Real-time Updates**: Extension polls for completion and displays results

### What Data is Sent?

**Cloud Mode (Default)**:
- Repository remote URL
- Commit SHAs (hashes)
- Commit messages
- Author names and emails
- Commit dates and metadata
- Optionally: diffs (if you enable it)

**What is NOT sent**:
- Your full repository code
- Files in .gitignore
- Secrets or credentials
- Uncommitted changes

## Requirements

- VS Code 1.85.0 or higher
- Active git repository
- Ketchup account (free tier available)
- Internet connection (for cloud mode)

## Extension Settings

This extension contributes the following settings:

* `ketchup.apiUrl`: Set custom API endpoint
* `ketchup.mode`: Choose operation mode (cloud/local/mixed)
* `ketchup.defaultTimeRange`: Default days for recap drafts
* `ketchup.autoRefresh`: Auto-refresh recaps on startup

## Known Issues

- OAuth callback may require manual browser navigation on some systems
- Large commit histories (>500 commits) may take longer to load
- Asset generation times vary based on queue load

## Roadmap

- [ ] Local-only mode with on-premise LLM support
- [ ] Inline commit annotations with AI summaries
- [ ] Quick recap command for current branch
- [ ] Diff viewer with story context
- [ ] Multi-repository workspace support
- [ ] Custom story templates
- [ ] Team collaboration features

## Support

- **Documentation**: [docs.gitketchup.com](https://docs.gitketchup.com)
- **Issues**: [GitHub Issues](https://github.com/yourusername/ketchup-vscode/issues)
- **Discord**: [Join our community](https://discord.gg/ketchup)
- **Email**: support@gitketchup.com

## Privacy & Security

Ketchup takes your privacy seriously:

- 🔒 OAuth 2.0 authentication
- 🛡️ Encrypted data transmission (HTTPS/TLS)
- 🔐 Secrets stored in VS Code's SecretStorage
- 🚫 No code indexing or permanent storage
- 📜 GDPR compliant
- 🗑️ Right to deletion

See our [Privacy Policy](https://gitketchup.com/privacy) for full details.

## Contributing

We welcome contributions!

**Quick Start:**
```bash
git clone https://github.com/ketchup-dev/ketchup.git
cd ketchup/ketchup-vscode
npm install
# Press F5 to launch Extension Development Host
```

**Resources:**
- [CONTRIBUTING.md](CONTRIBUTING.md) - Detailed contribution guidelines
- [DEVELOPMENT.md](../ketchup-webapp/DEVELOPMENT.md#3️⃣-vscode-extension-development) - Complete development guide
- [VSCode Extension API](https://code.visualstudio.com/api) - Official VS Code docs

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ by the Ketchup team**

[Website](https://gitketchup.com) • [Twitter](https://twitter.com/ketchupdev) • [Discord](https://discord.gg/ketchup)
