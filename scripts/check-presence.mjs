import { studioBrowser } from './studio-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const started = performance.now();
try {
    const evidence = await studioBrowser(`
        const frame = document.createElement('iframe'); frame.width = 390; frame.height = 844;
        frame.src = '../../studio/world.html?time=12:00'; document.body.append(frame);
        await new Promise(resolve => frame.onload = resolve);
        const w = frame.contentWindow, d = frame.contentDocument, world = w.world;
        const check = (ok, message) => { if (!ok) throw new Error(message); };
        check(world && !world.chorus.audio && !world.furin.audio, 'Default silence');
        const card = d.querySelector('header').getBoundingClientRect();
        check(card.left >= 0 && card.right <= 390 && card.bottom < 844, 'Phone card fits');
        check(d.querySelectorAll('header a').length === 2 && !d.querySelector('footer'), 'Links on card without toolbar');
        const cloud = world.scene.snapshot().clouds.at(-1);
        world.parallax.point(1, -1);
        for (let i = 0; i < 30; i++) world.parallax.step(0.1);
        const moved = world.scene.snapshot().clouds.at(-1);
        check(moved.x > cloud.x && moved.y < cloud.y, 'Parallax changes both axes');
        world.parallax.setReduced(true); const x = world.parallax.x;
        world.parallax.tilt(15, -30); world.parallax.step(0.1);
        check(world.parallax.x === x && !world.parallax.active, 'Reduced motion freezes looking');
        const audioEvidence = [];
        for (const hour of [12, 18.5, 22]) {
            const a = new w.OfflineAudioContext(2, 44100 * 3, 44100); a.resume = async () => {};
            const chorus = new w.Presence.Chorus(() => a);
            chorus.update(hour); await chorus.enable(true);
            // Schedule the page's complete synthesis, including higurashi pitch.
            for (let t = 0; t < 3; t += 0.05) chorus.update(hour, 0, t);
            const buffer = await a.startRendering(), left = buffer.getChannelData(0), right = buffer.getChannelData(1);
            const rms = values => Math.sqrt(values.reduce((s, x) => s + x*x, 0) / values.length);
            const level = rms(left), stereo = rms(left.map((x,i) => x-right[i]));
            check(hour === 22 ? level === 0 : level > 0.0001 && stereo > 0.00001, 'Day/dusk stereo synthesis and night silence');
            audioEvidence.push({ hour, rms: level, stereoDifference: stereo });
        }
        return { phoneCard: { width: card.width, height: card.height }, audioEvidence,
            checks: ['default silence', 'phone card and links', 'two-axis parallax', 'reduced motion', 'offline stereo day and dusk', 'night silence'] };
    `);
    evidence.elapsedMs = performance.now() - started;
    mkdirSync('renders/presence', { recursive: true });
    writeFileSync('renders/presence/checks.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
} finally { console.error(`presence checks elapsed: ${(performance.now() - started).toFixed(0)} ms`); }
