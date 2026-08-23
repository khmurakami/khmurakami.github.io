/**
 * A small shell running on the rooftop CRT.
 *
 * It is a real command loop over a small virtual filesystem rather than a
 * scripted animation, because the moment someone types `ls` and it works is the
 * whole point. History, tab completion and unknown-command handling all behave
 * the way a shell should — the illusion breaks instantly if they do not.
 *
 * Commands can open the site's actual panels, so the terminal is a genuine
 * navigation surface and not a toy.
 */
export class Terminal {
    /**
     * @param {object} config
     * @param {object} config.files    - virtual filesystem: name -> string | () => string
     * @param {object} [config.actions] - name -> fn, commands that do something outside the shell
     * @param {string} [config.motd]
     */
    constructor({ files = {}, actions = {}, motd = '' } = {}) {
        this.files = files;
        this.actions = actions;
        this.motd = motd;
        this.history = [];
        this.historyIndex = -1;
        this.el = null;
    }

    /** Builds the DOM for the terminal and returns it for a Panel to display. */
    mount() {
        const root = document.createElement('div');
        root.className = 'term';
        root.innerHTML = `
            <div class="term-out" aria-live="polite"></div>
            <label class="term-line">
                <span class="term-prompt">visitor@rooftop:~$</span>
                <input class="term-in" autocomplete="off" autocapitalize="off"
                       spellcheck="false" aria-label="Terminal input">
            </label>`;

        this.el = root;
        this.out = root.querySelector('.term-out');
        this.input = root.querySelector('.term-in');

        if (this.motd) this.print(this.motd, 'motd');

        this.input.addEventListener('keydown', (e) => this.onKey(e));
        root.addEventListener('click', () => this.input.focus());
        return root;
    }

    print(text, cls = '') {
        const line = document.createElement('div');
        line.className = `term-row ${cls}`.trim();
        line.textContent = text;
        this.out.appendChild(line);
        this.out.scrollTop = this.out.scrollHeight;
        return line;
    }

    onKey(e) {
        if (e.key === 'Enter') {
            const raw = this.input.value;
            this.input.value = '';
            this.submit(raw);
            e.preventDefault();
            return;
        }

        // Shell history on the arrow keys.
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!this.history.length) return;
            if (e.key === 'ArrowUp') {
                this.historyIndex = Math.min(this.historyIndex + 1, this.history.length - 1);
            } else {
                this.historyIndex = Math.max(this.historyIndex - 1, -1);
            }
            this.input.value = this.historyIndex < 0
                ? ''
                : this.history[this.history.length - 1 - this.historyIndex];
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            this.complete();
        }
    }

    /** Tab completion over commands first, then filenames. */
    complete() {
        const value = this.input.value;
        const parts = value.split(/\s+/);
        const word = parts[parts.length - 1] || '';

        const pool = parts.length <= 1
            ? [...this.commandNames(), ...Object.keys(this.files)]
            : Object.keys(this.files);

        const hits = pool.filter(n => n.startsWith(word));
        if (!hits.length) return;

        if (hits.length === 1) {
            parts[parts.length - 1] = hits[0];
            this.input.value = parts.join(' ') + ' ';
        } else {
            this.print(hits.join('   '), 'dim');
        }
    }

    commandNames() {
        return ['help', 'ls', 'cat', 'clear', 'whoami', 'echo', 'date', ...Object.keys(this.actions)];
    }

    submit(raw) {
        const line = raw.trim();
        this.print(`visitor@rooftop:~$ ${raw}`, 'echoed');

        if (!line) return;
        this.history.push(line);
        this.historyIndex = -1;

        const [cmd, ...args] = line.split(/\s+/);
        this.run(cmd, args);
    }

    run(cmd, args) {
        switch (cmd) {
            case 'help':
                this.print('commands: ' + this.commandNames().sort().join(', '));
                this.print('try: ls, cat about.txt, projects, blog, resume');
                return;

            case 'ls': {
                const names = Object.keys(this.files);
                if (!names.length) { this.print('(empty)'); return; }
                this.print(names.join('   '));
                return;
            }

            case 'cat': {
                if (!args.length) { this.print('cat: missing operand', 'err'); return; }
                const file = this.files[args[0]];
                if (file === undefined) {
                    this.print(`cat: ${args[0]}: No such file or directory`, 'err');
                    return;
                }
                const text = typeof file === 'function' ? file() : file;
                text.split('\n').forEach(l => this.print(l));
                return;
            }

            case 'clear':
                this.out.innerHTML = '';
                return;

            case 'whoami':
                this.print('visitor');
                return;

            case 'echo':
                this.print(args.join(' '));
                return;

            case 'date':
                this.print(new Date().toString());
                return;

            default: {
                const action = this.actions[cmd];
                if (action) { action(args, this); return; }
                // Mirror a real shell: name the command, suggest, exit non-zero.
                this.print(`${cmd}: command not found`, 'err');
                const near = this.commandNames().find(n => n.startsWith(cmd[0]));
                if (near) this.print(`did you mean '${near}'?`, 'dim');
            }
        }
    }
}
