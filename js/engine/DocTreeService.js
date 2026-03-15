/**
 * DocTreeService organizes blog posts into a nested folder structure
 * for professional documentation navigation.
 */
export class DocTreeService {
    /**
     * Generate a nested tree structure from a flat array of posts.
     * @param {Array} posts Array of post metadata objects.
     * @returns {Array} Nested tree structure.
     */
    static generateTree(posts) {
        const tree = [];
        const categories = [...new Set(posts.map(p => p.category))];

        categories.forEach(catName => {
            const categoryNode = {
                name: catName,
                type: 'category',
                children: []
            };

            const catPosts = posts.filter(p => p.category === catName);
            
            // Collect all unique tags within this category
            const tags = [...new Set(catPosts.flatMap(p => p.tags))];

            tags.forEach(tagName => {
                const tagNode = {
                    name: tagName,
                    type: 'tag',
                    children: []
                };

                // Find posts that belong to this category AND have this tag
                const taggedPosts = catPosts.filter(p => p.tags.includes(tagName));
                
                taggedPosts.forEach(post => {
                    tagNode.children.push({
                        name: post.title,
                        type: 'post',
                        id: post.id
                    });
                });

                if (tagNode.children.length > 0) {
                    categoryNode.children.push(tagNode);
                }
            });

            if (categoryNode.children.length > 0) {
                tree.push(categoryNode);
            }
        });

        return tree;
    }
}
