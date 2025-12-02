#!/bin/bash
# Ketchup VS Code Extension - Installation Script

set -e

echo "🎬 Ketchup VS Code Extension - Installation"
echo "==========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20.x or higher."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be 20.x or higher. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile
echo "✅ TypeScript compiled successfully"
echo ""

echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Open this project in VS Code: code ."
echo "  2. Press F5 to launch Extension Development Host"
echo "  3. Open a git repository in the new window"
echo "  4. Click the Ketchup icon in the Activity Bar"
echo ""
echo "For detailed instructions, see:"
echo "  - QUICKSTART.md (5-minute guide)"
echo "  - DEVELOPMENT.md (full developer guide)"
echo "  - README.md (user documentation)"
echo ""
echo "Happy coding! 🚀"
