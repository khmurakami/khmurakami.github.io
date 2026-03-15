import { posts } from '../config/posts.js';

/**
 * BlogService manages fetching, searching, and filtering blog post metadata.
 */
export class BlogService {
    /**
     * Get all available blog posts, sorted by date (newest first).
     * @returns {Array} Array of post metadata objects.
     */
    static getAllPosts() {
        return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /**
     * Find a post by its unique ID.
     * @param {string} id Unique identifier for the post.
     * @returns {Object|null} The post metadata or null if not found.
     */
    static getPostById(id) {
        return posts.find(p => p.id === id) || null;
    }

    /**
     * Search posts by title or summary.
     * @param {string} query Search term.
     * @returns {Array} Matching post metadata objects.
     */
    static searchPosts(query) {
        const q = query.toLowerCase();
        return posts.filter(p => 
            p.title.toLowerCase().includes(q) || 
            p.summary.toLowerCase().includes(q)
        );
    }

    /**
     * Filter posts by category.
     * @param {string} category Category name.
     * @returns {Array} Filtered post metadata objects.
     */
    static filterByCategory(category) {
        return posts.filter(p => p.category === category);
    }
}
