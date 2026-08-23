import { GitHubStorageService } from '../engine/GitHubStorageService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';
import { BlogService } from '../engine/BlogService.js';

const SLASH_COMMANDS = [
    { icon: 'H1',  label: 'Heading 1',     hint: '#',    exec: (ed)       => ed.exec('heading', { level: 1 }) },
    { icon: 'H2',  label: 'Heading 2',     hint: '##',   exec: (ed)       => ed.exec('heading', { level: 2 }) },
    { icon: 'H3',  label: 'Heading 3',     hint: '###',  exec: (ed)       => ed.exec('heading', { level: 3 }) },
    { icon: '"',   label: 'Quote',          hint: '>',    exec: (ed)       => ed.exec('blockQuote') },
    { icon: '</>',  label: 'Code Block',   hint: '```',  exec: (ed)       => ed.exec('codeBlock') },
    { icon: '•',   label: 'Bullet List',   hint: '-',    exec: (ed)       => ed.exec('bulletList') },
    { icon: '1.',  label: 'Numbered List', hint: '1.',   exec: (ed)       => ed.exec('orderedList') },
    { icon: '—',   label: 'Divider',       hint: '---',  exec: (ed)       => ed.exec('thematicBreak') },
    { icon: '🖼',  label: 'Image',          hint: 'img',  exec: (ed, ctrl) => ctrl._showImageModal() },
];

export class EditorController {
    constructor(appContext) {
        this.appContext = appContext;

        // Command Bar Elements
        this.editModeToggle   = document.getElementById('edit-mode-toggle');
        this.publishBtn       = document.getElementById('publish-github-btn');
        this.wideModeToggle   = document.getElementById('wide-mode-toggle');
        this.focusModeToggle  = document.getElementById('focus-mode-toggle');
        this.propsPanelToggle = document.getElementById('props-panel-toggle');
        this.discardBtn       = document.getElementById('discard-changes-btn');
        this.wordCountDisplay = document.getElementById('word-count-display');
        this.draftBadge       = document.getElementById('draft-badge');
        this.saveStatusText   = document.getElementById('save-status-text');

        // Properties Panel (Phase 2)
        this.propsPanel       = document.getElementById('props-panel');
        this.propsStatusPub   = document.getElementById('props-status-published');
        this.propsStatusDraft = document.getElementById('props-status-draft');
        this.propsCategory    = document.getElementById('props-category');
        this.propsDate        = document.getElementById('props-date');
        this.propsTagsContainer = document.getElementById('props-tags-container');
        this.propsTagInput    = document.getElementById('props-tag-input');
        this.propsTagAddBtn   = document.getElementById('props-tag-add-btn');
        this.propsWordCount   = document.getElementById('props-word-count');
        this.propsReadTime    = document.getElementById('props-read-time');
        this.isPropsPanelOpen = false;

        // Focus Mode (Phase 3)
        this.mainHeader  = document.getElementById('main-header');
        this.isFocusMode = false;

        // Floating toolbar (Phase 3)
        this.floatingToolbar        = document.getElementById('floating-toolbar');
        this._selectionChangeHandler = null;

        // Slash commands (Phase 3)
        this.slashPalette         = document.getElementById('slash-palette');
        this.isSlashOpen          = false;
        this.slashFocusIndex      = 0;
        this._slashKeydownBound   = null;
        this._slashListenerTarget = null;

        // Image modal (Phase 4)
        this.imageModal      = document.getElementById('image-modal');
        this.imageUrlInput   = document.getElementById('image-url-input');
        this.imageAltInput   = document.getElementById('image-alt-input');
        this.imageFileInput  = document.getElementById('image-file-input');
        this.imageConfirmBtn = document.getElementById('image-confirm-btn');
        this.imageCloseBtn   = document.getElementById('image-close-btn');
        this.insertImageBtn  = document.getElementById('insert-image-btn');

        // Content Elements
        this.postBody = document.getElementById('post-body');
        this.postTitleDisplay = document.getElementById('post-title-display');
        this.postTitleInput = document.getElementById('post-title-input');
        this.toastEditorContainer = document.getElementById('toast-editor-container');
        this.postCanvas = document.querySelector('.post-canvas');

        // Modal Elements
        this.tokenModal = document.getElementById('token-modal');
        this.tokenInput = document.getElementById('github-token-input');
        this.confirmPublishBtn = document.getElementById('confirm-publish-btn');
        this.closeModalBtn = document.getElementById('close-token-modal');
        this.publishStatus = document.getElementById('publish-status');

        // Notifications
        this.notificationCenter = document.getElementById('notification-center');

        this.isEditMode = false;
        this.isWideMode = false;
        this.autoSaveTimeout = null;
        this.editorInstance = null;
        this.initialContent = '';
        this.initialTitle = '';

        this.init();
    }

