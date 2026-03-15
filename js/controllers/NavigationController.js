export class NavigationController {
    constructor(appContext) {
        this.appContext = appContext;
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => {
            this.handleCurrentUrl();
        });
    }

    handleCurrentUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('id');
        const category = urlParams.get('category');
        const tag = urlParams.get('tag');

        if (postId) {
            this.appContext.loadPost(postId);
        } else if (category) {
            this.appContext.renderFeed(this.appContext.blogService.filterByCategory(category));
        } else if (tag) {
            this.appContext.renderFeed(this.appContext.blogService.filterByTag(tag));
        } else {
            this.appContext.renderFeed(this.appContext.blogService.getAllPosts());
        }
    }

    updateUrl(params) {
        const newUrl = new URL(window.location.href);
        // Clear old params
        newUrl.searchParams.delete('id');
        newUrl.searchParams.delete('category');
        newUrl.searchParams.delete('tag');
        
        // Set new params
        Object.keys(params).forEach(key => {
            newUrl.searchParams.set(key, params[key]);
        });
        
        window.history.pushState(params, '', newUrl);
    }

    clearUrl() {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('id');
        newUrl.searchParams.delete('category');
        newUrl.searchParams.delete('tag');
        window.history.pushState({}, '', newUrl);
    }
}