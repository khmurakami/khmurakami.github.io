import { describe, it, expect } from 'vitest';
import { BlogService } from '../js/engine/BlogService.js';

describe('BlogService', () => {
    it('should return all posts', () => {
        const posts = BlogService.getAllPosts();
        expect(posts.length).toBeGreaterThan(0);
        expect(posts[0]).toHaveProperty('title');
    });

    it('should get a post by id', () => {
        const post = BlogService.getPostById('2026-03-14-welcome-to-my-blog');
        expect(post).toBeDefined();
        expect(post.title).toBe('Welcome to My Blog');
    });

    it('should return null for non-existent post id', () => {
        const post = BlogService.getPostById('non-existent');
        expect(post).toBeNull();
    });

    it('should search posts by title', () => {
        const results = BlogService.searchPosts('Programming');
        expect(results.length).toBe(1);
        expect(results[0].title).toBe('My First Programming Find');
    });

    it('should filter posts by category', () => {
        const results = BlogService.filterByCategory('General');
        expect(results.length).toBe(1);
        expect(results[0].category).toBe('General');
    });
});
