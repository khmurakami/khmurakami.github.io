import { describe, it, expect, vi } from 'vitest';
import { BlogService } from '../js/engine/BlogService.js';

describe('Recent Posts Widget', () => {
    it('should fetch the latest 3 posts', () => {
        const posts = BlogService.getAllPosts().slice(0, 3);
        expect(posts.length).toBeLessThanOrEqual(3);
        // Assuming we have at least 2 sample posts
        expect(posts.length).toBe(2); 
        expect(new Date(posts[0].date).getTime()).toBeGreaterThanOrEqual(new Date(posts[1].date).getTime());
    });
});
