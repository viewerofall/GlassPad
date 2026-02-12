// src/main.js
import { getCurrentWindow } from 'https://esm.sh/@tauri-apps/api@2/window';
import { invoke } from 'https://esm.sh/@tauri-apps/api@2/core';

const appWindow = getCurrentWindow();

class ScratchpadApp {
    constructor() {
        this.notes = [];
        this.folders = [];
        this.openTabs = [];
        this.activeTabId = null;
        this.currentFolder = 'default';
        this.searchTimeout = null;

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
            this.renderFolderTree();

            console.log(`Loaded ${this.notes.length} notes from ~/.scratchpad/notes/`);

            // Open first note if exists
            if (this.notes.length > 0) {
                this.openNote(this.notes[0].id);
            } else {
                this.createNewNote();
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            this.updateSaveStatus('error');
        }
    }

    initializeEventListeners() {
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

        // Search
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.performSearch(e.target.value), 300);
        });

        // Toolbar
        document.querySelectorAll('.tool-btn[data-command]').forEach(btn => {
            btn.addEventListener('click', () => this.executeCommand(btn.dataset.command));
        });

        document.getElementById('fontSizeInput').addEventListener('change', (e) => {
            this.changeFontSize(e.target.value);
        });

        document.getElementById('highlightBtn').addEventListener('click', () => {
            const color = document.getElementById('highlightColor').value;
            this.applyHighlight(color);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'b': e.preventDefault(); this.executeCommand('bold'); break;
                    case 'i': e.preventDefault(); this.executeCommand('italic'); break;
                    case 'u': e.preventDefault(); this.executeCommand('underline'); break;
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

        // Auto-save on input
        setInterval(() => this.saveCurrentNote(false), 5000);
    }

    async performSearch(query) {
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

            // Render notes in this folder
            const folderNotes = this.notes.filter(n => n.folder === folder.id && !n.parent_id);
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
        });
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

        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                div.classList.toggle('expanded');
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
        div.innerHTML = `
        <span class="note-title">${note.title}</span>
        <button class="delete-btn">×</button>
        `;

        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                this.openNote(note.id);
            }
        });

        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNote(note.id);
        });

        return div;
    }

    async createNewNote() {
        const timestamp = Date.now();
        const note = {
            id: `note-${timestamp}`,
            title: 'Untitled Note',
            content: '',
            folder: this.currentFolder,
            parent_id: null,
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
        const name = prompt('Folder name:');
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

        this.editorContainer.innerHTML = '';

        const editor = document.createElement('div');
        editor.className = 'editor';
        editor.contentEditable = 'true';
        editor.spellcheck = false;
        editor.innerHTML = tab.content || '';

        let saveTimeout;
        editor.addEventListener('input', () => {
            tab.content = editor.innerHTML;
            this.updateSaveStatus('saving');

            // Auto-save after 2 seconds of no typing
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => this.saveCurrentNote(false), 2000);
        });

        // Update title on first line change
        editor.addEventListener('blur', () => {
            const firstLine = editor.textContent.split('\n')[0].trim();
            if (firstLine && firstLine !== tab.title) {
                tab.title = firstLine.substring(0, 50);
                this.renderTabs();
                this.renderFolderTree();
            }
        });

        this.editorContainer.appendChild(editor);
        setTimeout(() => editor.focus(), 0);
    }

    async saveCurrentNote(showNotification = false) {
        if (!this.activeTabId) return;

        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (!tab) return;

        const note = this.notes.find(n => n.id === tab.id);
        if (!note) return;

        // Update note with tab content
        note.content = tab.content;
        note.title = tab.title;
        note.updated_at = Date.now();

        try {
            if (showNotification) {
                this.updateSaveStatus('saving');
            }
            await invoke('save_note', { note });
            if (showNotification) {
                this.updateSaveStatus('saved');
                console.log(`Saved to: ~/.scratchpad/notes/${note.id}.md`);
            }
        } catch (error) {
            console.error('Failed to save note:', error);
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
            }
        }

        this.renderTabs();
    }

    async deleteNote(noteId) {
        if (!confirm('Delete this note?')) return;

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
        if (!confirm('Delete this folder? (Notes will not be deleted)')) return;

        this.folders = this.folders.filter(f => f.id !== folderId);

        try {
            await invoke('save_folders', { folders: this.folders });
            this.renderFolderTree();
        } catch (error) {
            console.error('Failed to delete folder:', error);
        }
    }

    executeCommand(command) {
        const editor = document.querySelector('.editor');
        if (!editor) return;
        document.execCommand(command, false, null);
        editor.focus();
    }

    changeFontSize(size) {
        const editor = document.querySelector('.editor');
        if (editor) editor.style.fontSize = `${size}px`;
    }

    applyHighlight(color) {
        const editor = document.querySelector('.editor');
        if (!editor) return;
        document.execCommand('hiliteColor', false, color);
        editor.focus();
    }
}

new ScratchpadApp();
