/**
 * Diegetic panels — the content surfaces the world opens onto.
 *
 * DOM rather than canvas, deliberately. Panels carry real text: posts, project
 * write-ups, a shell, a form. On canvas all of that would be unselectable,
 * unsearchable, invisible to screen readers and impossible to scroll properly.
 * The panel is styled to belong to the world; the machinery underneath stays
 * ordinary HTML so it behaves the way people expect text to behave.
 */
export class Panel {
    constructor({ reducedMotion = false } = {}) {
        this.reducedMotion = reducedMotion;
        this.el = null;
        this.onClose = null;
        this.lastFocus = null;
        this.build();
    }

    build() {
        const root = document.createElement('div');
        root.className = 'panel-root';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.hidden = true;
        root.innerHTML = `
            <div class="panel-scrim" data-close></div>
            <div class="panel" role="document">
                <header class="panel-head">
                    <h2 class="panel-title"></h2>
                    <button class="panel-close" data-close aria-label="Close">esc</button>
                </header>
                <div class="panel-body" tabindex="0"></div>
            </div>`;
        document.body.appendChild(root);

        this.el = root;
        this.titleEl = root.querySelector('.panel-title');
        this.bodyEl = root.querySelector('.panel-body');

        root.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-close')) this.close();
        });

        // Escape closes, and focus is kept inside while open — a panel you can
        // tab out of behind the scrim is a trap for keyboard users.
        this.keyHandler = (e) => {
            if (this.el.hidden) return;
            if (e.key === 'Escape') { e.stopPropagation(); this.close(); return; }
            if (e.key === 'Tab') this.trapFocus(e);
        };
        document.addEventListener('keydown', this.keyHandler, true);
    }

    trapFocus(e) {
        const focusable = this.el.querySelectorAll(
            'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
        }
    }

    /**
     * @param {string} title
     * @param {string|HTMLElement} content
     * @param {object} [opts]
     * @param {string} [opts.variant] - extra class, e.g. 'crt' for the terminal
     */
    open(title, content, opts = {}) {
        this.lastFocus = document.activeElement;
        this.titleEl.textContent = title;
        this.bodyEl.innerHTML = '';

        if (content instanceof HTMLElement) this.bodyEl.appendChild(content);
        else this.bodyEl.innerHTML = content;

        this.el.className = `panel-root${opts.variant ? ' ' + opts.variant : ''}`;
        this.el.hidden = false;
        // Force a reflow so the opening transition actually plays.
        void this.el.offsetWidth;
        this.el.classList.add('open');

        const focusTarget = this.bodyEl.querySelector('input, textarea, a, button') || this.bodyEl;
        focusTarget.focus({ preventScroll: true });
    }

    close() {
        if (this.el.hidden) return;
        this.el.classList.remove('open');

        const finish = () => {
            this.el.hidden = true;
            this.bodyEl.innerHTML = '';
            if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
            if (this.onClose) this.onClose();
        };

        if (this.reducedMotion) finish();
        else setTimeout(finish, 180);
    }

    get isOpen() {
        return !this.el.hidden;
    }
}
