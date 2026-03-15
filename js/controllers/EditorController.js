import { GitHubStorageService } from '../engine/GitHubStorageService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';
import { BlogService } from '../engine/BlogService.js';

export class EditorController {
    constructor(appContext) {
        this.appContext = appContext;
        this.editModeToggle = document.getElementById('edit-mode-toggle');
        this.editorActionBar = document.getElementById('editor-action-bar');
        this.postBody = document.getElementById('post-body');
        this.postTitleDisplay = document.getElementById('post-title-display');
        this.postTitleInput = document.getElementById('post-title-input');
        this.autoSaveStatus = document.getElementById('auto-save-status');
        this.publishBtn = document.getElementById('publish-github-btn');
        this.toastEditorContainer = document.getElementById('toast-editor-container');

        this.isEditMode = false;
        this.autoSaveTimeout = null;
        this.editorInstance = null;
        this.initialContent = '';

        this.init();
    }

    init() {
        if (!this.editModeToggle) return;

        // Mode Toggle
        this.editModeToggle.addEventListener('click', () => this.toggleEditMode());

        // Publish
        if (this.publishBtn) {
            this.publishBtn.addEventListener('click', () => this.publishToGitHub());
        }

        if (this.postTitleInput) {
            this.postTitleInput.addEventListener('input', () => this.triggerAutoSave());
        }
    }

    initToastEditor() {
        if (!this.toastEditorContainer) return;

        // Only init once
        if (this.editorInstance) return;

        // Ensure the global Editor is loaded from CDN
        if (typeof window.toastui === 'undefined' || !window.toastui.Editor) {
            console.error('Toast UI Editor library not loaded.');
            return;
        }

        this.editorInstance = new window.toastui.Editor({
            el: this.toastEditorContainer,
            height: '600px',
            initialEditType: 'wysiwyg',
            previewStyle: 'vertical',
            hideModeSwitch: false,
            initialValue: this.initialContent,
            events: {
                change: () => this.triggerAutoSave()
            }
        });
    }

    triggerAutoSave() {
        if (!this.appContext.currentPostId || !this.editorInstance) return;
        this.autoSaveStatus.textContent = 'Saving...';
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            const draftContent = this.editorInstance.getMarkdown();
            localStorage.setItem(`draft_${this.appContext.currentPostId}`, draftContent);
            localStorage.setItem(`draft_title_${this.appContext.currentPostId}`, this.postTitleInput.value);
            this.autoSaveStatus.textContent = 'Saved locally';
        }, 1000);
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;

        if (this.isEditMode) {
            // Enter Edit Mode
            this.editModeToggle.textContent = '👁️ View Page';
            if (this.editorActionBar) this.editorActionBar.classList.remove('hidden');
            if (this.postBody) this.postBody.classList.add('hidden');
            if (this.postTitleDisplay) this.postTitleDisplay.classList.add('hidden');
            if (this.toastEditorContainer) this.toastEditorContainer.classList.remove('hidden');
            if (this.postTitleInput) this.postTitleInput.classList.remove('hidden');
            
            this.initToastEditor();

            const draft = localStorage.getItem(`draft_${this.appContext.currentPostId}`);
            const draftTitle = localStorage.getItem(`draft_title_${this.appContext.currentPostId}`);
            
            if (draft && this.editorInstance) {
                this.editorInstance.setMarkdown(draft);
                if (draftTitle) this.postTitleInput.value = draftTitle;
                this.autoSaveStatus.textContent = 'Draft loaded';
            } else if (this.editorInstance) {
                this.editorInstance.setMarkdown(this.initialContent);
            }
            
            if (this.postTitleInput) this.postTitleInput.focus();

        } else {
            // Exit Edit Mode (Preview)
            this.editModeToggle.textContent = '✏️ Edit Page';
            if (this.editorActionBar) this.editorActionBar.classList.add('hidden');
            if (this.postBody) this.postBody.classList.remove('hidden');
            if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
            if (this.toastEditorContainer) this.toastEditorContainer.classList.add('hidden');
            if (this.postTitleInput) this.postTitleInput.classList.add('hidden');

            this.postTitleDisplay.textContent = this.postTitleInput.value || 'Untitled';
            
            // Re-render preview with our custom renderer
            if (this.editorInstance) {
                this.postBody.innerHTML = BlogRenderer.render(this.editorInstance.getMarkdown());
            }
        }
    }

    async publishToGitHub() {
        if (!this.appContext.currentPostId || !this.editorInstance) return;
        const token = prompt('Enter GitHub PAT:');
        if (!token) return;

        try {
            this.publishBtn.textContent = 'Publishing...';
            this.publishBtn.disabled = true;
            
            const github = new GitHubStorageService('khmurakami', 'khmurakami.github.io');
            github.setToken(token);
            
            const post = BlogService.getPostById(this.appContext.currentPostId);
            const markdownContent = `---\ntitle: ${this.postTitleInput.value || post.title}\ndate: ${post.date}\ntags: [${post.tags.join(', ')}]\ncategory: ${post.category}\nsummary: ${post.summary}\n---\n\n${this.editorInstance.getMarkdown()}`;
            
            await github.commitFiles(`docs(blog): Update post ${this.appContext.currentPostId} via Toast UI`, [{ path: post.file.replace('./', ''), content: markdownContent }]);
            
            alert('Published successfully!');
            localStorage.removeItem(`draft_${this.appContext.currentPostId}`);
            localStorage.removeItem(`draft_title_${this.appContext.currentPostId}`);
            
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
        if (this.editorActionBar) this.editorActionBar.classList.add('hidden');
        if (this.postBody) this.postBody.classList.remove('hidden');
        if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
        if (this.toastEditorContainer) this.toastEditorContainer.classList.add('hidden');
        if (this.postTitleInput) this.postTitleInput.classList.add('hidden');
        
        if (this.editorInstance) {
             this.editorInstance.destroy();
             this.editorInstance = null;
        }
        this.initialContent = '';
    }

    setEditorContent(title, content) {
        if (this.postTitleInput) this.postTitleInput.value = title;
        this.initialContent = content;
        if (this.editorInstance && this.isEditMode) {
            this.editorInstance.setMarkdown(content);
        }
    }
}
