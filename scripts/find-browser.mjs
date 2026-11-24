/*
 * Finds a Chromium to drive headless: $CHROME if set, else Playwright's cached
 * Chromium, else an installed Chrome or Edge. Shared by the render, picture
 * and studio scripts.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

export function findBrowser() {
    if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
    const candidates = [];
    const cached = [
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
        join(os.homedir(), '.cache', 'ms-playwright'),
        join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
        '/opt/pw-browsers'
    ].filter(Boolean);
    for (const dir of cached) {
        if (!existsSync(dir)) continue;
        for (const name of readdirSync(dir).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
            candidates.push(
                join(dir, name, 'chrome-win64', 'chrome.exe'),
                join(dir, name, 'chrome-win', 'chrome.exe'),
                join(dir, name, 'chrome-linux', 'chrome'),
                join(dir, name, 'chrome-linux64', 'chrome'),
                join(dir, name, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
            );
        }
    }
    candidates.push(
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/chromium', '/usr/bin/google-chrome'
    );
    return candidates.find(p => existsSync(p)) || null;
}
