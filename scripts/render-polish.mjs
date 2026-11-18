import { studioBrowser } from './studio-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const started = performance.now();
try {
    const png = await studioBrowser(`
        const frame = document.createElement('iframe');
        frame.width = 1440; frame.height = 1080;
        frame.src = '../../studio/world.html?time=12:00&season=high';
        document.body.append(frame);
        await new Promise(resolve => frame.onload = resolve);
        if (!frame.contentWindow.world) throw new Error('World did not initialize');
        return frame.contentDocument.querySelector('canvas').toDataURL('image/png').split(',')[1];
    `);
    mkdirSync('renders/polish', { recursive: true });
    writeFileSync('renders/polish/noon.png', Buffer.from(png, 'base64'));
    console.log('renders/polish/noon.png');
} finally {
    console.error(`noon render elapsed: ${(performance.now() - started).toFixed(0)} ms`);
}
