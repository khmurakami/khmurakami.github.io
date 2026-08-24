/**
 * The generated blog index.
 *
 * `js/config/posts.js` is what every listing on the site reads — the blog page,
 * the sidebar, the terminal's `blog` command and the stack of papers on the
 * roof. It used to be maintained by hand beside the Markdown it described, and
 * publishing rewrote the Markdown without touching it, so the two drifted apart
 * the first time anyone edited a title.
 *
 * It is generated from the front matter now, by `scripts/build_posts.mjs` on
 * disk and by the editor when it publishes. Both go through `renderIndex`, so
 * these tests cover both writers at once.
 */
import { describe, it, expect } from 'vitest';
import { entryFor, renderIndex } from '../js/engine/PostIndex.js';
import { PostDocument } from '../js/engine/PostDocument.js';

const entry = (id, data) => entryFor(id, data);

describe('an index entry', () => {
    it('is built from front matter', () => {
        const { data } = PostDocument.parse(
            '---\ntitle: A Post\ndate: 2026-01-02\ntags: [x, y]\n'
            + 'category: General\nsummary: Short.\n---\n\nBody.\n');

        expect(entry('2026-01-02-a-post', data)).toEqual({
            id: '2026-01-02-a-post',
            title: 'A Post',
            date: '2026-01-02',
            tags: ['x', 'y'],
            category: 'General',
            summary: 'Short.',
            file: './posts/2026-01-02-a-post.md'
        });
    });

    it('falls back rather than producing undefined fields', () => {
        const e = entry('bare', {});
        expect(e.title).toBe('bare');
        expect(e.tags).toEqual([]);
        expect(e.category).toBe('Uncategorised');
    });

    it('takes a lone tag as a one-item list', () => {
        expect(entry('x', { tags: 'solo' }).tags).toEqual(['solo']);
    });
});

describe('rendering the index file', () => {
    const entries = [
        entry('old', { title: 'Old', date: '2026-01-01', category: 'A', summary: 's' }),
        entry('new', { title: 'New', date: '2026-06-01', category: 'A', summary: 's' })
    ];

    it('sorts newest first, which is the order the site shows', () => {
        const text = renderIndex(entries);
        expect(text.indexOf('"new"')).toBeLessThan(text.indexOf('"old"'));
    });

    it('is stable: the same entries render byte-identically', () => {
        // Otherwise the CI drift check flags noise, and everybody learns to
        // ignore it.
        expect(renderIndex(entries)).toBe(renderIndex([...entries].reverse()));
    });

    it('says it is generated', () => {
        expect(renderIndex(entries)).toContain('GENERATED FILE');
    });

    it('escapes a title that would otherwise break the file', () => {
        const text = renderIndex([
            entry('x', { title: 'He said "hi" \\ then left', date: '2026-01-01' })
        ]);
        // The real assertion: the rendered module still parses and round-trips.
        const posts = evaluate(text);
        expect(posts[0].title).toBe('He said "hi" \\ then left');
    });

    it('renders a file the site can import', () => {
        const posts = evaluate(renderIndex(entries));
        expect(posts.map(p => p.id)).toEqual(['new', 'old']);
        expect(posts[0].file).toBe('./posts/new.md');
    });
});

/** Runs a rendered index module and hands back its `posts`. */
function evaluate(source) {
    // eslint-disable-next-line no-new-func
    return new Function(`${source.replace('export const posts', 'const posts')}; return posts;`)();
}
