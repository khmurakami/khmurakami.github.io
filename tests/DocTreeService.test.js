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

    it('should generate a nested tree structure', () => {
        const tree = DocTreeService.generateTree(mockPosts);
        
        // Root should have unique categories
        expect(tree.length).toBe(2);
        const tutorialsFolder = tree.find(node => node.name === 'Tutorials');
        expect(tutorialsFolder).toBeDefined();
        expect(tutorialsFolder.type).toBe('category');

        // Tutorials should have tags as subfolders
        expect(tutorialsFolder.children.length).toBe(2);
        const jsFolder = tutorialsFolder.children.find(node => node.name === 'JavaScript');
        expect(jsFolder).toBeDefined();
        expect(jsFolder.type).toBe('tag');

        // JS tag folder should have the post
        expect(jsFolder.children.length).toBe(1);
        expect(jsFolder.children[0].name).toBe('Introduction to JS');
        expect(jsFolder.children[0].type).toBe('post');
        expect(jsFolder.children[0].id).toBe('post-1');
    });

    it('should handle posts with multiple tags', () => {
        const multiTagPost = [
            {
                id: 'multi',
                title: 'Fullstack Guide',
                category: 'Tutorials',
                tags: ['JavaScript', 'Node']
            }
        ];
        const tree = DocTreeService.generateTree(multiTagPost);
        const tutorials = tree[0];
        
        // Post should appear under both tags
        expect(tutorials.children.length).toBe(2); // JavaScript and Node
        expect(tutorials.children[0].children[0].id).toBe('multi');
        expect(tutorials.children[1].children[0].id).toBe('multi');
    });
});
