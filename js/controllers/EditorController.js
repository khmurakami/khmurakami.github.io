import { GitHubStorageService } from '../engine/GitHubStorageService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';
import { BlogService } from '../engine/BlogService.js';

export class EditorController {
    constructor(appContext) {
        this.appContext = appContext;
        this.editModeToggle = document.getElementById('edit-mode-toggle');
        this.editorToolbar = document.getElementById('editor-toolbar');
        this.postBody = document.getElementById('post-body');
        this.postTitleDisplay = document.getElementById('post-title-display');
        this.postTitleInput = document.getElementById('post-title-input');
        this.postEditorTextarea = document.getElementById('post-editor-textarea');
        this.autoSaveStatus = document.getElementById('auto-save-status');
        this.publishBtn = document.getElementById('publish-github-btn');

        this.isEditMode = false;
        this.autoSaveTimeout = null;

        this.init();
    }

    init() {
        if (!this.editModeToggle) return;

        // Mode Toggle
        this.editModeToggle.addEventListener('click', () => this.toggleEditMode());

        // Auto-save
        const handleInput = () => {
            if (!this.appContext.currentPostId) return;
            this.autoSaveStatus.textContent = 'Saving...';
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = setTimeout(() => {
                localStorage.setItem(`draft_${this.appContext.currentPostId}`, this.postEditorTextarea.value);
                this.autoSaveStatus.textContent = 'Saved locally';
            }, 1000);
        };

        if (this.postEditorTextarea) this.postEditorTextarea.addEventListener('input', handleInput);
        if (this.postTitleInput) this.postTitleInput.addEventListener('input', handleInput);

        // Publish
        if (this.publishBtn) {
            this.publishBtn.addEventListener('click', () => this.publishToGitHub());
        }

        // Initialize legacy toolbar tools (Will be removed in Phase 2)
        this.initLegacyToolbar();
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;

        if (this.isEditMode) {
            this.editModeToggle.textContent = '👁️ View Page';
            this.editorToolbar.classList.remove('hidden');
            this.postBody.classList.add('hidden');
            this.postTitleDisplay.classList.add('hidden');
            this.postEditorTextarea.classList.remove('hidden');
            this.postTitleInput.classList.remove('hidden');
            this.postEditorTextarea.focus();

            const draft = localStorage.getItem(`draft_${this.appContext.currentPostId}`);
            if (draft) {
                this.postEditorTextarea.value = draft;
                this.autoSaveStatus.textContent = 'Draft loaded';
            }
        } else {
            this.editModeToggle.textContent = '✏️ Edit Page';
            this.editorToolbar.classList.add('hidden');
            this.postBody.classList.remove('hidden');
            this.postTitleDisplay.classList.remove('hidden');
            this.postEditorTextarea.classList.add('hidden');
            this.postTitleInput.classList.add('hidden');

            this.postTitleDisplay.textContent = this.postTitleInput.value || 'Untitled';
            this.postBody.innerHTML = BlogRenderer.render(this.postEditorTextarea.value);
        }
    }

    async publishToGitHub() {
        if (!this.appContext.currentPostId) return;
        const token = prompt('Enter GitHub PAT:');
        if (!token) return;

        try {
            this.publishBtn.textContent = 'Publishing...';
            this.publishBtn.disabled = true;
            
            const github = new GitHubStorageService('khmurakami', 'khmurakami.github.io');
            github.setToken(token);
            
            const post = BlogService.getPostById(this.appContext.currentPostId);
            const markdownContent = `---\ntitle: ${this.postTitleInput.value || post.title}\ndate: ${post.date}\ntags: [${post.tags.join(', ')}]\ncategory: ${post.category}\nsummary: ${post.summary}\n---\n\n${this.postEditorTextarea.value}`;
            
            await github.commitFiles(`docs(blog): Update post ${this.appContext.currentPostId}`, [{ path: post.file.replace('./', ''), content: markdownContent }]);
            
            alert('Published successfully!');
            localStorage.removeItem(`draft_${this.appContext.currentPostId}`);
            
            // Toggle back to view mode
            if (this.isEditMode) this.toggleEditMode();
            
        } catch (error) {
            alert('Error: ' + error.message);
        } finally {
            this.publishBtn.textContent = 'Publish to GitHub';
            this.publishBtn.disabled = false;
        }
    }

