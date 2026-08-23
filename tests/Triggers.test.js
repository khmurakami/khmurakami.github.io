import { describe, it, expect } from 'vitest';
import { Triggers } from '../js/engine/Triggers.js';

const zones = [
    { id: 'library', x: 500, width: 120, action: 'blog' },
    { id: 'studio',  x: 900, width: 120, action: 'projects' },
    { id: 'house',   x: 1300, width: 200, action: 'about' }
];

describe('Triggers.zoneAt', () => {
    it('matches anywhere inside the doorway, not just the exact centre', () => {
        const t = new Triggers(zones);
        expect(t.zoneAt(500).id).toBe('library');
        expect(t.zoneAt(441).id).toBe('library');   // just inside the left edge
        expect(t.zoneAt(559).id).toBe('library');   // just inside the right edge
    });

    it('returns null between doorways', () => {
        expect(new Triggers(zones).zoneAt(700)).toBeNull();
    });

    it('picks the nearest centre when zones overlap', () => {
        const t = new Triggers([
            { id: 'wide', x: 500, width: 600 },
            { id: 'narrow', x: 700, width: 100 }
        ]);
        expect(t.zoneAt(700).id).toBe('narrow');
    });
});

describe('Triggers.update transitions', () => {
    it('fires entered once on arrival, not every frame', () => {
        const t = new Triggers(zones);
        expect(t.update(500).entered.id).toBe('library');
        expect(t.update(510).entered).toBeNull();   // still inside
        expect(t.update(520).entered).toBeNull();
    });

    it('fires exited when leaving', () => {
        const t = new Triggers(zones);
        t.update(500);
        const r = t.update(700);
        expect(r.exited.id).toBe('library');
        expect(r.active).toBeNull();
    });

    it('reports both when stepping straight from one doorway to another', () => {
        const t = new Triggers(zones);
        t.update(500);
        const r = t.update(900);
        expect(r.exited.id).toBe('library');
        expect(r.entered.id).toBe('studio');
    });

    it('re-fires entered after a reset, so returning from an interior re-prompts', () => {
        const t = new Triggers(zones);
        t.update(500);
        expect(t.update(500).entered).toBeNull();
        t.reset();
        expect(t.update(500).entered.id).toBe('library');
    });

    it('is inert with no zones configured', () => {
        const t = new Triggers();
        const r = t.update(123);
        expect(r).toEqual({ entered: null, exited: null, active: null });
    });
});
