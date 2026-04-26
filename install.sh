#!/bin/bash

# Scratchpad Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/viewerofall/GlassPad/main/install.sh | bash

set -e

echo "🚀 Installing Scratchpad..."

# Detect OS and architecture
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Linux)
        if [ "$ARCH" = "x86_64" ]; then
            RELEASE_NAME="scratchpad"
        else
            echo "❌ Unsupported architecture: $ARCH (Linux x86_64 only)"
            exit 1
        fi
        ;;
    *)
        echo "❌ Unsupported OS: $OS (Linux only)"
        exit 1
        ;;
esac

# Get latest release version
REPO="viewerofall/GlassPad"
LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep tag_name | cut -d'"' -f4)

if [ -z "$LATEST_RELEASE" ]; then
    echo "❌ Could not fetch latest release"
    exit 1
fi

echo "📦 Downloading Scratchpad $LATEST_RELEASE..."

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST_RELEASE/$RELEASE_NAME"
TEMP_FILE="/tmp/scratchpad"

curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE"

if [ ! -f "$TEMP_FILE" ]; then
    echo "❌ Download failed"
    exit 1
fi

# Install binary to /usr/local/bin
echo "📍 Installing binary to /usr/local/bin..."
chmod +x "$TEMP_FILE"

# Check if we need sudo
if [ ! -w /usr/local/bin ]; then
    echo "ℹ️  Requires sudo to write to /usr/local/bin"
    sudo mv "$TEMP_FILE" /usr/local/bin/scratchpad
else
    mv "$TEMP_FILE" /usr/local/bin/scratchpad
fi

# Install icons
echo "🎨 Installing icons..."
ICON_DIR="$HOME/.local/share/icons/hicolor"
mkdir -p "$ICON_DIR/256x256/apps"
mkdir -p "$ICON_DIR/128x128/apps"

# Download and install icon (from GitHub)
ICON_URL="https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/icon.png"
curl -fsSL "$ICON_URL" -o "$ICON_DIR/256x256/apps/scratchpad.png" 2>/dev/null || true

# Create .desktop file for launcher
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_DIR/scratchpad.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Scratchpad
Comment=Glass-themed markdown note-taking app
Exec=scratchpad
Icon=scratchpad
Categories=Utility;TextEditor;
EOF

echo "✅ Scratchpad installed successfully!"
echo ""
echo "🚀 Run 'scratchpad' to launch the app"
echo "📁 Notes are stored in ~/.scratchpad/notes/"
