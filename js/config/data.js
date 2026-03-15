// Define interactive zones over your main background image.
// x, y, width, and height are relative to the original image's pixel dimensions.
// The engine will automatically scale these to fit the screen.

export const portfolioData = {
    backgroundSrc: './assets/night_background_github_page.jpg',
    hitboxes: [
        // Placeholder coordinates - you will tune these to match the pixels of your specific image
        {
            id: 'projects',
            desc: 'Projects Arcade (Click Me!)',
            action: 'open_projects',
            x: 800, y: 500, w: 150, h: 200
        },
        {
            id: 'resume',
            desc: 'Resume Desk',
            action: 'open_resume',
            x: 400, y: 400, w: 200, h: 150
        },
    ]
};
