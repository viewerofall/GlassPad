**⚠️ GLASSPAD IS CURRENTLY IN ALPHA BUGS ARE EXPECTED⚠️**

**⚠️ THIS APP WILL NOT BE PORTED TO WINDOWS BY ME MAKE A PULL REQUEST IF YOU ARE PORTING TO WINDOWS ⚠️**
# Scratchpad

A lightweight, glass-themed note-taking application built with Tauri (Rust) and JavaScript.

## Features

-  **Multi-tab note editing** - Open and edit multiple notes simultaneously
-  **Folder organization** - Organize notes into custom folders
-  **Real-time search** - Instantly search across all notes
- **Auto-save** - Notes automatically save as you type
-  **Rich text formatting** - Bold, italic, underline, highlighting, and font sizing
-  **Glass UI** - Beautiful transparent interface with blur effects
-  **Lightweight** - Built with Tauri for minimal resource usage
-  **Markdown storage** - All notes saved as plain markdown files

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Rust with Tauri
- **Storage**: Local filesystem (markdown files)
- This was quite literally a js project because I was bored and know rust

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)

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
npm run build
```

### Binary releases

Check the [Releases](https://github.com/viewerofall/GlassPad/releases) page for the actual damn thing

## Usage

### Creating Notes

- Click **+ Note** in the toolbar or press `Ctrl+N`
- Notes auto-save every 2 seconds after you stop typing
- Manually save with `Ctrl+S` or the save button

### Organizing Notes

- Create folders with the **+** button in the sidebar
- Drag notes between folders (coming soon)
- Delete notes/folders with the **×** button

### Keyboard Shortcuts

- `Ctrl+N` - New note
- `Ctrl+S` - Save current note
- `Ctrl+W` - Close current tab
- `Ctrl+B` - Bold
- `Ctrl+I` - Italic
- `Ctrl+U` - Underline
- `Ctrl+F` - Search (when in search box)

## File Storage

Notes are stored as markdown files in:
- **Linux**: `~/.scratchpad/notes/`
- **Windows**: `%USERPROFILE%\.scratchpad\notes\`
- **macOS**: `~/.scratchpad/notes/`

## Development
```bash
# Install Rust dependencies
cd src-tauri
cargo build

# Run development server
cd ..
npm run dev
```

## Contributing

Contributions are welcome! However make sure to tell me what you are actually doing.

## Roadmap

- [ ] Drag and drop for folder organization
- [ ] Export notes (PDF, HTML)
- [ ] Note linking/backlinking
- [ ] Tags system
- [ ] No web server at all
- [ ] Custom notification and title bar
- [ ] Mobile version

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- Inspired by Obsidian and Notion
- Glass UI design using CSS backdrop-filter
