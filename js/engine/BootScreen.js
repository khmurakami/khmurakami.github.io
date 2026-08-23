/**
 * The screen you see while the world loads.
 *
 * It lives in `index.html` as real markup rather than being built here, so it
 * is on screen from the first paint — before this module has been fetched,
 * parsed or run. A loading screen created by JavaScript cannot cover the gap it
 * exists to cover, because the gap starts before the JavaScript does.
 *
 * Progress is real. There are over a hundred image slots across the scenes and
 * they are counted as they settle, so the bar reflects the actual download
 * rather than an animation timed to look plausible.
 *
 * The bar is a row of lit windows because that is what the world outside is
 * made of — the skyline's windows toggle on and off all night in `Ambient`.
 * A generic progress bar in front of a hand-drawn night city announces that the
 * page is a page; this reads as the building waking up.
 */
export class BootScreen {
    /**
     * @param {object} config
     * @param {HTMLElement} config.root      - the boot element already in the page
     * @param {number} [config.cells]        - how many windows the bar is made of
     * @param {boolean} [config.reducedMotion]
     */
    constructor({ root, cells = 28, reducedMotion = false }) {
        this.root = root || null;
        this.reducedMotion = reducedMotion;

        // A missing element must not take the game down with it. The boot
        // screen is a courtesy over the load; the world should still start if
        // somebody edits the markup out from under it.
        this.barEl = this.root ? this.root.querySelector('[data-boot-bar]') : null;
        this.statusEl = this.root ? this.root.querySelector('[data-boot-status]') : null;

        this.total = 0;
        this.settled = 0;
        this.finished = false;

        this.cells = [];
        if (this.barEl) {
            // Built here rather than written out in the markup: the count is a
            // tuning value, and twenty-eight hand-written divs is a thing that
            // goes stale the first time anyone changes it.
            for (let i = 0; i < cells; i++) {
                const cell = document.createElement('i');
                cell.className = 'boot-cell';
                this.barEl.appendChild(cell);
                this.cells.push(cell);
            }
        }
    }

    /** Fraction complete, 0..1. Always 0 until a total is known. */
    get progress() {
        if (!this.total) return 0;
        return Math.max(0, Math.min(1, this.settled / this.total));
    }

    /**
     * Declares how many assets are being waited on.
     *
     * Set once the scenes exist and before loading starts. Until then the bar
     * shows nothing rather than guessing — a bar that jumps backwards when the
     * real total arrives is worse than a bar that waits.
     */
    begin(total) {
        this.total = total;
        this.render();
    }

    /** One more asset has settled, loaded or not. */
    step() {
        this.settled++;
        this.render();
    }

    render() {
        if (this.finished || !this.root) return;

        const lit = Math.round(this.progress * this.cells.length);
        this.cells.forEach((c, i) => c.classList.toggle('lit', i < lit));

        if (this.statusEl && this.total) {
            this.statusEl.textContent = `${this.settled} / ${this.total}`;
        }
    }

    /**
     * Reveals the world.
     *
     * Call this after the first frame has actually been drawn, never when
     * loading finishes — the gap between the last image arriving and the first
     * frame appearing is exactly long enough to show a black canvas, which
     * reads as the thing having crashed on the finish line.
     */
    done() {
        if (this.finished) return;
        this.finished = true;
        if (!this.root) return;

        // Fill the bar before leaving. Ending on a partial bar looks like a
        // failure even when everything loaded, because some slots are legitimately
        // missing and settle as errors.
        this.cells.forEach(c => c.classList.add('lit'));

        this.root.setAttribute('aria-busy', 'false');
        this.root.classList.add('gone');

        // `transitionend` is the right signal but not a guaranteed one — it
        // does not fire if the transition is overridden away, and a listener
        // that never runs leaves the element in the tree forever. It is
        // click-through and invisible by then, so this is tidiness rather than
        // a fix, but tidiness that costs one timer is worth having.
        const remove = () => { this.root.hidden = true; };
        if (this.reducedMotion) {
            remove();
        } else {
            this.root.addEventListener('transitionend', remove, { once: true });
            setTimeout(remove, 1200);
        }
    }

    /**
     * Something went wrong badly enough that there will be no world.
     *
     * Without this the screen sits there filling up forever, which is
     * indistinguishable from a slow connection.
     */
    fail(message) {
        if (this.finished || !this.root) return;
        this.root.classList.add('failed');
        this.root.setAttribute('aria-busy', 'false');
        if (this.statusEl) this.statusEl.textContent = message;
    }
}
