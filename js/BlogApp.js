import { BlogService } from './engine/BlogService.js';
import { BlogRenderer } from './engine/BlogRenderer.js';
import { PostDocument } from './engine/PostDocument.js';
import { SidebarController } from './controllers/SidebarController.js';
import { NavigationController } from './controllers/NavigationController.js';
import { EditorController } from './controllers/EditorController.js';

class BlogApp {
    constructor() {
        this.blogService = BlogService;
        this.currentPostId = null;
        this.currentView = 'feed'; // 'feed' or 'post'
        
        // UI Elements
        this.postList = document.getElementById('post-list');
        this.postDetail = document.getElementById('post-detail');
        this.postBody = document.getElementById('post-body');
        this.blogLayout = document.querySelector('.blog-layout');
        this.backBtn = document.getElementById('back-to-list');
        this.commandBar = document.getElementById('post-command-bar');

        // Init Controllers
        this.navigation = new NavigationController(this);
        this.sidebar = new SidebarController(this);
        this.editor = new EditorController(this);

        this.initGlobalEvents();
        this.navigation.handleCurrentUrl();
    }

    initGlobalEvents() {
        // Search
        const searchInput = document.getElementById('blog-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                // If we are in post view, switching back to feed view for search results
                if (this.currentView !== 'feed') {
                    this.navigation.clearUrl();
                }
                this.renderFeed(this.blogService.searchPosts(e.target.value));
            });
        }
    }

    /**
     * Switch between Feed view and Post Detail view cinematically.
     */
    switchView(viewName) {
        this.currentView = viewName;
        
        if (viewName === 'feed') {
            if (this.postDetail) this.postDetail.classList.add('hidden');
            if (this.commandBar) this.commandBar.classList.add('hidden');
            if (this.blogLayout) this.blogLayout.classList.remove('single-post-mode');
            
            if (this.postList) {
                this.postList.classList.remove('hidden');
                this.postList.style.opacity = '0';
                setTimeout(() => { this.postList.style.opacity = '1'; }, 50);
            }
        } else {
            if (this.postList) this.postList.classList.add('hidden');
            if (this.blogLayout) this.blogLayout.classList.add('single-post-mode');
            
            if (this.postDetail) {
                this.postDetail.classList.remove('hidden');
                this.postDetail.style.opacity = '0';
                setTimeout(() => { this.postDetail.style.opacity = '1'; }, 50);
            }
            if (this.commandBar) {
                this.commandBar.classList.remove('hidden');
            }
        }
        window.scrollTo(0, 0);
    }

    renderFeed(posts) {
        if (!this.postList) return;
        this.postList.innerHTML = '';
        
        posts.forEach(post => {
            const preview = BlogRenderer.createPreviewElement(post);
            preview.addEventListener('click', () => {
                this.navigation.updateUrl({ id: post.id });
                this.loadPost(post.id);
            });
            this.postList.appendChild(preview);
        });

        this.switchView('feed');
    }

    async loadPost(id) {
        const post = this.blogService.getPostById(id);
        if (!post) {
            console.error(`Post not found: ${id}`);
            this.renderFeed(this.blogService.getAllPosts());
            return;
        }

        this.currentPostId = id;
        this.editor.reset();

        try {
            const response = await fetch(post.file);
            if (!response.ok) throw new Error('Failed to fetch post file');
            const markdown = await response.text();
            
            // Parsed rather than regex-stripped, and the whole document is kept.
            //
            // The front matter and the leading `# ` heading used to be cut off
            // here with two regexes and then thrown away — so publishing, which
            // rebuilt the file from the editor's contents, deleted the heading
            // from the source permanently. The parts are separated now and
            // travel with the editor, which writes all of them back.
            //
            // The heading is still left out of what is EDITED, because the page
            // renders the title above the body and showing it twice is what the
            // stripping was for. It is simply no longer lost by being left out.
            const doc = PostDocument.parse(markdown);
            const content = doc.body;

            const postTitleDisplay = document.getElementById('post-title-display');
            if (postTitleDisplay) postTitleDisplay.textContent = post.title;
            
            const metaTop = document.getElementById('post-meta-top');
            if (metaTop) metaTop.textContent = `${post.date} • ${post.category}`;
            
            const tagsDisplay = document.getElementById('post-tags-display');
            if (tagsDisplay) {
                tagsDisplay.innerHTML = '';
                post.tags.forEach(tag => { 
                    const span = document.createElement('span'); 
                    span.className = 'tag'; 
                    span.textContent = `#${tag}`; 
                    tagsDisplay.appendChild(span); 
                });
            }

            if (this.postBody) this.postBody.innerHTML = BlogRenderer.render(content);
            this.editor.setEditorContent(doc.data.title || post.title, content, doc);
            
            this.switchView('post');
        } catch (error) {
            console.error('Failed to load post content:', error);
            this.renderFeed(this.blogService.getAllPosts());
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.blogApp = new BlogApp();
});
