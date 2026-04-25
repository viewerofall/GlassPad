// src/main.js
import { getCurrentWindow } from 'https://esm.sh/@tauri-apps/api@2/window';
import { invoke } from 'https://esm.sh/@tauri-apps/api@2/core';
import { marked } from 'https://esm.sh/marked@9';
import TurndownService from 'https://esm.sh/turndown@7';
import hljs from 'https://esm.sh/highlight.js@11';

const appWindow = getCurrentWindow();

// Configure marked with syntax highlighting
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
                console.error('Highlight error:', err);
            }
        }
        try {
            return hljs.highlightAuto(code).value;
        } catch (err) {
            return code;
        }
    }
});

document.addEventListener('contextmenu', e => {
  // Allow context menu on textarea for copy/paste
  if (e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});

class ScratchpadApp {
    constructor() {
        this.notes = [];
        this.folders = [];
        this.openTabs = [];
        this.activeTabId = null;
        this.currentFolder = 'default';
        this.searchTimeout = null;
        this.activeTagFilter = null;
        this.wikiDropdown = null;
        this.pathDropdown = null;
        this.expandedFolders = new Set();
        this.lastNodeText = '';
        this.lastOffset = 0;

        // Markdown editor state
        this.editorMode = 'edit'; // 'edit' | 'preview'
        this.autoSaveEnabled = true;
        this.autoSaveInterval = null;
        this.undoStacks = new Map(); // noteId → [content, content, ...]
        this.redoStacks = new Map();
        this.undoDebounce = null;

        // Bulk operations state
        this.bulkSelectMode = false;
        this.selectedNoteIds = new Set();

        this.initializeElements();
        this.initializeEventListeners();
        this.loadData();
    }

    initializeElements() {
        this.folderTree = document.getElementById('folderTree');
        this.tabsContainer = document.getElementById('tabsContainer');
        this.editorContainer = document.getElementById('editorContainer');
        this.searchInput = document.getElementById('searchInput');
        this.saveStatus = document.getElementById('saveStatus');
        this.modalOverlay = document.getElementById('modalOverlay');
        this.modalLabel = document.getElementById('modalLabel');
        this.modalInput = document.getElementById('modalInput');
        this.modalConfirm = document.getElementById('modalConfirm');
        this.modalCancel = document.getElementById('modalCancel');
        this.wordCount = document.getElementById('wordCount');
        this.tagList = document.getElementById('tagList');
    }

    updateWordCount(text) {
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        this.wordCount.textContent = `${words}w ${chars}c`;
    }

    getAbsoluteName(content) {
        // Get the first non-empty line from content
        if (!content) return 'Untitled';
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                // Remove markdown syntax from the line
                return trimmed
                    .replace(/^#+\s+/, '') // Remove heading markers
                    .replace(/^[-*]\s+/, '') // Remove bullet points
                    .replace(/^\d+\.\s+/, '') // Remove numbered lists
                    .trim();
            }
        }
        return 'Untitled';
    }

    setTheme(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            themeToggle.textContent = '☀️';
        } else {
            document.body.classList.remove('light-theme');
            themeToggle.textContent = '🌙';
        }
    }

    showPrompt(label, defaultValue = '') {
        return new Promise((resolve) => {
            this.modalLabel.textContent = label;
            this.modalInput.value = defaultValue;
            this.modalInput.style.display = '';
            this.modalOverlay.classList.add('visible');
            this.modalInput.focus();
            this.modalInput.select();

            const finish = (value) => {
                this.modalOverlay.classList.remove('visible');
                this.modalConfirm.removeEventListener('click', onConfirm);
                this.modalCancel.removeEventListener('click', onCancel);
                this.modalInput.removeEventListener('keydown', onKey);
                resolve(value);
            };

            const onConfirm = () => finish(this.modalInput.value);
            const onCancel = () => finish(null);
            const onKey = (e) => {
                if (e.key === 'Enter') finish(this.modalInput.value);
                if (e.key === 'Escape') finish(null);
            };

            this.modalConfirm.addEventListener('click', onConfirm);
            this.modalCancel.addEventListener('click', onCancel);
            this.modalInput.addEventListener('keydown', onKey);
        });
    }

    showConfirm(message) {
        return new Promise((resolve) => {
            this.modalLabel.textContent = message;
            this.modalInput.style.display = 'none';
            this.modalConfirm.textContent = 'Delete';
            this.modalCancel.textContent = 'Cancel';
            this.modalOverlay.classList.add('visible');

            const finish = (confirmed) => {
                this.modalOverlay.classList.remove('visible');
                this.modalConfirm.textContent = 'OK';
                this.modalInput.style.display = '';
                this.modalConfirm.removeEventListener('click', onConfirm);
                this.modalCancel.removeEventListener('click', onCancel);
                resolve(confirmed);
            };

            const onConfirm = () => finish(true);
            const onCancel = () => finish(false);

            this.modalConfirm.addEventListener('click', onConfirm);
            this.modalCancel.addEventListener('click', onCancel);
        });
    }

    updateSaveStatus(status) {
        this.saveStatus.className = 'save-status ' + status;
        switch(status) {
            case 'saving':
                this.saveStatus.textContent = 'Saving...';
                break;
            case 'saved':
                this.saveStatus.textContent = 'Saved ✓';
                setTimeout(() => {
                    this.saveStatus.textContent = 'Saved';
                }, 2000);
                break;
            case 'error':
                this.saveStatus.textContent = 'Error!';
                break;
        }
    }

    async loadData() {
        try {
            this.folders = await invoke('load_folders');
            this.notes = await invoke('load_notes');

            // Migrate HTML notes to Markdown (one-time)
            const td = new TurndownService();
            for (const note of this.notes) {
                if (note.content && note.content.trim().startsWith('<')) {
                    console.log(`Migrating HTML to Markdown: ${note.title}`);
                    const markdown = td.turndown(note.content);
                    note.content = markdown;
                    try {
                        await invoke('save_note', { note });
                        console.log(`Migrated ${note.title}`);
                    } catch (saveErr) {
                        console.error(`Failed to save migrated note ${note.title}:`, saveErr);
                    }
                }
            }

            // Expand default folder by default
            this.expandedFolders.add('default');
            this.startAutoSave();
            this.renderFolderTree();

            console.log(`Loaded ${this.notes.length} notes from ~/.scratchpad/notes/`);

            // Open first note if exists
            if (this.notes.length > 0) {
                this.openNote(this.notes[0].id);
            } else {
                this.createNewNote(true);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.updateSaveStatus('error');
        }
    }

    initializeEventListeners() {
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme);
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });

        // Window controls
        document.getElementById('minimizeBtn').addEventListener('click', () => appWindow.minimize());
        document.getElementById('maximizeBtn').addEventListener('click', async () => {
            const isMaximized = await appWindow.isMaximized();
            isMaximized ? appWindow.unmaximize() : appWindow.maximize();
        });
        document.getElementById('closeBtn').addEventListener('click', () => appWindow.close());

        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveCurrentNote(true);
        });

        // New note/folder buttons
        document.getElementById('newNoteBtn').addEventListener('click', () => this.createNewNote());
        document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewFolder());

        // Bulk select and bulk action buttons
        const bulkSelectBtn = document.getElementById('bulkSelectBtn');
        if (bulkSelectBtn) bulkSelectBtn.addEventListener('click', () => this.toggleBulkSelect());

        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => this.bulkDelete());

        const bulkMoveBtn = document.getElementById('bulkMoveBtn');
        if (bulkMoveBtn) bulkMoveBtn.addEventListener('click', () => this.bulkMove());



        // Search
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.performSearch(e.target.value), 300);
        });

        // Toolbar markdown buttons
        document.querySelectorAll('.tool-btn[data-command]').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.command;
                switch(cmd) {
                    case 'bold': this.insertMarkdownSyntax('**', '**'); break;
                    case 'italic': this.insertMarkdownSyntax('*', '*'); break;
                    case 'underline': this.insertMarkdownSyntax('<u>', '</u>'); break;
                }
            });
        });

        // Undo/Redo buttons
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());

        // Autosave toggle
        const autosaveBtn = document.getElementById('autosaveBtn');
        if (autosaveBtn) autosaveBtn.addEventListener('click', () => this.toggleAutoSave());

        // Bullet list and heading buttons
        document.getElementById('bulletBtn').addEventListener('click', () => {
            const textarea = document.querySelector('.editor-textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
            const lineContent = textarea.value.slice(lineStart, start);
            if (!lineContent.startsWith('- ')) {
                textarea.setRangeText('- ', lineStart, lineStart, 'select');
                const tab = this.openTabs.find(t => t.id === this.activeTabId);
                if (tab) tab.content = textarea.value;
            }
            textarea.focus();
        });

        document.getElementById('headingBtn').addEventListener('click', () => {
            const textarea = document.querySelector('.editor-textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
            const lineContent = textarea.value.slice(lineStart, start);
            if (!lineContent.startsWith('## ')) {
                textarea.setRangeText('## ', lineStart, lineStart, 'select');
                const tab = this.openTabs.find(t => t.id === this.activeTabId);
                if (tab) tab.content = textarea.value;
            }
            textarea.focus();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'b': e.preventDefault(); this.insertMarkdownSyntax('**', '**'); break;
                    case 'i': e.preventDefault(); this.insertMarkdownSyntax('*', '*'); break;
                    case 'u': e.preventDefault(); this.insertMarkdownSyntax('<u>', '</u>'); break;
                    case 'z': e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); break;
                    case 'y': e.preventDefault(); this.redo(); break;
                    case 'n': e.preventDefault(); this.createNewNote(); break;
                    case 's':
                        e.preventDefault();
                        this.saveCurrentNote(true);
                        break;
                    case 'w':
                        if (this.openTabs.length > 1) {
                            e.preventDefault();
                            this.closeTab(this.activeTabId);
                        }
                        break;
                }
            }
        });
    }

    async performSearch(query) {
        this.activeTagFilter = null;
        if (!query.trim()) {
            this.renderFolderTree();
            return;
        }

        try {
            const results = await invoke('search_notes', { query });
            this.renderSearchResults(results);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    renderSearchResults(results) {
        this.folderTree.innerHTML = '';

        if (results.length === 0) {
            this.folderTree.innerHTML = '<div style="padding: 12px; color: rgba(255,255,255,0.4); font-size: 12px;">No results</div>';
            return;
        }

        results.forEach(note => {
            const noteEl = this.createNoteElement(note);
            this.folderTree.appendChild(noteEl);
        });
    }

    renderFolderTree() {
        this.folderTree.innerHTML = '';

        // Render folders and their notes
        this.folders.forEach(folder => {
            const folderEl = this.createFolderElement(folder);
            this.folderTree.appendChild(folderEl);

            // Only render notes if folder is expanded
            const isExpanded = this.expandedFolders.has(folder.id) || folder.id === 'default';
            if (isExpanded) {
                // Render notes in this folder
                let folderNotes = this.notes.filter(n => n.folder === folder.id && !n.parent_id);
                if (this.activeTagFilter) {
                    folderNotes = folderNotes.filter(n => n.tags.includes(this.activeTagFilter));
                }
                folderNotes.forEach(note => {
                    const noteEl = this.createNoteElement(note);
                    this.folderTree.appendChild(noteEl);

                    // Render sub-notes
                    const subNotes = this.notes.filter(n => n.parent_id === note.id);
                    subNotes.forEach(subNote => {
                        const subNoteEl = this.createNoteElement(subNote, true);
                        this.folderTree.appendChild(subNoteEl);
                    });
                });
            }
        });

        this.renderTagList();
    }

    createFolderElement(folder) {
        const div = document.createElement('div');
        div.className = 'folder-item';
        div.dataset.folderId = folder.id;
        div.innerHTML = `
        <span class="folder-icon"></span>
        <span class="note-title">${folder.name}</span>
        ${folder.id !== 'default' ? '<button class="delete-btn">×</button>' : ''}
        `;

        if (folder.id !== 'default') {
            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', 'folder');
                e.dataTransfer.setData('folderId', folder.id);
                e.dataTransfer.effectAllowed = 'move';
                div.classList.add('dragging');
            });
            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
                document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            });
        }

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            div.classList.add('drop-target');
            e.dataTransfer.dropEffect = 'move';
        });

        div.addEventListener('dragleave', (e) => {
            if (!div.contains(e.relatedTarget)) {
                div.classList.remove('drop-target');
            }
        });

        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            div.classList.remove('drop-target');
            const dragType = e.dataTransfer.getData('type');

            if (dragType === 'note') {
                const noteId = e.dataTransfer.getData('noteId');
                const note = this.notes.find(n => n.id === noteId);
                if (note && note.folder !== folder.id) {
                    note.folder = folder.id;
                    note.updated_at = Date.now();
                    try {
                        await invoke('save_note', { note });
                        this.renderFolderTree();
                    } catch (err) { console.error('Failed to move note:', err); }
                }
            } else if (dragType === 'folder') {
                const draggedId = e.dataTransfer.getData('folderId');
                if (draggedId !== folder.id) {
                    const fromIdx = this.folders.findIndex(f => f.id === draggedId);
                    const toIdx = this.folders.findIndex(f => f.id === folder.id);
                    if (fromIdx !== -1 && toIdx !== -1) {
                        const [moved] = this.folders.splice(fromIdx, 1);
                        this.folders.splice(toIdx, 0, moved);
                        try {
                            await invoke('save_folders', { folders: this.folders });
                            this.renderFolderTree();
                        } catch (err) { console.error('Failed to reorder folders:', err); }
                    }
                }
            }
        });

        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                div.classList.toggle('expanded');
                // Track folder expanded state
                if (this.expandedFolders.has(folder.id)) {
                    this.expandedFolders.delete(folder.id);
                } else {
                    this.expandedFolders.add(folder.id);
                }
                this.renderFolderTree();
                this.currentFolder = folder.id;
            }
        });

        const deleteBtn = div.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFolder(folder.id);
            });
        }

        return div;
    }

    createNoteElement(note, isSubNote = false) {
        const div = document.createElement('div');
        div.className = isSubNote ? 'note-item sub-note-item' : 'note-item';
        div.dataset.noteId = note.id;

        let html = `<span class="note-title">${note.title}</span>`;
        html += `<button class="delete-btn">×</button>`;

        if (this.bulkSelectMode) {
            html = `<input type="checkbox" class="note-checkbox" ${this.selectedNoteIds.has(note.id) ? 'checked' : ''}>` + html;
        }

        div.innerHTML = html;

        if (!this.bulkSelectMode) {
            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', 'note');
                e.dataTransfer.setData('noteId', note.id);
                e.dataTransfer.effectAllowed = 'move';
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
                document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            });
        }

        div.addEventListener('click', (e) => {
            const isCheckbox = e.target.classList.contains('note-checkbox');
            const isDelete = e.target.classList.contains('delete-btn');

            if (!isDelete && !isCheckbox) {
                if (this.bulkSelectMode) {
                    const checkbox = div.querySelector('.note-checkbox');
                    checkbox.checked = !checkbox.checked;
                    checkbox.checked ? this.selectedNoteIds.add(note.id) : this.selectedNoteIds.delete(note.id);
                } else {
                    this.openNote(note.id);
                }
            }
        });

        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNote(note.id);
        });

        if (this.bulkSelectMode) {
            const checkbox = div.querySelector('.note-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                checkbox.checked ? this.selectedNoteIds.add(note.id) : this.selectedNoteIds.delete(note.id);
            });
        }

        return div;
    }

    async renameNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const newTitle = await this.showPrompt('Rename note:', note.title);
        if (newTitle === null) return;

        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === note.title) return;

        const oldTitle = note.title;
        note.title = trimmed;
        note.updated_at = Date.now();

        const tab = this.openTabs.find(t => t.id === noteId);
        if (tab) tab.title = trimmed;

        this.renderTabs();
        this.renderFolderTree();

        try {
            await invoke('save_note', { note });
            // Check for broken links
            const brokenLinks = this.notes.filter(n => n.content.includes(`[[${oldTitle}]]`));
            if (brokenLinks.length > 0) {
                console.warn(`Broken wiki-links detected: ${brokenLinks.length} note(s) link to "${oldTitle}"`);
            }
        } catch (error) {
            console.error('Failed to rename note:', error);
        }
    }

    async createNewNote(silent = false) {
        let title = 'Untitled Note';
        if (!silent) {
            const input = await this.showPrompt('Note name:');
            if (input === null) return;
            if (input.trim()) title = input.trim();
        }

        const timestamp = Date.now();
        const note = {
            id: `note-${timestamp}`,
            title,
            content: '',
            folder: this.currentFolder,
            parent_id: null,
            tags: [],
            created_at: timestamp,
            updated_at: timestamp
        };

        try {
            this.updateSaveStatus('saving');
            await invoke('save_note', { note });
            this.notes.push(note);
            this.renderFolderTree();
            this.openNote(note.id);
            this.updateSaveStatus('saved');
            console.log(`Created note: ~/.scratchpad/notes/${note.id}.md`);
        } catch (error) {
            console.error('Failed to create note:', error);
            this.updateSaveStatus('error');
        }
    }

    async createNewFolder() {
        const name = await this.showPrompt('Folder name:');
        if (!name) return;

        const folder = {
            id: `folder-${Date.now()}`,
            name,
            parent_id: null
        };

        this.folders.push(folder);

        try {
            await invoke('save_folders', { folders: this.folders });
            this.renderFolderTree();
        } catch (error) {
            console.error('Failed to create folder:', error);
        }
    }

    openNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        // Check if already open
        const existingTab = this.openTabs.find(t => t.id === noteId);
        if (existingTab) {
            this.switchToTab(noteId);
            return;
        }

        // Add to open tabs
        this.openTabs.push({ ...note });
        this.renderTabs();
        this.switchToTab(noteId);
    }

    renderTabs() {
        this.tabsContainer.innerHTML = '';

        this.openTabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = 'tab';
            tabEl.dataset.tabId = tab.id;
            if (tab.id === this.activeTabId) {
                tabEl.classList.add('active');
            }

            tabEl.innerHTML = `
            <span class="tab-title">${tab.title}</span>
            <button class="tab-close">×</button>
            `;

            tabEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('tab-close')) {
                    this.switchToTab(tab.id);
                }
            });

            tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });

            this.tabsContainer.appendChild(tabEl);
        });
    }

    switchToTab(tabId) {
        // Save current tab content
        this.saveCurrentNote(false);

        this.activeTabId = tabId;
        this.renderTabs();
        this.renderEditor(tabId);

        // Update sidebar selection
        document.querySelectorAll('.note-item').forEach(el => {
            el.classList.toggle('active', el.dataset.noteId === tabId);
        });
    }

    renderEditor(tabId) {
        const tab = this.openTabs.find(t => t.id === tabId);
        if (!tab) return;

        // Clear existing editor content (but keep mode bar)
        const oldWrapper = document.querySelector('.editor-wrapper');
        if (oldWrapper) oldWrapper.remove();

        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'editor-wrapper';

        // Textarea for markdown editing
        const textarea = document.createElement('textarea');
        textarea.className = 'editor-textarea';
        textarea.spellcheck = false;
        textarea.value = tab.content || '';
        textarea.placeholder = 'Start typing... Use [[ to link to other notes, / for file paths';

        // Initialize undo stack with current content
        if (!this.undoStacks.has(tabId)) {
            this.undoStacks.set(tabId, [tab.content || '']);
        }
        if (!this.redoStacks.has(tabId)) {
            this.redoStacks.set(tabId, []);
        }

        this.updateWordCount(textarea.value);

        let saveTimeout;
        let undoTimeout;
        textarea.addEventListener('input', () => {
            tab.content = textarea.value;
            this.updateWordCount(textarea.value);

            // Auto-update title from first non-empty line
            const newTitle = this.getAbsoluteName(textarea.value);
            if (newTitle !== tab.title) {
                tab.title = newTitle;
                const note = this.notes.find(n => n.id === tabId);
                if (note) note.title = newTitle;
                this.renderTabs();
            }

            // Debounced undo push (300ms)
            clearTimeout(undoTimeout);
            undoTimeout = setTimeout(() => this.pushUndo(tabId, textarea.value), 300);

            // Wiki-link autocomplete
            const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
            const wikiMatch = beforeCursor.match(/\[\[([^\]]*)$/);
            if (wikiMatch && wikiMatch[1].length > 0) {
                this.showWikiAutocomplete(textarea, wikiMatch[1]);
            } else {
                this.hideWikiAutocomplete();
            }

            // Auto-save
            if (this.autoSaveEnabled) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this.saveCurrentNote(false), 2000);
            }
        });

        // Wiki-link click detection in edit mode
        textarea.addEventListener('click', () => {
            const pos = textarea.selectionStart;
            const text = textarea.value;
            const before = text.lastIndexOf('[[', pos);
            const after = text.indexOf(']]', pos);
            if (before !== -1 && after !== -1 && after > before) {
                const linkedTitle = text.slice(before + 2, after);
                const target = this.notes.find(n => n.title === linkedTitle);
                if (target) {
                    this.openNote(target.id);
                }
            }
        });

        // Preview div for markdown rendering
        const previewDiv = document.createElement('div');
        previewDiv.className = 'editor-preview';
        previewDiv.style.display = 'none';

        editorWrapper.appendChild(textarea);
        editorWrapper.appendChild(previewDiv);

        // Get or create mode bar
        let modeBar = document.querySelector('.editor-mode-bar');
        let editBtn = modeBar ? modeBar.querySelector('#editModeBtn') : null;
        let previewBtn = modeBar ? modeBar.querySelector('#previewModeBtn') : null;

        if (!modeBar) {
            modeBar = document.createElement('div');
            modeBar.className = 'editor-mode-bar';
            editBtn = document.createElement('button');
            editBtn.className = 'mode-btn active';
            editBtn.id = 'editModeBtn';
            editBtn.textContent = 'Edit';
            previewBtn = document.createElement('button');
            previewBtn.className = 'mode-btn';
            previewBtn.id = 'previewModeBtn';
            previewBtn.textContent = 'Preview';
            modeBar.appendChild(editBtn);
            modeBar.appendChild(previewBtn);
            this.editorContainer.insertBefore(modeBar, this.editorContainer.firstChild);
        }

        // Clear old listeners and add new ones
        editBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Edit mode clicked');
            this.editorMode = 'edit';
            textarea.style.display = 'block';
            previewDiv.style.display = 'none';
            editBtn.classList.add('active');
            previewBtn.classList.remove('active');
            textarea.focus();
        };

        previewBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Preview mode clicked, content:', tab.content);
            try {
                const html = marked.parse(tab.content || '');
                console.log('Marked output:', html);
                previewDiv.innerHTML = html;
                this.editorMode = 'preview';
                textarea.style.display = 'none';
                previewDiv.style.display = 'block';
                previewBtn.classList.add('active');
                editBtn.classList.remove('active');
            } catch (err) {
                console.error('Preview rendering error:', err);
            }
        };

        // Tag bar with header
        const tagSection = document.createElement('div');
        tagSection.className = 'tag-section';

        const tagHeader = document.createElement('div');
        tagHeader.className = 'tag-section-header';
        tagHeader.innerHTML = '🏷️ Tags';
        tagSection.appendChild(tagHeader);

        const tagBar = document.createElement('div');
        tagBar.className = 'tag-bar';

        const renderTagChips = () => {
            tagBar.innerHTML = '';
            const note = this.notes.find(n => n.id === tabId);
            if (!note) return;
            note.tags.forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.textContent = tag;
                const removeBtn = document.createElement('button');
                removeBtn.className = 'tag-chip-remove';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', () => {
                    note.tags = note.tags.filter(t => t !== tag);
                    const tabNote = this.openTabs.find(t => t.id === tabId);
                    if (tabNote) tabNote.tags = note.tags;
                    renderTagChips();
                    this.saveCurrentNote(false);
                    this.renderFolderTree();
                });
                chip.appendChild(removeBtn);
                tagBar.appendChild(chip);
            });
            const input = document.createElement('input');
            input.className = 'tag-input';
            input.placeholder = 'Type tag name, press Enter or comma...';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const val = input.value.trim().replace(/,/g, '');
                    if (val) {
                        const note = this.notes.find(n => n.id === tabId);
                        if (note && !note.tags.includes(val)) {
                            note.tags.push(val);
                            const tabNote = this.openTabs.find(t => t.id === tabId);
                            if (tabNote) tabNote.tags = note.tags;
                            renderTagChips();
                            this.saveCurrentNote(false);
                            this.renderFolderTree();
                        }
                        input.value = '';
                    }
                }
                if (e.key === 'Backspace' && input.value === '') {
                    const note = this.notes.find(n => n.id === tabId);
                    if (note && note.tags.length > 0) {
                        note.tags.pop();
                        const tabNote = this.openTabs.find(t => t.id === tabId);
                        if (tabNote) tabNote.tags = note.tags;
                        renderTagChips();
                        this.saveCurrentNote(false);
                        this.renderFolderTree();
                    }
                }
            });
            tagBar.appendChild(input);
        };
        renderTagChips();
        tagSection.appendChild(tagBar);
        editorWrapper.appendChild(tagSection);

        // Backlinks panel
        const backlinksPanel = document.createElement('div');
        backlinksPanel.className = 'backlinks-panel';
        backlinksPanel.innerHTML = '<div class="backlinks-header">🔗 Backlinks: Loading...</div>';
        editorWrapper.appendChild(backlinksPanel);

        this.editorContainer.appendChild(editorWrapper);

        // Load backlinks asynchronously
        invoke('get_backlinks', { noteId: tabId }).then(backlinks => {
            const count = backlinks.length;
            const header = backlinksPanel.querySelector('.backlinks-header');
            const countText = count === 0 ? 'None' : `${count} note${count !== 1 ? 's' : ''}`;
            header.innerHTML = `🔗 Backlinks: ${countText}`;
            header.style.cursor = count > 0 ? 'pointer' : 'default';

            if (count > 0) {
                const list = document.createElement('div');
                list.className = 'backlinks-list';
                backlinks.forEach(bl => {
                    const item = document.createElement('div');
                    item.className = 'backlink-item';
                    item.innerHTML = `← ${bl.title}`;
                    item.addEventListener('click', () => this.openNote(bl.id));
                    list.appendChild(item);
                });
                backlinksPanel.appendChild(list);
                header.addEventListener('click', () => {
                    list.classList.toggle('hidden');
                    header.classList.toggle('collapsed');
                });
            }
        }).catch(err => console.error('Failed to load backlinks:', err));

        // Add wiki-link click handler to preview div
        previewDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('wiki-link')) {
                e.preventDefault();
                const title = e.target.dataset.title;
                const target = this.notes.find(n => n.title === title);
                if (target) {
                    this.openNote(target.id);
                }
            }
        });

        setTimeout(() => textarea.focus(), 0);
    }

    pushUndo(noteId, content) {
        if (!this.undoStacks.has(noteId)) {
            this.undoStacks.set(noteId, []);
        }
        const stack = this.undoStacks.get(noteId);
        if (stack[stack.length - 1] === content) return;
        stack.push(content);
        if (stack.length > 100) stack.shift();
        this.redoStacks.set(noteId, []);
    }

    undo() {
        const textarea = document.querySelector('.editor-textarea');
        if (!textarea || !this.activeTabId) return;
        const stack = this.undoStacks.get(this.activeTabId) || [];
        if (stack.length < 2) return;
        const current = stack.pop();
        const rStack = this.redoStacks.get(this.activeTabId) || [];
        rStack.push(current);
        this.redoStacks.set(this.activeTabId, rStack);
        const prev = stack[stack.length - 1];
        textarea.value = prev;
        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (tab) tab.content = prev;
        this.updateWordCount(prev);
        textarea.focus();
    }

    redo() {
        const textarea = document.querySelector('.editor-textarea');
        if (!textarea || !this.activeTabId) return;
        const rStack = this.redoStacks.get(this.activeTabId) || [];
        if (!rStack.length) return;
        const next = rStack.pop();
        const stack = this.undoStacks.get(this.activeTabId) || [];
        stack.push(next);
        textarea.value = next;
        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (tab) tab.content = next;
        this.updateWordCount(next);
        textarea.focus();
    }

    insertMarkdownSyntax(before, after = '') {
        const textarea = document.querySelector('.editor-textarea');
        if (!textarea) {
            console.error('Textarea not found');
            return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end);
        const replacement = before + (selected || 'text') + after;
        textarea.setRangeText(replacement, start, end, 'select');
        textarea.focus();
        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (tab) {
            tab.content = textarea.value;
            this.pushUndo(this.activeTabId, textarea.value);
        }
        console.log(`Inserted: ${before}${selected || 'text'}${after}`);
    }

    startAutoSave() {
        if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
        if (this.autoSaveEnabled) {
            this.autoSaveInterval = setInterval(() => this.saveCurrentNote(false), 5000);
        }
    }

    toggleAutoSave() {
        this.autoSaveEnabled = !this.autoSaveEnabled;
        document.getElementById('autosaveBtn').classList.toggle('active', this.autoSaveEnabled);
        this.startAutoSave();
    }

    async saveCurrentNote(showNotification = false) {
        if (!this.activeTabId) return;

        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (!tab) return;

        const note = this.notes.find(n => n.id === tab.id);
        if (!note) return;

        // Update note with tab content
        note.content = tab.content || '';
        note.title = tab.title || 'Untitled';
        note.updated_at = Date.now();

        try {
            if (showNotification) {
                this.updateSaveStatus('saving');
            }
            await invoke('save_note', { note });
            this.refreshBacklinksPanel();
            if (showNotification) {
                this.updateSaveStatus('saved');
                console.log(`Saved to: ~/.scratchpad/notes/${note.id}.md`);
            }
        } catch (error) {
            console.error('Failed to save note:', error, note);
            this.updateSaveStatus('error');
        }
    }

    closeTab(tabId) {
        const index = this.openTabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        // Save before closing
        if (tabId === this.activeTabId) {
            this.saveCurrentNote();
        }

        this.openTabs.splice(index, 1);

        if (this.activeTabId === tabId) {
            if (this.openTabs.length > 0) {
                const newActiveTab = this.openTabs[Math.max(0, index - 1)];
                this.switchToTab(newActiveTab.id);
            } else {
                this.activeTabId = null;
                this.editorContainer.innerHTML = '';
                this.wordCount.textContent = '';
            }
        }

        this.renderTabs();
    }

    async deleteNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        const confirmed = await this.showConfirm(`Delete "${note?.title || 'note'}"?`);
        if (!confirmed) return;

        try {
            await invoke('delete_note', { noteId });
            this.notes = this.notes.filter(n => n.id !== noteId);
            this.closeTab(noteId);
            this.renderFolderTree();
            console.log(`Deleted: ~/.scratchpad/notes/${noteId}.md`);
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }

    async deleteFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        const confirmed = await this.showConfirm(`Delete folder "${folder?.name || 'folder'}"?`);
        if (!confirmed) return;

        this.folders = this.folders.filter(f => f.id !== folderId);

        try {
            await invoke('save_folders', { folders: this.folders });
            this.renderFolderTree();
        } catch (error) {
            console.error('Failed to delete folder:', error);
        }
    }

    toggleBulkSelect() {
        this.bulkSelectMode = !this.bulkSelectMode;
        document.getElementById('bulkSelectBtn').classList.toggle('active', this.bulkSelectMode);
        const bulkActions = document.getElementById('bulkActions');
        if (bulkActions) bulkActions.style.display = this.bulkSelectMode ? 'flex' : 'none';
        this.selectedNoteIds.clear();
        this.renderFolderTree();
    }

    async bulkDelete() {
        const ids = [...this.selectedNoteIds];
        if (!ids.length) return;

        const confirmed = await this.showConfirm(`Delete ${ids.length} note${ids.length !== 1 ? 's' : ''}?`);
        if (!confirmed) return;

        for (const id of ids) {
            await invoke('delete_note', { noteId: id });
        }
        this.notes = this.notes.filter(n => !this.selectedNoteIds.has(n.id));
        ids.forEach(id => this.closeTab(id));
        this.selectedNoteIds.clear();
        this.renderFolderTree();
    }

    async bulkMove() {
        if (!this.selectedNoteIds.size) return;
        const folders = this.folders.map(f => f.name);
        if (folders.length === 0) return;
        const selected = await this.showPrompt('Move to folder:', folders[0]);
        if (!selected) return;
        const folder = this.folders.find(f => f.name === selected);
        if (!folder) return;
        for (const id of this.selectedNoteIds) {
            const note = this.notes.find(n => n.id === id);
            if (note) {
                note.folder = folder.id;
                await invoke('save_note', { note });
            }
        }
        this.selectedNoteIds.clear();
        this.renderFolderTree();
    }


    renderTagList() {
        this.tagList.innerHTML = '';
        const allTags = [...new Set(this.notes.flatMap(n => n.tags))].sort();

        allTags.forEach(tag => {
            const item = document.createElement('div');
            item.className = 'tag-item';
            if (tag === this.activeTagFilter) {
                item.classList.add('active');
            }
            item.textContent = `#${tag}`;
            item.addEventListener('click', () => {
                if (this.activeTagFilter === tag) {
                    this.activeTagFilter = null;
                } else {
                    this.activeTagFilter = tag;
                }
                this.renderFolderTree();
            });
            this.tagList.appendChild(item);
        });
    }

    showWikiAutocomplete(textarea, query) {
        this.hideWikiAutocomplete();
        if (!query) return;

        const matches = this.notes.filter(n =>
            n.title.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 8);

        if (matches.length === 0) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'wiki-autocomplete';
        dropdown.style.cssText = 'position:fixed; z-index:10000; background:#2a2a2a; color:#fff; border:1px solid #666; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.5); max-height:200px; overflow-y:auto; min-width:150px;';
        this.wikiDropdown = dropdown;

        matches.forEach((note, idx) => {
            const option = document.createElement('div');
            option.className = 'wiki-option';
            option.style.cssText = 'padding:8px 12px; cursor:pointer; white-space:nowrap; color:#fff;';
            option.textContent = note.title;
            option.addEventListener('mouseover', () => option.style.backgroundColor = '#444');
            option.addEventListener('mouseout', () => option.style.backgroundColor = '');
            option.addEventListener('click', () => {
                const pos = textarea.selectionStart;
                const beforeCursor = textarea.value.slice(0, pos);
                const wikiMatch = beforeCursor.match(/\[\[([^\]]*)$/);
                if (wikiMatch) {
                    const start = pos - wikiMatch[1].length - 2;
                    const end = pos;
                    textarea.setRangeText(`[[${note.title}]]`, start, end, 'end');
                    const tab = this.openTabs.find(t => t.id === this.activeTabId);
                    if (tab) tab.content = textarea.value;
                    textarea.focus();
                }
                this.hideWikiAutocomplete();
            });
            dropdown.appendChild(option);
        });

        document.body.appendChild(dropdown);

        // Position below textarea cursor - get better positioning
        const rect = textarea.getBoundingClientRect();
        const scrollLeft = window.scrollX || window.pageXOffset;
        const scrollTop = window.scrollY || window.pageYOffset;

        dropdown.style.left = (rect.left + scrollLeft + 10) + 'px';
        dropdown.style.top = (rect.top + scrollTop + 30) + 'px';
        console.log('Wiki autocomplete shown:', matches.map(n => n.title), 'at', rect.top, rect.left);
    }

    hideWikiAutocomplete() {
        if (this.wikiDropdown) {
            this.wikiDropdown.remove();
            this.wikiDropdown = null;
        }
    }

    getTextareaCoords(textarea) {
        const pos = textarea.selectionStart;
        const div = document.createElement('div');
        const span = document.createElement('span');
        div.appendChild(span);
        const style = window.getComputedStyle(textarea);
        ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'padding', 'border'].forEach(prop => {
            span.style[prop] = style[prop];
        });
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        span.textContent = textarea.value.substring(0, pos);
        document.body.appendChild(div);
        const rect = span.getBoundingClientRect();
        const taRect = textarea.getBoundingClientRect();
        document.body.removeChild(div);
        return {
            left: taRect.left + (rect.left - div.getBoundingClientRect().left),
            top: taRect.top + (rect.bottom - div.getBoundingClientRect().top) + 5
        };
    }

    async showPathAutocomplete(textarea, fullPath) {
        this.hidePathAutocomplete();

        // Extract directory and search term
        const lastSlash = fullPath.lastIndexOf('/');
        const dir = fullPath.slice(0, lastSlash + 1) || '/';
        const query = fullPath.slice(lastSlash + 1);

        try {
            const items = await invoke('list_directory', { path: dir });
            const matches = items.filter(item => item.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

            if (matches.length === 0) {
                this.hidePathAutocomplete();
                return;
            }

            const dropdown = document.createElement('div');
            dropdown.className = 'wiki-autocomplete';
            this.pathDropdown = dropdown;

            matches.forEach((item, idx) => {
                const option = document.createElement('div');
                option.className = 'wiki-option';
                if (idx === 0) option.classList.add('selected');
                option.textContent = item;
                option.addEventListener('click', () => {
                    const pos = textarea.selectionStart;
                    const beforeCursor = textarea.value.slice(0, pos);
                    const pathMatch = beforeCursor.match(/\/[^\s]*$/);
                    if (pathMatch) {
                        const start = pos - pathMatch[0].length;
                        const fullFilePath = dir === '/' ? `/${item}` : `${dir}${item}`;
                        textarea.setRangeText(fullFilePath, start, pos, 'end');
                        const tab = this.openTabs.find(t => t.id === this.activeTabId);
                        if (tab) tab.content = textarea.value;
                        textarea.focus();
                    }
                    this.hidePathAutocomplete();
                });
                dropdown.appendChild(option);
            });

            document.body.appendChild(dropdown);

            const coords = this.getTextareaCoords(textarea);
            if (coords) {
                dropdown.style.left = `${coords.left}px`;
                dropdown.style.top = `${coords.top}px`;
            }
        } catch (err) {
            console.error('Failed to list directory:', err);
        }
    }

    hidePathAutocomplete() {
        if (this.pathDropdown) {
            this.pathDropdown.remove();
            this.pathDropdown = null;
        }
    }

    refreshBacklinksPanel() {
        const panel = this.editorContainer.querySelector('.backlinks-panel');
        if (!panel || !this.activeTabId) return;

        invoke('get_backlinks', { noteId: this.activeTabId }).then(backlinks => {
            const count = backlinks.length;
            const header = panel.querySelector('.backlinks-header');
            header.textContent = `Linked by ${count} note${count !== 1 ? 's' : ''}`;

            const oldList = panel.querySelector('.backlinks-list');
            if (oldList) oldList.remove();

            if (count > 0) {
                const list = document.createElement('div');
                list.className = 'backlinks-list';
                backlinks.forEach(bl => {
                    const item = document.createElement('div');
                    item.className = 'backlink-item';
                    item.textContent = bl.title;
                    item.addEventListener('click', () => this.openNote(bl.id));
                    list.appendChild(item);
                });
                panel.appendChild(list);
            }
        }).catch(err => console.error('Failed to refresh backlinks:', err));
    }
}

new ScratchpadApp();
