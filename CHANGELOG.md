# Change Log

All notable changes to the Ketchup VS Code extension will be documented in this file.

## [0.2.0] - 2026-01-21 "Intelligence Platform"

### Added
- **Momentum Dashboard**: Visualize team velocity vs complexity with a stunning gauge and trend charts.
- **Code Forensics**: Identify complexity hotspots, security vulnerabilities, and dead code.
- **Skills Graph**: View contributor expertise, bus factor risks, and language distribution.
- **Intelligence Sidebar**: Dedicated view for accessing all intelligence dashboards.
- **Empty State Designs**: Friendly onboarding screens when data is still analyzing.
- **New Icons**: Updated extension and sidebar icons to match the new branding.

### Changed
- **API Client**: Enhanced with full type safety and response caching for intelligence data.
- **Webviews**: Migrated to a unified styling system with dark mode optimization.
- **Performance**: Improved data loading with parallel fetching and better error handling.

## [0.1.0] - 2025-01-15 "MVP"

### Added
- Initial release of Ketchup for VS Code
- OAuth authentication flow
- Repository detection and connection
- Draft recap creation with commit selection
- Time range filters (24h, 7d, 14d, 30d)
- Contributor filtering
- Activity snapshots
- Recap detail viewer with story points
- Asset generation (Audio, Video, Changelog, Social posts)
- Sidebar tree views for recaps and schedules
- Configuration settings
- Auto-refresh on startup
- Open in browser functionality

### Design
- Matches Ketchup web app design language
- Dark theme with Ketchup Red accent color (#8B4049)
- Cinematic UI elements (gradients, glassmorphism)
- Responsive layouts

### Security
- Secure token storage using VS Code SecretStorage
- Automatic token refresh
- HTTPS-only API communication
