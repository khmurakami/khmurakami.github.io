import { describe, it, expect, vi } from 'vitest';
import { Terminal } from '../js/engine/Terminal.js';

const make = (over = {}) => {
    const t = new Terminal({
        files: { 'about.txt': 'hello there', 'notes.txt': () => 'lazy value' },
        actions: { projects: vi.fn() },
        ...over
    });
    t.mount();
    return t;
};

const lines = (t) => [...t.out.querySelectorAll('.term-row')].map(r => r.textContent);

describe('Terminal', () => {
    it('lists the filesystem', () => {
        const t = make();
        t.submit('ls');
        expect(lines(t).join(' ')).toContain('about.txt');
    });

    it('prints file contents, including lazily computed ones', () => {
        const t = make();
        t.submit('cat about.txt');
        expect(lines(t)).toContain('hello there');
        t.submit('cat notes.txt');
        expect(lines(t)).toContain('lazy value');
    });

    it('reports a missing file the way a shell does', () => {
        const t = make();
        t.submit('cat nope.txt');
        expect(lines(t).join(' ')).toContain('No such file or directory');
    });

    it('reports unknown commands and suggests a near match', () => {
        const t = make();
        t.submit('lz');
        const out = lines(t).join(' ');
        expect(out).toContain('command not found');
        expect(out).toContain('did you mean');
    });

    it('runs registered actions', () => {
        const spy = vi.fn();
        const t = make({ actions: { projects: spy } });
        t.submit('projects');
        expect(spy).toHaveBeenCalled();
    });

    it('keeps history and recalls it in shell order', () => {
        const t = make();
        t.submit('ls');
        t.submit('whoami');
        expect(t.history).toEqual(['ls', 'whoami']);

        t.input.value = '';
        t.onKey({ key: 'ArrowUp', preventDefault() {} });
        expect(t.input.value).toBe('whoami');
        t.onKey({ key: 'ArrowUp', preventDefault() {} });
        expect(t.input.value).toBe('ls');
    });

    it('ignores an empty line without polluting history', () => {
        const t = make();
        t.submit('   ');
        expect(t.history).toHaveLength(0);
    });

    it('completes a unique prefix and lists ambiguous ones', () => {
        const t = make();
        t.input.value = 'cat ab';
        t.complete();
        expect(t.input.value).toBe('cat about.txt ');

        t.input.value = 'cat ';
        t.complete();
        expect(lines(t).join(' ')).toContain('about.txt');
    });

    it('clears the screen', () => {
        const t = make();
        t.submit('ls');
        t.submit('clear');
        expect(lines(t)).toHaveLength(0);
    });
});

describe('the terminal does not grow without bound', () => {
    it('trims scrollback to a fixed number of rows', () => {
        // Every printed line used to be kept forever. `cat` a few files or hold
        // enter down and the terminal accumulates DOM nothing ever releases.
        const term = new Terminal({ files: {}, actions: {}, motd: '' });
        term.mount();

        for (let i = 0; i < Terminal.MAX_ROWS + 250; i++) term.print(`line ${i}`);
        expect(term.out.childElementCount).toBeLessThanOrEqual(Terminal.MAX_ROWS);
    });

    it('keeps the newest rows, not the oldest', () => {
        const term = new Terminal({ files: {}, actions: {}, motd: '' });
        term.mount();
        for (let i = 0; i < Terminal.MAX_ROWS + 10; i++) term.print(`line ${i}`);
        expect(term.out.lastElementChild.textContent)
            .toBe(`line ${Terminal.MAX_ROWS + 9}`);
    });
});
