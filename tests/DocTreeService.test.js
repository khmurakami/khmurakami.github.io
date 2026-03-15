import { describe, it, expect } from 'vitest';
import { DocTreeService } from '../js/engine/DocTreeService.js';

describe('DocTreeService', () => {
    const mockPosts = [
        {
            id: 'post-1',
            title: 'Introduction to JS',
            category: 'Tutorials',
            tags: ['JavaScript']
        },
        {
            id: 'post-2',
            title: 'Advanced CSS',
            category: 'Tutorials',
            tags: ['CSS']
        },
        {
            id: 'post-3',
            title: 'Project Update',
            category: 'Projects',
            tags: ['Personal']
        }
    ];

    it('should generate a nested tree structure (Category -> Post)', () => {
        const tree = DocTreeService.generateTree(mockPosts);
        
        // Root should have unique categories
        expect(tree.length).toBe(2);
        const tutorialsFolder = tree.find(node => node.name === 'Tutorials');
        expect(tutorialsFolder).toBeDefined();
        expect(tutorialsFolder.type).toBe('category');

        // Tutorials should have posts directly
        expect(tutorialsFolder.children.length).toBe(2);
        const jsPost = tutorialsFolder.children.find(node => node.name === 'Introduction to JS');
        expect(jsPost).toBeDefined();
        expect(jsPost.type).toBe('post');
        expect(jsPost.id).toBe('post-1');
    });
});
