
**⚠️ REQUIRES LIBWEBKIT2GTK/WEBKITGTK ⚠️**
# Scratchpad

A lightweight, glass-themed markdown note-taking application built with Tauri (Rust) and JavaScript.

## Features

- **Markdown Editor** - Full markdown support with live preview toggle
- **Syntax Highlighting** - Beautiful code blocks with language-specific highlighting
- **Multi-tab Editing** - Open and edit multiple notes simultaneously
- **Auto-naming** - Note titles auto-extract from first non-empty line
- **Folder Organization** - Create custom folders and drag notes between them
- **Wiki-links** - Link notes with `[[Note Title]]` syntax, includes autocomplete
- **Backlinks Panel** - See what notes link to the current note
- **Tags System** - Add tags to notes and filter by tag
- **Undo/Redo** - Per-note undo/redo history with Ctrl+Z/Ctrl+Y
- **Auto-save Toggle** - Enable/disable automatic saving
- **Bulk Operations** - Select multiple notes to delete or move
- **Real-time Search** - Search notes by content and title
- **Dark/Light Theme** - Glass-themed dark mode (default) + light mode toggle
- **Glass UI** - Beautiful transparent interface with blur effects
- **Markdown Storage** - All notes saved as plain markdown files with YAML frontmatter
- **Copy/Paste** - Full clipboard support in the editor

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Rust with Tauri
- **Storage**: Local filesystem (markdown files)
- **Libraries**: marked (markdown parsing), highlight.js (syntax highlighting), turndown (HTML→Markdown conversion)

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- libwebkit2gtk-4.0-dev (Linux only)

### Quick Install (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/viewerofall/GlassPad/main/install.sh | bash
```

This will:
- Download the latest binary
- Install to `/usr/local/bin/scratchpad`
- Create a `.desktop` launcher
- Install icons to `~/.local/share/icons`

Then just run: `scratchpad`

### Build from source

```bash
# Clone the repository
git clone https://github.com/viewerofall/GlassPad.git
cd scratchpad

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run tauri build
```

### Releases

Check the [Releases](https://github.com/viewerofall/GlassPad/releases) page for pre-built binaries.

## Usage

### Creating Notes

- Click **+ Note** in the toolbar or press `Ctrl+N`
- Type your content - the first non-empty line becomes the title automatically
- Notes auto-save every 2 seconds when auto-save is enabled
- Manually save with `Ctrl+S` or the save button

### Formatting

- **Bold**: `**text**` or `Ctrl+B`
- **Italic**: `*text*` or `Ctrl+I`
- **Underline**: `<u>text</u>`
- **Bullet points**: Start line with `-` or click the bullet button
- **Headings**: Start line with `## ` or click the H2 button
- **Code blocks**: ` ```language code here``` `

### Wiki-links

- Type `[[` to see a dropdown of note titles
- Select a note to create a link: `[[Note Title]]`
- In Preview mode, click the link to jump to that note
- Use the backlinks panel to see what notes link to you

### Organizing Notes

- Create folders with the **+** button in the sidebar
- Drag notes and folders to reorder them
- Delete notes/folders with the **×** button (shows themed confirmation)
- Bulk select notes with the **☑ Select** button, then delete or move them

### Themes

- Click the **🌙** moon icon in the titlebar to toggle between dark and light themes
- Theme preference is saved automatically

### Keyboard Shortcuts

- `Ctrl+N` - New note
- `Ctrl+S` - Save current note
- `Ctrl+W` - Close current tab
- `Ctrl+B` - Bold
- `Ctrl+I` - Italic
- `Ctrl+U` - Underline
- `Ctrl+Z` - Undo
- `Ctrl+Y` / `Ctrl+Shift+Z` - Redo

## File Storage

Notes are stored as markdown files with YAML metadata in:
- **Linux**: `~/.scratchpad/notes/`
- **Windows**: `%USERPROFILE%\.scratchpad\notes\`
- **macOS**: `~/.scratchpad/notes\`

Each note is a `.md` file with frontmatter containing metadata (id, title, folder, tags, timestamps).

## Development

```bash
# Install Tauri dependencies
cd src-tauri
cargo build

# Return and run dev server
cd ..
npm run dev

# Watch for changes and rebuild
npm run tauri dev
```

## Releases

Releases are automatically built and published for Linux, macOS, and Windows via GitHub Actions.

**To create a release:**

```bash
# Tag a commit (e.g., v1.0.0)
git tag v1.0.0
git push origin v1.0.0
```

This triggers the GitHub Actions workflow which:
- Builds binaries for Linux (x86_64)
- Builds for macOS (x86_64 + ARM64)
- Builds for Windows (x86_64)
- Creates a GitHub release with all artifacts
- Users can then install with: `curl -fsSL https://raw.githubusercontent.com/viewerofall/GlassPad/main/install.sh | bash`

## Contributing

Contributions are welcome! Please discuss what you're working on first.

## Roadmap

Currently feature-complete. This project may be archived.

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- Inspired by Obsidian and Notion
- Glass UI design using CSS backdrop-filter