    init() {
        if (!this.editModeToggle) return;

        this.editModeToggle.addEventListener('click', () => this.toggleEditMode());

        if (this.wideModeToggle) {
            this.wideModeToggle.addEventListener('click', () => this.toggleWideMode());
        }

        if (this.publishBtn) {
            this.publishBtn.addEventListener('click', () => this.showTokenModal());
        }

        // Task 8: Discard changes
        if (this.discardBtn) {
            this.discardBtn.addEventListener('click', () => this.discardChanges());
        }

        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.hideTokenModal());
        }

        if (this.confirmPublishBtn) {
            this.confirmPublishBtn.addEventListener('click', () => this.publishToGitHub());
        }

        // Close modal when clicking the backdrop
        if (this.tokenModal) {
            this.tokenModal.addEventListener('click', (e) => {
                if (e.target === this.tokenModal) this.hideTokenModal();
            });
        }

        // Submit on Enter inside token field
        if (this.tokenInput) {
            this.tokenInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.publishToGitHub();
            });
        }

        if (this.postTitleInput) {
            this.postTitleInput.addEventListener('input', () => this.triggerAutoSave());
        }

        // Focus mode
        if (this.focusModeToggle) {
            this.focusModeToggle.addEventListener('click', () => this.toggleFocusMode());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFocusMode) this.toggleFocusMode();
            if (e.key === 'Escape' && this.isSlashOpen) { e.preventDefault(); this._hideSlashPalette(); }
        });

        // Image modal
        if (this.insertImageBtn) this.insertImageBtn.addEventListener('click', () => this._showImageModal());
        if (this.imageCloseBtn) this.imageCloseBtn.addEventListener('click', () => this._hideImageModal());
        if (this.imageModal) this.imageModal.addEventListener('click', (e) => { if (e.target === this.imageModal) this._hideImageModal(); });
        if (this.imageConfirmBtn) this.imageConfirmBtn.addEventListener('click', () => this._insertImage());
        if (this.imageFileInput) {
            this.imageFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (this.imageUrlInput) this.imageUrlInput.value = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        // Properties panel
        if (this.propsPanelToggle) {
            this.propsPanelToggle.addEventListener('click', () => this.togglePropsPanel());
        }
        if (this.propsStatusPub) {
            this.propsStatusPub.addEventListener('click', () => {
                this.propsStatusPub.classList.add('active');
                this.propsStatusDraft.classList.remove('active');
            });
        }
        if (this.propsStatusDraft) {
            this.propsStatusDraft.addEventListener('click', () => {
                this.propsStatusDraft.classList.add('active');
                this.propsStatusPub.classList.remove('active');
            });
        }
        if (this.propsTagAddBtn) {
            this.propsTagAddBtn.addEventListener('click', () => this._addTagChip());
        }
        if (this.propsTagInput) {
            this.propsTagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this._addTagChip(); }
            });
        }
    }

    /**
     * Fetches the editor library, once, the first time anyone edits.
     *
     * It used to be two tags in `blog.html`, which meant every READER of the
     * blog downloaded 682KB of WYSIWYG editor — render-blocking — to look at a
     * page of text they cannot edit. Only someone authoring with a GitHub token
     * ever reaches this code.
     *
     * The version is pinned. It was on `latest`, which is a third party holding
     * a live handle on the site: a breaking release ships to every visitor with
     * no change on our side and no way to notice until something is broken.
     */
    loadEditorLibrary() {
        if (this._editorLib) return this._editorLib;

        const BASE = 'https://uicdn.toast.com/editor/3.2.2';

        this._editorLib = new Promise((resolve, reject) => {
            if (window.toastui && window.toastui.Editor) { resolve(); return; }

            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = `${BASE}/toastui-editor.min.css`;
            document.head.appendChild(css);

            const js = document.createElement('script');
            js.src = `${BASE}/toastui-editor-all.min.js`;
            js.onload = () => resolve();
            js.onerror = () => reject(new Error('editor failed to load'));
            document.head.appendChild(js);
        }).catch(err => {
            // Let a later attempt retry rather than caching the failure — an
            // editor that stays broken for the session because the network
            // blipped once is worse than a slow one.
            this._editorLib = null;
            throw err;
        });

        return this._editorLib;
    }

    async initToastEditor() {
        if (!this.toastEditorContainer || this.editorInstance) return;

        try {
            await this.loadEditorLibrary();
        } catch (err) {
            console.error('Toast UI Editor library failed to load.', err);
            return;
        }

        if (typeof window.toastui === 'undefined' || !window.toastui.Editor) {
            console.error('Toast UI Editor library not loaded.');
            return;
        }

        this.editorInstance = new window.toastui.Editor({
            el: this.toastEditorContainer,
            height: 'auto',
            initialEditType: 'wysiwyg',
            previewStyle: 'tab',
            hideModeSwitch: false,
            initialValue: this.initialContent,
            usageStatistics: false,
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task', 'indent', 'outdent'],
                ['table', 'link'],
                ['code', 'codeblock']
            ],
            events: {
                change: () => this.triggerAutoSave()
            }
        });

        // Inject after editor mounts — only way to reliably beat CDN stylesheet order
        this._injectEditorStyles();
        // Force dark toolbar backgrounds via inline styles — guaranteed to win
        this._forceDarkToolbar();
        // Phase 3 features — init after editor DOM is ready
        setTimeout(() => {
            this._initFloatingToolbar();
            this._initSlashCommands();
        }, 300);
    }

    _injectEditorStyles() {
        if (document.getElementById('tui-dark-overrides')) return;
        const s = document.createElement('style');
        s.id = 'tui-dark-overrides';
        s.textContent = `
            /* === Layer 1: Dark all structural containers (background-color only, not shorthand) === */
            #toast-editor-container .toastui-editor-defaultUI,
            #toast-editor-container .toastui-editor-toolbar,
            #toast-editor-container .toastui-editor-toolbar-section,
            #toast-editor-container .toastui-editor-ww-container,
            #toast-editor-container .toastui-editor-md-container,
            #toast-editor-container .toastui-editor-mode-switch {
                background-color: #0d0e1a !important;
            }

            /* === Layer 2: Clear only background-color, NOT background-image (icon sprites live there) === */
            #toast-editor-container .toastui-editor-toolbar *,
            #toast-editor-container .toastui-editor-toolbar button,
            #toast-editor-container .toastui-editor-toolbar button *,
            #toast-editor-container .toastui-editor-toolbar-group,
            #toast-editor-container .toastui-editor-toolbar-group * {
                background-color: transparent !important;
            }

            /* === Layer 3: Toolbar layout and icon visibility === */
            #toast-editor-container .toastui-editor-toolbar {
                border-bottom: 1px solid rgba(255,255,255,0.08) !important;
                padding: 6px 12px !important;
                position: sticky !important;
                top: 72px !important;
                z-index: 200 !important;
                border-radius: 12px 12px 0 0 !important;
            }
            #toast-editor-container .toastui-editor-toolbar button {
                border: none !important;
                border-radius: 6px !important;
                padding: 5px 8px !important;
                cursor: pointer !important;
                /* Invert dark SVG icons to white */
                filter: invert(1) brightness(1.8) !important;
            }
            #toast-editor-container .toastui-editor-toolbar button:hover {
                background-color: rgba(255,255,255,0.12) !important;
            }
            #toast-editor-container .toastui-editor-toolbar button.active {
                background-color: rgba(255,255,255,0.15) !important;
            }
            #toast-editor-container .toastui-editor-toolbar-group {
                border-color: rgba(255,255,255,0.08) !important;
            }
            .toastui-editor-toolbar input[type="color"],
            .toastui-editor-toolbar input[type="text"] { display: none !important; }

            /* === Editor body === */
            #toast-editor-container .toastui-editor-ww-container,
            #toast-editor-container .toastui-editor-md-container,
            .toastui-editor-ww-container,
            .toastui-editor-md-container {
                background: #12131f !important;
                background-color: #12131f !important;
            }
            #toast-editor-container .toastui-editor-contents,
            #toast-editor-container .ProseMirror,
            .toastui-editor-defaultUI .toastui-editor-contents,
            .toastui-editor-defaultUI .ProseMirror {
                background: transparent !important;
                color: #d4d4d8 !important;
                font-size: 1.05rem !important;
                line-height: 1.85 !important;
                padding: 32px 36px !important;
                caret-color: #fff !important;
                outline: none !important;
                min-height: 60vh !important;
            }
            .toastui-editor-contents p { color: #d4d4d8 !important; margin-bottom: 1.1em !important; }
            .toastui-editor-contents h1,
            .toastui-editor-contents h2,
            .toastui-editor-contents h3 {
                color: #f4f4f5 !important;
                border-color: rgba(255,255,255,0.06) !important;
                margin-top: 2em !important;
                margin-bottom: 0.6em !important;
            }
            .toastui-editor-contents blockquote {
                border-left: 3px solid rgba(255,113,91,0.5) !important;
                padding: 4px 0 4px 16px !important;
                color: #a1a1aa !important;
                background: rgba(255,113,91,0.04) !important;
                border-radius: 0 6px 6px 0 !important;
            }
            .toastui-editor-contents code {
                background: rgba(255,255,255,0.07) !important;
                color: #fb923c !important;
                padding: 2px 6px !important;
                border-radius: 4px !important;
                font-size: 0.88em !important;
            }
            .toastui-editor-contents pre {
                background: #080910 !important;
                border-radius: 10px !important;
                padding: 18px 20px !important;
                border: 1px solid rgba(255,255,255,0.06) !important;
                margin: 1.4em 0 !important;
            }
            .toastui-editor-contents pre code { background: transparent !important; color: #86efac !important; font-size: 0.9rem !important; }
            .toastui-editor-contents li { color: #d4d4d8 !important; }
            .toastui-editor-contents a { color: #fb923c !important; }
            .toastui-editor-contents hr { border-color: rgba(255,255,255,0.08) !important; }

            /* === Mode switch bar === */
            #toast-editor-container .toastui-editor-mode-switch,
            .toastui-editor-mode-switch {
                background: #0d0e1a !important;
                background-color: #0d0e1a !important;
                border-top: 1px solid rgba(255,255,255,0.06) !important;
            }
            .toastui-editor-mode-switch .tab-item {
                color: #52525b !important;
                border: none !important;
                background: transparent !important;
                font-size: 0.72rem !important;
                letter-spacing: 0.5px !important;
            }
            .toastui-editor-mode-switch .tab-item.active {
                color: #e4e4e7 !important;
                background: rgba(255,255,255,0.05) !important;
            }
        `;
        document.head.appendChild(s);
    }

    // Force dark backgrounds via inline styles with !important.
    // Toast UI uses Preact and renders asynchronously — CSS injection alone loses the race.
    // We watch the container with a MutationObserver and apply as soon as the toolbar appears.
    _forceDarkToolbar() {
        const applyDark = () => {
            const c = this.toastEditorContainer;
            if (!c) return;
            // Only set background-color — never the background shorthand (it would wipe background-image icon sprites)
            const set = (sel, color) => c.querySelectorAll(sel).forEach(el => {
                el.style.setProperty('background-color', color, 'important');
            });
            set('.toastui-editor-defaultUI',       '#12131f');
            set('.toastui-editor-toolbar',         '#0d0e1a');
            set('.toastui-editor-toolbar-section', '#0d0e1a');
            set('.toastui-editor-toolbar-group',   'transparent');
            set('.toastui-editor-ww-container',    '#12131f');
            set('.toastui-editor-md-container',    '#12131f');
            set('.toastui-editor-mode-switch',     '#0d0e1a');
        };

        // Watch for the toolbar to appear in the DOM (Preact renders async)
        const observer = new MutationObserver(() => {
            if (this.toastEditorContainer && this.toastEditorContainer.querySelector('.toastui-editor-toolbar')) {
                applyDark();
            }
        });
        if (this.toastEditorContainer) {
            observer.observe(this.toastEditorContainer, { childList: true, subtree: true });
        }
        // Also disconnect + final apply after 2s — editor is stable by then
        setTimeout(() => {
            observer.disconnect();
            applyDark();
        }, 2000);

        // Fallback: try at multiple delays in case observer misses it
        setTimeout(applyDark, 0);
        setTimeout(applyDark, 100);
        setTimeout(applyDark, 500);
    }

    // =============================================
    // IMAGE INSERTION
    // =============================================

    _showImageModal() {
        if (!this.imageModal) return;
        if (this.imageUrlInput) this.imageUrlInput.value = '';
        if (this.imageAltInput) this.imageAltInput.value = '';
        if (this.imageFileInput) this.imageFileInput.value = '';
        this.imageModal.classList.add('active');
        setTimeout(() => { if (this.imageUrlInput) this.imageUrlInput.focus(); }, 50);
    }

    _hideImageModal() {
        if (this.imageModal) this.imageModal.classList.remove('active');
    }

    _insertImage() {
        if (!this.editorInstance) return;
        const url = this.imageUrlInput ? this.imageUrlInput.value.trim() : '';
        const alt = this.imageAltInput ? this.imageAltInput.value.trim() : 'image';
        if (!url) {
            if (this.imageUrlInput) this.imageUrlInput.focus();
            return;
        }
        this.editorInstance.exec('addImage', { imageUrl: url, altText: alt || 'image' });
        this._hideImageModal();
    }

    // =============================================
    // PHASE 2 — PROPERTIES PANEL
    // =============================================

    togglePropsPanel() {
        this.isPropsPanelOpen = !this.isPropsPanelOpen;
        if (this.propsPanel) this.propsPanel.classList.toggle('is-open', this.isPropsPanelOpen);
        if (this.propsPanelToggle) this.propsPanelToggle.classList.toggle('is-active', this.isPropsPanelOpen);
    }

    _populatePropsPanel(post) {
        if (!post) return;
        if (this.propsCategory) this.propsCategory.value = post.category || '';
        if (this.propsDate) this.propsDate.value = post.date || '';
        if (this.propsTagsContainer) {
            this.propsTagsContainer.innerHTML = '';
            (post.tags || []).forEach(tag => this._renderTagChip(tag));
        }
        if (this.propsStatusPub) this.propsStatusPub.classList.add('active');
        if (this.propsStatusDraft) this.propsStatusDraft.classList.remove('active');
    }

    _renderTagChip(tag) {
        if (!this.propsTagsContainer || !tag.trim()) return;
        const chip = document.createElement('span');
        chip.className = 'props-tag-chip';
        chip.dataset.tag = tag;
        chip.innerHTML = `${tag}<button class="props-tag-remove" aria-label="Remove">&times;</button>`;
        chip.querySelector('.props-tag-remove').addEventListener('click', () => chip.remove());
        this.propsTagsContainer.appendChild(chip);
    }

    _addTagChip() {
        if (!this.propsTagInput) return;
        const val = this.propsTagInput.value.trim().replace(/^#/, '');
        if (val) this._renderTagChip(val);
        this.propsTagInput.value = '';
        this.propsTagInput.focus();
    }

    _updatePropsPanelStats() {
        if (!this.editorInstance) return;
        try {
            const markdown = this.editorInstance.getMarkdown();
            const plain = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]+`/g, ' ')
                .replace(/!\[.*?\]\(.*?\)/g, ' ').replace(/\[.*?\]\(.*?\)/g, ' ')
                .replace(/[#*_~>\-=|+]/g, ' ').replace(/\s+/g, ' ').trim();
            const words = plain ? plain.split(' ').filter(w => w.length > 0).length : 0;
            if (this.propsWordCount) this.propsWordCount.textContent = words.toLocaleString();
            if (this.propsReadTime) this.propsReadTime.textContent = Math.max(1, Math.ceil(words / 200));
        } catch (_) {}
    }

    // =============================================
    // PHASE 3 — FOCUS MODE
    // =============================================

    toggleFocusMode() {
        this.isFocusMode = !this.isFocusMode;
        if (this.appContext.blogLayout) {
            this.appContext.blogLayout.classList.toggle('focus-mode', this.isFocusMode);
        }
        if (this.mainHeader) {
            this.mainHeader.classList.toggle('focus-mode-dimmed', this.isFocusMode);
        }
        if (this.focusModeToggle) {
            this.focusModeToggle.classList.toggle('is-active', this.isFocusMode);
            const label = this.focusModeToggle.querySelector('.label');
            if (label) label.textContent = this.isFocusMode ? 'Exit Focus' : 'Focus';
        }
    }

    // =============================================
    // PHASE 3 — FLOATING SELECTION TOOLBAR
    // =============================================

    _initFloatingToolbar() {
        if (!this.floatingToolbar || !this.toastEditorContainer) return;

        this.floatingToolbar.querySelectorAll('.float-btn').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // keep selection alive
                if (!this.editorInstance) return;
                const cmd = btn.dataset.cmd;
                if (cmd === 'link') {
                    const url = prompt('Link URL:');
                    if (url) this.editorInstance.exec('addLink', { linkUrl: url, linkText: window.getSelection()?.toString() || url });
                } else {
                    this.editorInstance.exec(cmd);
                }
                this._hideFloatingToolbar();
            });
        });

        this._selectionChangeHandler = () => this._onSelectionChange();
        document.addEventListener('selectionchange', this._selectionChangeHandler);
    }

    _onSelectionChange() {
        if (!this.isEditMode || !this.floatingToolbar) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            this._hideFloatingToolbar();
            return;
        }
        const range = sel.getRangeAt(0);
        if (!this.toastEditorContainer || !this.toastEditorContainer.contains(range.commonAncestorContainer)) {
            this._hideFloatingToolbar();
            return;
        }
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) { this._hideFloatingToolbar(); return; }

        const tbW = 210;
        let left = rect.left + rect.width / 2 - tbW / 2;
        let top  = rect.top - 48;
        left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
        if (top < 8) top = rect.bottom + 8;

        this.floatingToolbar.style.left = left + 'px';
        this.floatingToolbar.style.top  = top + 'px';
        this.floatingToolbar.classList.remove('hidden');
        requestAnimationFrame(() => this.floatingToolbar.classList.add('is-visible'));
    }

    _hideFloatingToolbar() {
        if (!this.floatingToolbar) return;
        this.floatingToolbar.classList.remove('is-visible');
        setTimeout(() => {
            if (this.floatingToolbar && !this.floatingToolbar.classList.contains('is-visible')) {
                this.floatingToolbar.classList.add('hidden');
            }
        }, 160);
    }

    // =============================================
    // PHASE 3 — SLASH COMMANDS
    // =============================================

    _initSlashCommands() {
        if (!this.slashPalette || !this.toastEditorContainer) return;

        // Build palette items
        const inner = this.slashPalette.querySelector('.slash-palette-inner');
        if (!inner) return;
        inner.innerHTML = '';
        SLASH_COMMANDS.forEach((cmd, i) => {
            const item = document.createElement('div');
            item.className = 'slash-cmd-item';
            item.dataset.index = i;
            item.innerHTML = `<span class="slash-cmd-icon">${cmd.icon}</span><span class="slash-cmd-label">${cmd.label}</span><span class="slash-cmd-hint">${cmd.hint}</span>`;
            item.addEventListener('mousedown', (e) => { e.preventDefault(); this._executeSlashCommand(i); });
            inner.appendChild(item);
        });

        // Attach directly to .ProseMirror — more reliable than container capture
        // Fall back to container capture if ProseMirror isn't found yet
        const proseMirror = this.toastEditorContainer.querySelector('.ProseMirror');
        const target = proseMirror || this.toastEditorContainer;
        this._slashListenerTarget = target;
        this._slashKeydownBound = (e) => this._onEditorKeydown(e);
        target.addEventListener('keydown', this._slashKeydownBound, true);
    }

    _onEditorKeydown(e) {
        if (this.isSlashOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.slashFocusIndex = (this.slashFocusIndex + 1) % SLASH_COMMANDS.length;
                this._updateSlashFocus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.slashFocusIndex = (this.slashFocusIndex - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length;
                this._updateSlashFocus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._executeSlashCommand(this.slashFocusIndex);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._hideSlashPalette();
            } else if (e.key.length === 1 || e.key === 'Backspace') {
                this._hideSlashPalette();
            }
            return;
        }
        if (e.key === '/') {
            setTimeout(() => this._showSlashPalette(), 0);
        }
    }

    _showSlashPalette() {
        if (!this.slashPalette || !this.editorInstance) return;
        const sel = window.getSelection();
        let top = 200, left = 100;
        if (sel && sel.rangeCount > 0) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (rect.width || rect.height) {
                top  = rect.bottom + 8;
                left = Math.max(8, Math.min(rect.left, window.innerWidth - 248));
            }
        }
        this.slashPalette.style.top  = top + 'px';
        this.slashPalette.style.left = left + 'px';
        this.slashFocusIndex = 0;
        this._updateSlashFocus();
        this.slashPalette.classList.remove('hidden');
        requestAnimationFrame(() => this.slashPalette.classList.add('is-visible'));
        this.isSlashOpen = true;
    }

    _hideSlashPalette() {
        if (!this.slashPalette) return;
        this.slashPalette.classList.remove('is-visible');
        this.isSlashOpen = false;
        setTimeout(() => {
            if (!this.isSlashOpen && this.slashPalette) this.slashPalette.classList.add('hidden');
        }, 160);
    }

    _updateSlashFocus() {
        if (!this.slashPalette) return;
        this.slashPalette.querySelectorAll('.slash-cmd-item').forEach((item, i) => {
            item.classList.toggle('is-focused', i === this.slashFocusIndex);
        });
        const focused = this.slashPalette.querySelector('.is-focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
    }

    _executeSlashCommand(index) {
        if (!this.editorInstance) return;
        this._hideSlashPalette();
        const cmd = SLASH_COMMANDS[index];
        if (!cmd) return;

        // Delete the "/" using document.execCommand on the focused contenteditable.
        // Synthetic KeyboardEvent doesn't trigger ProseMirror's internal handlers,
        // but execCommand('delete') operates directly on the browser's editing model,
        // which ProseMirror reconciles via its MutationObserver.
        const proseMirror = this.toastEditorContainer.querySelector('.ProseMirror');
        if (proseMirror) {
            proseMirror.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                // Extend selection one char back to cover the "/"
                if (range.startOffset > 0) {
                    const delRange = document.createRange();
                    delRange.setStart(range.startContainer, range.startOffset - 1);
                    delRange.setEnd(range.startContainer, range.startOffset);
                    sel.removeAllRanges();
                    sel.addRange(delRange);
                }
            }
            // eslint-disable-next-line no-restricted-syntax
            document.execCommand('delete', false, null);
        }

        // Execute after a tick so ProseMirror reconciles the deletion first
        setTimeout(() => { if (this.editorInstance) cmd.exec(this.editorInstance, this); }, 30);
    }

    // Task 6: Auto-save with readable "Draft saved" text
    triggerAutoSave() {
        if (!this.appContext.currentPostId || !this.editorInstance) return;

        // Update live indicators on every keystroke
        this._updateWordCount();
        this._updateDraftBadge();
        this._updatePropsPanelStats();

        if (this.saveStatusText) {
            this.saveStatusText.textContent = 'Saving…';
            this.saveStatusText.classList.remove('fade-out', 'error');
        }

        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            try {
                const draftContent = this.editorInstance.getMarkdown();
                const titleVal = this.postTitleInput ? this.postTitleInput.value : '';
                localStorage.setItem(`draft_${this.appContext.currentPostId}`, draftContent);
                localStorage.setItem(`draft_title_${this.appContext.currentPostId}`, titleVal);

                if (this.saveStatusText) {
                    this.saveStatusText.textContent = 'Draft saved';
                    this.saveStatusText.classList.remove('error');
                    // Fade out after showing briefly
                    setTimeout(() => {
                        if (this.saveStatusText) {
                            this.saveStatusText.classList.add('fade-out');
                            setTimeout(() => {
                                if (this.saveStatusText) {
                                    this.saveStatusText.textContent = '';
                                    this.saveStatusText.classList.remove('fade-out');
                                }
                            }, 600);
                        }
                    }, 1200);
                }
            } catch (err) {
                // localStorage may be full (private mode, quota exceeded)
                if (this.saveStatusText) {
                    this.saveStatusText.textContent = 'Save failed';
                    this.saveStatusText.classList.add('error');
                }
            }
        }, 1000);
    }

    // Task 7: Live word count + read time
    _updateWordCount() {
        if (!this.editorInstance || !this.wordCountDisplay) return;
        try {
            const markdown = this.editorInstance.getMarkdown();
            const plainText = markdown
                .replace(/```[\s\S]*?```/g, ' ')   // strip fenced code blocks
                .replace(/`[^`\n]+`/g, ' ')         // strip inline code
                .replace(/!\[.*?\]\(.*?\)/g, ' ')   // strip images
                .replace(/\[.*?\]\(.*?\)/g, ' ')    // strip links
                .replace(/[#*_~>\-=|+]/g, ' ')      // strip markdown symbols
                .replace(/\s+/g, ' ')
                .trim();
            const words = plainText ? plainText.split(' ').filter(w => w.length > 0).length : 0;
            const readTime = Math.max(1, Math.ceil(words / 200));
            this.wordCountDisplay.textContent = `${words.toLocaleString()} words · ${readTime} min read`;
        } catch (_) {
            // Silently fail — editor state may be temporarily invalid
        }
    }

    // Task 9: Draft badge — shows when content differs from originally loaded version
    _updateDraftBadge() {
        if (!this.editorInstance) return;
        try {
            const currentContent = this.editorInstance.getMarkdown();
            const currentTitle = this.postTitleInput ? this.postTitleInput.value : '';
            const isDirty = currentContent !== this.initialContent || currentTitle !== this.initialTitle;

            if (this.draftBadge) this.draftBadge.classList.toggle('hidden', !isDirty);
            // Task 8: Only show Discard when there's something to discard
            if (this.discardBtn) this.discardBtn.classList.toggle('hidden', !isDirty);
        } catch (_) {
            // Silently fail
        }
    }

    // Task 8: Discard changes with edge case handling
    discardChanges() {
        if (!this.editorInstance) return;

        try {
            const currentContent = this.editorInstance.getMarkdown();
            const currentTitle = this.postTitleInput ? this.postTitleInput.value : '';
            const hasChanges = currentContent !== this.initialContent || currentTitle !== this.initialTitle;
            if (!hasChanges) return; // nothing to discard, button shouldn't be visible anyway
        } catch (_) {
            return;
        }

        if (!confirm('Discard all unsaved changes and revert to the original content?')) return;

        try {
            this.editorInstance.setMarkdown(this.initialContent);
            if (this.postTitleInput) this.postTitleInput.value = this.initialTitle;

            if (this.appContext.currentPostId) {
                localStorage.removeItem(`draft_${this.appContext.currentPostId}`);
                localStorage.removeItem(`draft_title_${this.appContext.currentPostId}`);
            }

            this._updateDraftBadge();
            this._updateWordCount();

            if (this.saveStatusText) {
                this.saveStatusText.textContent = 'Changes discarded';
                this.saveStatusText.classList.remove('error', 'fade-out');
                setTimeout(() => {
                    if (this.saveStatusText) {
                        this.saveStatusText.classList.add('fade-out');
                        setTimeout(() => {
                            if (this.saveStatusText) {
                                this.saveStatusText.textContent = '';
                                this.saveStatusText.classList.remove('fade-out');
                            }
                        }, 600);
                    }
                }, 1500);
            }
        } catch (err) {
            console.error('Failed to discard changes:', err);
        }
    }

    toggleWideMode() {
        if (!this.appContext.blogLayout) return;

        this.isWideMode = !this.isWideMode;
        this.appContext.blogLayout.classList.toggle('wide-mode', this.isWideMode);

        const label = this.wideModeToggle.querySelector('.label');
        if (label) label.textContent = this.isWideMode ? 'Normal' : 'Wide';
    }

    async toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        const toggleLabel = this.editModeToggle.querySelector('.label');

        if (this.isEditMode) {
            if (toggleLabel) toggleLabel.textContent = 'View';
            // Task 3: Active state so user knows they're in edit mode
            this.editModeToggle.classList.add('is-active');

            if (this.postCanvas) this.postCanvas.classList.add('is-editing');
            if (this.publishBtn) this.publishBtn.classList.remove('hidden');
            if (this.insertImageBtn) this.insertImageBtn.classList.remove('hidden');
            if (this.propsPanelToggle) this.propsPanelToggle.classList.remove('hidden');
            if (this.wordCountDisplay) this.wordCountDisplay.classList.remove('hidden');
            // Populate properties panel with current post metadata
            this._populatePropsPanel(BlogService.getPostById(this.appContext.currentPostId));
            if (this.postBody) this.postBody.classList.add('hidden');
            if (this.postTitleDisplay) this.postTitleDisplay.classList.add('hidden');
            if (this.toastEditorContainer) this.toastEditorContainer.classList.remove('hidden');
            if (this.postTitleInput) this.postTitleInput.classList.remove('hidden');

            await this.initToastEditor();

            const draft = localStorage.getItem(`draft_${this.appContext.currentPostId}`);
            const draftTitle = localStorage.getItem(`draft_title_${this.appContext.currentPostId}`);

            if (draft && this.editorInstance) {
                this.editorInstance.setMarkdown(draft);
                if (draftTitle && this.postTitleInput) this.postTitleInput.value = draftTitle;
            } else if (this.editorInstance) {
                this.editorInstance.setMarkdown(this.initialContent);
            }

            if (this.postTitleInput) this.postTitleInput.focus();

            // Populate live indicators on entry
            this._updateWordCount();
            this._updateDraftBadge();

        } else {
            if (toggleLabel) toggleLabel.textContent = 'Edit';
            this.editModeToggle.classList.remove('is-active');

            if (this.postCanvas) this.postCanvas.classList.remove('is-editing');
            if (this.publishBtn) this.publishBtn.classList.add('hidden');
            if (this.insertImageBtn) this.insertImageBtn.classList.add('hidden');
            if (this.propsPanelToggle) this.propsPanelToggle.classList.add('hidden');
            if (this.wordCountDisplay) this.wordCountDisplay.classList.add('hidden');
            if (this.discardBtn) this.discardBtn.classList.add('hidden');
            if (this.draftBadge) this.draftBadge.classList.add('hidden');
            // Close props panel on exit
            this.isPropsPanelOpen = false;
            if (this.propsPanel) this.propsPanel.classList.remove('is-open');
            if (this.postBody) this.postBody.classList.remove('hidden');
            if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
            if (this.toastEditorContainer) this.toastEditorContainer.classList.add('hidden');
            if (this.postTitleInput) this.postTitleInput.classList.add('hidden');

            // Fall back to initialTitle if input is blank
            if (this.postTitleDisplay) {
                this.postTitleDisplay.textContent =
                    (this.postTitleInput && this.postTitleInput.value.trim()) ||
                    this.initialTitle ||
                    'Untitled';
            }

            if (this.editorInstance && this.postBody) {
                this.postBody.innerHTML = BlogRenderer.render(this.editorInstance.getMarkdown());
            }
        }
    }

    showTokenModal() {
        if (this.tokenModal) this.tokenModal.classList.add('active');
        if (this.tokenInput) {
            this.tokenInput.value = '';
            this.tokenInput.focus();
        }
        if (this.publishStatus) {
            this.publishStatus.textContent = '';
            this.publishStatus.className = 'publish-status';
        }
    }

    hideTokenModal() {
        if (this.tokenModal) this.tokenModal.classList.remove('active');
        if (this.tokenInput) this.tokenInput.value = '';
        if (this.publishStatus) {
            this.publishStatus.textContent = '';
            this.publishStatus.className = 'publish-status';
        }
    }

    setPublishStatus(msg, type) {
        if (!this.publishStatus) return;
        this.publishStatus.textContent = msg;
        this.publishStatus.className = `publish-status ${type}`;
    }

    async publishToGitHub() {
        const token = this.tokenInput ? this.tokenInput.value.trim() : '';

        if (!token) {
            this.setPublishStatus('Paste a token first.', 'error');
            return;
        }
        if (!this.editorInstance) {
            this.setPublishStatus('Editor not ready.', 'error');
            return;
        }
        if (!this.appContext.currentPostId) {
            this.setPublishStatus('No post selected.', 'error');
            return;
        }

        const post = BlogService.getPostById(this.appContext.currentPostId);
        if (!post) {
            this.setPublishStatus('Could not find post metadata.', 'error');
            return;
        }

        this.confirmPublishBtn.textContent = 'Pushing…';
        this.confirmPublishBtn.disabled = true;
        this.setPublishStatus('Committing to GitHub…', 'pending');

        try {
            const github = new GitHubStorageService('khmurakami', 'khmurakami.github.io');
            github.setToken(token);

            const title = (this.postTitleInput && this.postTitleInput.value.trim()) || post.title;
            const markdownContent = [
                '---',
                `title: ${title}`,
                `date: ${post.date}`,
                `tags: [${post.tags.join(', ')}]`,
                `category: ${post.category}`,
                `summary: ${post.summary}`,
                '---',
                '',
                this.editorInstance.getMarkdown()
            ].join('\n');

            await github.commitFiles(
                `docs(blog): Update post ${this.appContext.currentPostId}`,
                [{ path: post.file.replace('./', ''), content: markdownContent }]
            );

            // Update baseline so draft badge clears after publish
            this.initialContent = this.editorInstance.getMarkdown();
            this.initialTitle = title;

            this.setPublishStatus('Pushed. Pages will rebuild in ~1–2 min.', 'success');

            localStorage.removeItem(`draft_${this.appContext.currentPostId}`);
            localStorage.removeItem(`draft_title_${this.appContext.currentPostId}`);
            this._updateDraftBadge();

            setTimeout(() => {
                this.hideTokenModal();
                if (this.isEditMode) this.toggleEditMode();
            }, 2500);

        } catch (error) {
            let msg = error.message || 'Unknown error';
            if (/401|Bad credentials/i.test(msg)) {
                msg = 'Invalid token — ensure it has Contents: write access.';
            } else if (/404/.test(msg)) {
                msg = 'Repo or file not found. Check the post file path.';
            } else if (/network|fetch|failed to fetch/i.test(msg)) {
                msg = 'Network error. Check your connection and try again.';
            }
            this.setPublishStatus('Failed: ' + msg, 'error');
        } finally {
            this.confirmPublishBtn.textContent = 'Push';
            this.confirmPublishBtn.disabled = false;
        }
    }

    showNotification(message, type = 'success') {
        if (!this.notificationCenter) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="icon">${type === 'success' ? '✓' : '⚠'}</span><span class="message">${message}</span>`;
        this.notificationCenter.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 600);
        }, 4000);
    }

    reset() {
        this.isEditMode = false;
        if (!this.editModeToggle) return;

        const toggleLabel = this.editModeToggle.querySelector('.label');
        if (toggleLabel) toggleLabel.textContent = 'Edit';
        this.editModeToggle.classList.remove('is-active');

        if (this.publishBtn) this.publishBtn.classList.add('hidden');
        if (this.insertImageBtn) this.insertImageBtn.classList.add('hidden');
        if (this.wordCountDisplay) this.wordCountDisplay.classList.add('hidden');
        if (this.discardBtn) this.discardBtn.classList.add('hidden');
        if (this.draftBadge) this.draftBadge.classList.add('hidden');
        if (this.postBody) this.postBody.classList.remove('hidden');
        if (this.postTitleDisplay) this.postTitleDisplay.classList.remove('hidden');
        if (this.toastEditorContainer) this.toastEditorContainer.classList.add('hidden');
        if (this.postTitleInput) this.postTitleInput.classList.add('hidden');
        if (this.postCanvas) this.postCanvas.classList.remove('is-editing');

        if (this.editorInstance) {
            try { this.editorInstance.destroy(); } catch (_) { /* ignore */ }
            this.editorInstance = null;
        }

        this.initialContent = '';
        this.initialTitle = '';
        clearTimeout(this.autoSaveTimeout);

        if (this.saveStatusText) {
            this.saveStatusText.textContent = '';
            this.saveStatusText.className = 'save-status-text';
        }

        // Phase 2 cleanup
        this.isPropsPanelOpen = false;
        if (this.propsPanel) this.propsPanel.classList.remove('is-open');
        if (this.propsPanelToggle) this.propsPanelToggle.classList.add('hidden');

        // Phase 3 cleanup
        if (this.isFocusMode) this.toggleFocusMode();
        if (this._selectionChangeHandler) {
            document.removeEventListener('selectionchange', this._selectionChangeHandler);
            this._selectionChangeHandler = null;
        }
        this._hideFloatingToolbar();
        if (this._slashKeydownBound && this._slashListenerTarget) {
            this._slashListenerTarget.removeEventListener('keydown', this._slashKeydownBound, true);
            this._slashKeydownBound = null;
            this._slashListenerTarget = null;
        }
        this._hideSlashPalette();
        this.isSlashOpen = false;
    }

    setEditorContent(title, content) {
        this.initialTitle = title;
        this.initialContent = content;
        if (this.postTitleInput) this.postTitleInput.value = title;
        if (this.editorInstance && this.isEditMode) {
            this.editorInstance.setMarkdown(content);
        }
    }
}
