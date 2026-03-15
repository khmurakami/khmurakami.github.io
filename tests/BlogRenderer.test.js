import { describe, it, expect, vi } from 'vitest';
import { BlogRenderer } from '../js/engine/BlogRenderer.js';

// Mock marked.js
global.marked = {
    parse: vi.fn(md => `<h1>${md}</h1>`)
};

describe('BlogRenderer', () => {
    it('should render markdown to html', () => {
        const html = BlogRenderer.render('# Hello');
        expect(html).toBe('<h1># Hello</h1>');
        expect(global.marked.parse).toHaveBeenCalledWith('# Hello');
    });

    it('should create a post preview element', () => {
        const post = {
            id: 'test',
            title: 'Test Post',
            date: '2026-03-14',
            summary: 'Summary'
        };
        const element = BlogRenderer.createPreviewElement(post);
        expect(element.classList.contains('post-preview')).toBe(true);
        expect(element.innerHTML).toContain('Test Post');
        expect(element.dataset.id).toBe('test');
    });
});