    reset() {
        this.isEditMode = false;
        if (this.editModeToggle) this.editModeToggle.textContent = '✏️ Edit Page';
        if (this.editorToolbar) this.editorToolbar.classList.add('hidden');
        if (this.postBody) this.postBody.classList.remove('hidden');
        if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
        if (this.postEditorTextarea) this.postEditorTextarea.classList.add('hidden');
        if (this.postTitleInput) this.postTitleInput.classList.add('hidden');
    }

    setEditorContent(title, content) {
        if (this.postTitleInput) this.postTitleInput.value = title;
        if (this.postEditorTextarea) this.postEditorTextarea.value = content;
    }

    // --- Legacy Toolbar Logic (To be removed in Phase 2) ---
    initLegacyToolbar() {
        const gridCellsContainer = document.getElementById('grid-cells');
        const gridDimensionsLabel = document.getElementById('grid-dimensions');
        const tableGridSelector = document.getElementById('table-grid-selector');
        const tableBtn = document.getElementById('table-btn');

        if (gridCellsContainer && tableGridSelector) {
            gridCellsContainer.innerHTML = '';
            for (let r = 1; r <= 10; r++) {
                for (let c = 1; c <= 10; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'grid-cell';
                    cell.dataset.row = r;
                    cell.dataset.col = c;

                    cell.addEventListener('mouseover', () => {
                        gridDimensionsLabel.textContent = `${c} x ${r}`;
                        document.querySelectorAll('.grid-cell').forEach(el => {
                            const er = parseInt(el.dataset.row);
                            const ec = parseInt(el.dataset.col);
                            el.classList.toggle('active', er <= r && ec <= c);
                        });
                    });

                    cell.addEventListener('click', () => {
                        this.insertAtCursor(this.generateMarkdownTable(r, c));
                        tableGridSelector.classList.remove('visible');
                    });
                    gridCellsContainer.appendChild(cell);
                }
            }

            tableBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.isEditMode) tableGridSelector.classList.toggle('visible');
            });
            
            document.addEventListener('click', (e) => {
                if (!tableGridSelector.contains(e.target) && e.target !== tableBtn) {
                    tableGridSelector.classList.remove('visible');
                }
            });
        }

        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.postEditorTextarea) return;
                const title = e.currentTarget.title;
                if (title === 'Table') return; // Handled above
                let insert = '';

                if (title === 'Bold') insert = '**bold text**';
                if (title === 'Italic') insert = '*italic text*';
                if (title === 'Code') insert = '`code`';
                if (title === 'Image') {
                    const url = prompt('Enter image URL:');
                    const alt = prompt('Enter image description (alt text):', 'Image');
                    if (url) insert = `![${alt}](${url})`;
                }
                if (insert) this.insertAtCursor(insert);
            });
        });
    }

    insertAtCursor(text) {
        if (!this.postEditorTextarea) return;
        const start = this.postEditorTextarea.selectionStart;
        const end = this.postEditorTextarea.selectionEnd;
        const val = this.postEditorTextarea.value;
        this.postEditorTextarea.value = val.substring(0, start) + text + val.substring(end);
        this.postEditorTextarea.dispatchEvent(new Event('input'));
    }

    generateMarkdownTable(rows, cols) {
        let table = '\n|';
        for (let c = 1; c <= cols; c++) table += ` Column ${c} |`;
        table += '\n|';
        for (let c = 1; c <= cols; c++) table += ' --- |';
        for (let r = 1; r <= rows; r++) {
            table += '\n|';
            for (let c = 1; c <= cols; c++) table += ` Row ${r} Col ${c} |`;
        }
        return table + '\n';
    }
}