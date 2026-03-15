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
            
            catPosts.forEach(post => {
                categoryNode.children.push({
                    name: post.title,
                    type: 'post',
                    id: post.id
                });
            });

            if (categoryNode.children.length > 0) {
                tree.push(categoryNode);
            }
        });

        return tree;
    }
}
