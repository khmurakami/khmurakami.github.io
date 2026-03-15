import { GitHubStorageService } from '../engine/GitHubStorageService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';
import { BlogService } from '../engine/BlogService.js';

export class EditorController {
    constructor(appContext) {
        this.appContext = appContext;
        
        // Command Bar Elements
        this.editModeToggle = document.getElementById('edit-mode-toggle');
        this.publishBtn = document.getElementById('publish-github-btn');
        this.saveIndicator = document.getElementById('auto-save-indicator');
        
        // Content Elements
        this.postBody = document.getElementById('post-body');
        this.postTitleDisplay = document.getElementById('post-title-display');
        this.postTitleInput = document.getElementById('post-title-input');
        this.toastEditorContainer = document.getElementById('toast-editor-container');

        // Modal Elements
        this.tokenModal = document.getElementById('token-modal');
        this.tokenInput = document.getElementById('github-token-input');
        this.confirmPublishBtn = document.getElementById('confirm-publish-btn');
        this.closeModalBtn = document.getElementById('close-token-modal');
        
        // Notifications
        this.notificationCenter = document.getElementById('notification-center');

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

        // Publish Trigger (Opens Modal)
        if (this.publishBtn) {
            this.publishBtn.addEventListener('click', () => this.showTokenModal());
        }

        // Modal Events
        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.hideTokenModal());
        }
        if (this.confirmPublishBtn) {
            this.confirmPublishBtn.addEventListener('click', () => this.publishToGitHub());
        }

        // Auto-save on Title change
        if (this.postTitleInput) {
            this.postTitleInput.addEventListener('input', () => this.triggerAutoSave());
        }
    }

    initToastEditor() {
        if (!this.toastEditorContainer || this.editorInstance) return;

        if (typeof window.toastui === 'undefined' || !window.toastui.Editor) {
            console.error('Toast UI Editor library not loaded.');
            return;
        }

        this.editorInstance = new window.toastui.Editor({
            el: this.toastEditorContainer,
            height: '600px',
            initialEditType: 'wysiwyg',
            previewStyle: 'tab', // Use tabs instead of split for a cleaner Confluence feel
            hideModeSwitch: false,
            initialValue: this.initialContent,
            theme: 'light', // Keep it clean on the white canvas
            usageStatistics: false,
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task', 'indent', 'outdent'],
                ['table', 'image', 'link'],
                ['code', 'codeblock']
            ],
            events: {
                change: () => this.triggerAutoSave()
            }
        });
    }

    triggerAutoSave() {
        if (!this.appContext.currentPostId || !this.editorInstance) return;
        
        if (this.saveIndicator) this.saveIndicator.classList.add('saving');
        
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            const draftContent = this.editorInstance.getMarkdown();
            localStorage.setItem(`draft_${this.appContext.currentPostId}`, draftContent);
            localStorage.setItem(`draft_title_${this.appContext.currentPostId}`, this.postTitleInput.value);
            
            if (this.saveIndicator) {
                this.saveIndicator.classList.remove('saving');
                this.saveIndicator.style.opacity = '1';
                setTimeout(() => { this.saveIndicator.style.opacity = '0.6'; }, 500);
            }
        }, 1000);
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;

        const toggleLabel = this.editModeToggle.querySelector('.label');
        const toggleIcon = this.editModeToggle.querySelector('.icon');

        if (this.isEditMode) {
            // Enter Edit Mode
            if (toggleLabel) toggleLabel.textContent = 'View';
            if (toggleIcon) toggleIcon.textContent = '👁️';
            
            if (this.publishBtn) this.publishBtn.classList.remove('hidden');
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
            } else if (this.editorInstance) {
                this.editorInstance.setMarkdown(this.initialContent);
            }
            
            if (this.postTitleInput) this.postTitleInput.focus();

        } else {
            // Exit Edit Mode (Preview)
            if (toggleLabel) toggleLabel.textContent = 'Edit';
            if (toggleIcon) toggleIcon.textContent = '✏️';
            
            if (this.publishBtn) this.publishBtn.classList.add('hidden');
            if (this.postBody) this.postBody.classList.remove('hidden');
            if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
            if (this.toastEditorContainer) this.toastEditorContainer.classList.add('hidden');
            if (this.postTitleInput) this.postTitleInput.classList.add('hidden');

            this.postTitleDisplay.textContent = this.postTitleInput.value || 'Untitled';
            
            if (this.editorInstance) {
                this.postBody.innerHTML = BlogRenderer.render(this.editorInstance.getMarkdown());
            }
        }
    }

    showTokenModal() {
        if (this.tokenModal) this.tokenModal.classList.add('visible');
        if (this.tokenInput) {
            const savedToken = localStorage.getItem('github_token');
            if (savedToken) this.tokenInput.value = savedToken;
            this.tokenInput.focus();
        }
    }

    hideTokenModal() {
        if (this.tokenModal) this.tokenModal.classList.remove('visible');
    }

    async publishToGitHub() {
        const token = this.tokenInput.value;
        if (!token) {
            this.showNotification('Please provide a token.', 'error');
            return;
        }

        // Save token for next time (Local convenience)
        localStorage.setItem('github_token', token);

        try {
            this.confirmPublishBtn.textContent = 'Publishing...';
            this.confirmPublishBtn.disabled = true;
            
            const github = new GitHubStorageService('khmurakami', 'khmurakami.github.io');
            github.setToken(token);
            
            const post = BlogService.getPostById(this.appContext.currentPostId);
            const markdownContent = `---\ntitle: ${this.postTitleInput.value || post.title}\ndate: ${post.date}\ntags: [${post.tags.join(', ')}]\ncategory: ${post.category}\nsummary: ${post.summary}\n---\n\n${this.editorInstance.getMarkdown()}`;
            
            await github.commitFiles(`docs(blog): Update post ${this.appContext.currentPostId} via Pro Editor`, [{ path: post.file.replace('./', ''), content: markdownContent }]);
            
            this.hideTokenModal();
            this.showNotification('Successfully published to GitHub!', 'success');
            
            localStorage.removeItem(`draft_${this.appContext.currentPostId}`);
            localStorage.removeItem(`draft_title_${this.appContext.currentPostId}`);
            
            if (this.isEditMode) this.toggleEditMode();
            
        } catch (error) {
            this.showNotification('Publish failed: ' + error.message, 'error');
        } finally {
            this.confirmPublishBtn.textContent = 'Verify & Publish';
            this.confirmPublishBtn.disabled = false;
        }
    }

    showNotification(message, type = 'success') {
        if (!this.notificationCenter) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="icon">${type === 'success' ? '✓' : '⚠️'}</span>
            <span class="message">${message}</span>
        `;
        
        this.notificationCenter.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 600);
        }, 4000);
    }

    reset() {
        this.isEditMode = false;
        const toggleLabel = this.editModeToggle.querySelector('.label');
        const toggleIcon = this.editModeToggle.querySelector('.icon');
        if (toggleLabel) toggleLabel.textContent = 'Edit';
        if (toggleIcon) toggleIcon.textContent = '✏️';

        if (this.publishBtn) this.publishBtn.classList.add('hidden');
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
