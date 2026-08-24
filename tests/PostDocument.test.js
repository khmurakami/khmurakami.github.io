/**
 * The post file, round-tripped.
 *
 * Publishing from the browser rewrites the whole file from what the editor
 * holds. That is only safe if reading and writing are exact inverses, so this
 * is the invariant the whole publish path rests on — and it is one that used
 * NOT to hold: the front matter was rebuilt by string concatenation from five
 * known fields, and the leading `# ` heading was stripped on load and never
 * written back, so the first publish deleted it from the source for good.
 */
import { describe, it, expect } from 'vitest';
import { PostDocument } from '../js/engine/PostDocument.js';

const POST = `---
title: Welcome to My Blog
date: 2026-03-14
tags: [Personal, Project]
category: General
summary: An introduction to my new blog.
---

# Welcome to My Blog

I'm excited to share my journey.
`;

describe('reading a post', () => {
    it('separates front matter, heading and body', () => {
        const doc = PostDocument.parse(POST);

        expect(doc.data.title).toBe('Welcome to My Blog');
        expect(doc.data.date).toBe('2026-03-14');
        expect(doc.data.tags).toEqual(['Personal', 'Project']);
        expect(doc.data.category).toBe('General');
        expect(doc.heading).toBe('Welcome to My Blog');
        expect(doc.body).toBe("I'm excited to share my journey.");
    });

    it('keeps the heading rather than discarding it', () => {
        // The bug this file exists for. `BlogApp` stripped the H1 with a regex
        // and threw it away; publish rebuilt the file without it.
        expect(PostDocument.parse(POST).heading).not.toBeNull();
    });

    it('handles a post with no heading', () => {
        const doc = PostDocument.parse('---\ntitle: Bare\n---\n\nJust prose.\n');
        expect(doc.heading).toBeNull();
        expect(doc.body).toBe('Just prose.');
    });

    it('handles a file with no front matter at all', () => {
        const doc = PostDocument.parse('# Loose\n\nNo metadata here.\n');
        expect(doc.data).toEqual({});
        expect(doc.heading).toBe('Loose');
        expect(doc.body).toBe('No metadata here.');
    });

    it('does not treat a `---` rule inside the body as front matter', () => {
        const doc = PostDocument.parse('Some prose.\n\n---\n\nMore prose.\n');
        expect(doc.data).toEqual({});
        expect(doc.body).toContain('---');
    });
});

describe('writing a post', () => {
    it('round-trips a file unchanged', () => {
        const doc = PostDocument.parse(POST);
        const out = PostDocument.serialize(doc);
        expect(PostDocument.parse(out)).toEqual(doc);
        expect(out.trim()).toBe(POST.trim());
    });

    it('quotes a title containing a colon', () => {
        // `title: Rooftop: a portfolio` is a YAML parse error, and the old
        // string-concatenation publish wrote exactly that.
        const text = PostDocument.serialize({
            data: { title: 'Rooftop: a portfolio', tags: [] },
            body: 'x'
        });
        expect(text).toContain('title: "Rooftop: a portfolio"');
        expect(PostDocument.parse(text).data.title).toBe('Rooftop: a portfolio');
    });

    it.each([
        ['a colon', 'Rooftop: a portfolio'],
        ['a leading hash', '#hashtag as a title'],
        ['a quote', 'The "good" parts'],
        ['a backslash', 'C:\\ drive'],
        ['a leading dash', '- not a list item'],
        ['a trailing colon', 'Coming soon:'],
        ['a bare boolean', 'true'],
        ['an empty string', ''],
        ['leading space', '  padded'],
        ['a bracket', '[draft] thoughts']
    ])('round-trips a title with %s', (_label, title) => {
        const text = PostDocument.serialize({ data: { title, tags: [] }, body: 'x' });
        expect(PostDocument.parse(text).data.title).toBe(title);
    });

    it('round-trips tags containing awkward characters', () => {
        const tags = ['C++', 'a, b', 'plain'];
        const text = PostDocument.serialize({ data: { title: 't', tags }, body: 'x' });
        expect(PostDocument.parse(text).data.tags).toEqual(tags);
    });

    it('preserves front matter keys it does not model', () => {
        // An editor that silently drops fields it has not heard of is an
        // editor you cannot add a field with.
        const doc = PostDocument.parse(
            '---\ntitle: T\ndraft: true\nhero: ./x.png\n---\n\nBody.\n');
        const back = PostDocument.parse(PostDocument.serialize(doc));
        expect(back.data.hero).toBe('./x.png');
        expect(back.data.draft).toBe('true');
    });

    it('writes the known keys first, in a stable order', () => {
        const text = PostDocument.serialize({
            data: { hero: 'x', summary: 's', title: 't', tags: [], date: 'd', category: 'c' },
            body: 'b'
        });
        const keys = text.split('\n').slice(1, 7).map(l => l.split(':')[0]);
        expect(keys).toEqual(['title', 'date', 'tags', 'category', 'summary', 'hero']);
    });

    it('collapses a newline in a scalar rather than writing a broken file', () => {
        const text = PostDocument.serialize({
            data: { title: 'one\ntwo', tags: [] }, body: 'x'
        });
        expect(PostDocument.parse(text).data.title).toBe('one two');
    });
});
