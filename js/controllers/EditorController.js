import { GitHubStorageService } from '../engine/GitHubStorageService.js';
import { BlogRenderer } from '../engine/BlogRenderer.js';
import { BlogService } from '../engine/BlogService.js';
import { PostDocument } from '../engine/PostDocument.js';
import { entryFor, renderIndex } from '../engine/PostIndex.js';
import { site } from '../config/site.js';

/** Text into markup. Everything that reaches `innerHTML` goes through it. */
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

/**
 * The editor library, pinned by version AND by content.
 *
 * The version was already pinned — it was on `latest`, which is a third party
 * holding a live handle on the site. But a version pin says WHICH file to
 * fetch, not WHAT is in it, and this script runs on the same page where a
 * GitHub token with write access to the repository is typed into an input. A
 * tampered CDN response would have had both.
 *
 * Subresource integrity closes that: the browser hashes what arrives and
 * refuses to execute it if it does not match. The failure mode is the editor
 * not loading, which `loadEditorLibrary` already handles.
 *
 * To move to a new version, change `base` and regenerate both hashes:
 *
 *   curl -sSL "$BASE/toastui-editor-all.min.js" \
 *     | openssl dgst -sha384 -binary | openssl base64 -A
 */
const EDITOR_CDN = {
    base: 'https://uicdn.toast.com/editor/3.2.2',
    js: 'sha384-FF8a/n4tsDcp0oRDFHNNygVDoaTZfIGmaSzvbL8wMqj/8R5sD+JKKKqfQmwJQAQY',
    css: 'sha384-Uw+ry/KtbmFNRGJd+U+hpfJou1QMHCAQc8k8OdZkclgUySjn8aJJcVTkkCeSwP6H'
};

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

        // Properties panel
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

        // Focus mode
        this.mainHeader  = document.getElementById('main-header');
        this.isFocusMode = false;

        // Floating selection toolbar
        this.floatingToolbar        = document.getElementById('floating-toolbar');
        this._selectionChangeHandler = null;

        // Slash commands
        this.slashPalette         = document.getElementById('slash-palette');
        this.isSlashOpen          = false;
        this.slashFocusIndex      = 0;
        this._slashKeydownBound   = null;
        this._slashListenerTarget = null;

        // Image modal
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
        /** The open post's whole parsed file. See `setEditorContent`. */
        this.doc = null;

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
     */
    loadEditorLibrary() {
        if (this._editorLib) return this._editorLib;

        this._editorLib = new Promise((resolve, reject) => {
            if (window.toastui && window.toastui.Editor) { resolve(); return; }

            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = `${EDITOR_CDN.base}/toastui-editor.min.css`;
            css.integrity = EDITOR_CDN.css;
            css.crossOrigin = 'anonymous';
            document.head.appendChild(css);

            // Appended AFTER the vendor sheet, so it wins on document order.
            //
            // This one line replaced an injected <style> block of ~120
            // `!important` declarations plus a MutationObserver and four
            // setTimeouts writing inline styles. None of that was a race: the
            // overrides were being appended BEFORE the vendor sheet finished
            // loading, so the vendor sheet landed last and won the cascade.
            if (!document.getElementById('tui-dark-overrides')) {
                const ours = document.createElement('link');
                ours.id = 'tui-dark-overrides';
                ours.rel = 'stylesheet';
                ours.href = 'blog-editor.css';
                document.head.appendChild(ours);
            }

            const js = document.createElement('script');
            js.src = `${EDITOR_CDN.base}/toastui-editor-all.min.js`;
            js.integrity = EDITOR_CDN.js;
            js.crossOrigin = 'anonymous';
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
                change: () => this.triggerAutoSave(),
                // The editor's own ready signal. This was a `setTimeout(…, 300)`
                // — a guess at how long Preact takes to render, which is fast
                // enough to be usually right and therefore the worst kind of
                // wrong: on a slow phone the toolbar and the slash palette
                // silently never wired up.
                load: () => {
                    this._initFloatingToolbar();
                    this._initSlashCommands();
                }
            }
        });
    }

    // ── Image insertion ──────────────────────────────────────────

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

    // ── Properties panel ─────────────────────────────────────────

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

    /**
     * The properties panel's current values.
     *
     * The panel was WRITE-ONLY: `_populatePropsPanel` filled it in and nothing
     * ever read it back, while publish took the category, date and tags from
     * the index instead. Editing metadata did nothing at all, and did it
     * silently — the fields accepted input and discarded it.
     */
    _readPropsPanel() {
        const tags = this.propsTagsContainer
            ? [...this.propsTagsContainer.querySelectorAll('.props-tag-chip')]
                .map(c => c.dataset.tag)
                .filter(Boolean)
            : [];

        return {
            category: this.propsCategory ? this.propsCategory.value.trim() : '',
            date: this.propsDate ? this.propsDate.value.trim() : '',
            tags
        };
    }

    _renderTagChip(tag) {
        if (!this.propsTagsContainer || !tag.trim()) return;
        const chip = document.createElement('span');
        chip.className = 'props-tag-chip';
        chip.dataset.tag = tag;
        chip.innerHTML = `${esc(tag)}<button class="props-tag-remove" aria-label="Remove">&times;</button>`;
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

    // ── Focus mode ───────────────────────────────────────────────

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

    // ── Floating selection toolbar ───────────────────────────────

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

    // ── Slash commands ───────────────────────────────────────────

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
            item.innerHTML = `<span class="slash-cmd-icon">${esc(cmd.icon)}</span>`
                + `<span class="slash-cmd-label">${esc(cmd.label)}</span>`
                + `<span class="slash-cmd-hint">${esc(cmd.hint)}</span>`;
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
            // Only offer Discard when there is something to discard
            if (this.discardBtn) this.discardBtn.classList.toggle('hidden', !isDirty);
        } catch (_) {
            // Silently fail
        }
    }

    /** Throws the draft away and goes back to what is published. */
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
            // The repository was written out here, so a fork published to the
            // original author's repo. It is site configuration.
            const github = new GitHubStorageService(
                site.repo.owner, site.repo.name, site.repo.branch);
            github.setToken(token);

            const title = (this.postTitleInput && this.postTitleInput.value.trim()) || post.title;
            const props = this._readPropsPanel();

            // The document as it was read off disk, so that anything this
            // editor does not model — an extra front matter key, the `# `
            // heading — survives the round trip instead of being dropped.
            //
            // Both of those used to be lost. The front matter was REBUILT from
            // five known fields, and `BlogApp` stripped the heading before the
            // editor ever saw it, so the first publish deleted the post's H1
            // from the source file for good.
            const doc = this.doc || { data: {}, heading: null };

            const data = {
                ...doc.data,
                title,
                date: props.date || post.date,
                tags: props.tags.length ? props.tags : post.tags,
                category: props.category || post.category,
                summary: doc.data.summary || post.summary
            };

            // A heading that used to echo the title keeps echoing it. One that
            // said something else is left alone — it was a deliberate choice.
            const heading = doc.heading
                ? (doc.heading.trim() === String(post.title).trim() ? title : doc.heading)
                : null;

            const markdownContent = PostDocument.serialize({
                data,
                heading,
                body: this.editorInstance.getMarkdown()
            });

            // The index, regenerated with this post's new metadata folded in.
            //
            // Publishing used to write the Markdown and leave `posts.js`
            // untouched, so a title change landed in the file while every
            // listing on the site went on showing the old one. The two files go
            // in ONE commit, so the site can never be caught between them.
            const index = renderIndex(
                BlogService.getAllPosts().map(p => p.id === post.id
                    ? entryFor(post.id, data)
                    : p)
            );

            await github.commitFiles(
                `docs(blog): update ${post.id}`,
                [
                    { path: post.file.replace('./', ''), content: markdownContent },
                    { path: 'js/config/posts.js', content: index }
                ]
            );

            // Update the baseline so the draft badge clears after publishing.
            this.doc = PostDocument.parse(markdownContent);
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
        // `message` carries API error text, which is not ours to trust — a
        // GitHub error can contain anything at all, and this element is
        // `innerHTML`.
        toast.innerHTML = `<span class="icon">${type === 'success' ? '✓' : '⚠'}</span>`
            + `<span class="message">${esc(message)}</span>`;
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
        this.doc = null;
        clearTimeout(this.autoSaveTimeout);

        if (this.saveStatusText) {
            this.saveStatusText.textContent = '';
            this.saveStatusText.className = 'save-status-text';
        }

        this.isPropsPanelOpen = false;
        if (this.propsPanel) this.propsPanel.classList.remove('is-open');
        if (this.propsPanelToggle) this.propsPanelToggle.classList.add('hidden');

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

    /**
     * Hands the editor the post that is open.
     *
     * `doc` is the whole parsed file, not just the prose. Publishing writes
     * back through it, which is what makes the round trip lossless — the
     * heading and any front matter key this editor does not model are still
     * there afterwards.
     *
     * @param {string} title
     * @param {string} content The body, which is what is edited.
     * @param {Object} [doc]   From `PostDocument.parse`.
     */
    setEditorContent(title, content, doc = null) {
        this.initialTitle = title;
        this.initialContent = content;
        this.doc = doc;
        if (this.postTitleInput) this.postTitleInput.value = title;
        if (this.editorInstance && this.isEditMode) {
            this.editorInstance.setMarkdown(content);
        }
    }
}
