// Deterministic gesture playback on the real studio canvas, plus browser checks.
// Run: node scripts/render-breeze.mjs
import { studioBrowser } from './studio-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const started = performance.now();
try {
    const result = await studioBrowser(`
        const frame = document.createElement('iframe');
        frame.width = 800; frame.height = 600;
        frame.src = '../../studio/world.html?time=12:45';
        document.body.append(frame);
        await new Promise(resolve => frame.onload = resolve);
        const w = frame.contentWindow, doc = frame.contentDocument, world = w.world;
        if (!world) throw new Error('World did not initialize');
        // Own the timeline so GIF frames are reproducible at precisely 10 fps.
        w.requestAnimationFrame = () => 0;
        world.seek(90);
        const canvas = doc.querySelector('canvas'), frames = [];
        const check = (value, message) => { if (!value) throw new Error(message); };
        check(!world.furin.enabled && !world.furin.audio, 'Sound must start off');
        const startX = world.scene.snapshot().clouds[0].x;
        world.sendBreeze();
        for (let i = 0; i < 100; i++) {
            if (i === 10) {
                let point;
                for (let y = 150; y < 450 && !point; y += 4) for (let x = 20; x < 780; x += 4) {
                    if (world.scene.hitTest(x, y) !== null) { point = { x, y }; break; }
                }
                check(point, 'Cloud silhouette can be hit');
                canvas.dispatchEvent(new w.PointerEvent('pointermove', { clientX: point.x, clientY: point.y }));
                check(world.breeze.puffs.size > 0, 'Hover triggers billow');
            }
            if (i === 38) world.breeze.begin(100, 300);
            if (i >= 38 && i < 44) world.breeze.move(100 + (i - 37) * 15, 300, 0.1);
            if (i === 44) world.breeze.end();
            if (i === 65) canvas.dispatchEvent(new w.WheelEvent('wheel', { deltaY: 2400, cancelable: true }));
            world.breeze.step(0.1, world.clock); world.paint();
            if (i === 9) check(world.scene.snapshot().clouds[0].x > startX, 'Breeze moves clouds');
            frames.push(canvas.toDataURL('image/png').split(',')[1]);
        }
        check(world.clock.time > 170, 'Wheel eases time toward dusk');
        check(world.breeze.turn > 0.18, 'Release carries inertia');
        world.seek(180);
        const header = w.getComputedStyle(doc.querySelector('header'));
        const heading = w.getComputedStyle(doc.querySelector('h1'));
        const luminance = text => {
            const values = text.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => {
                v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return values[0]*0.2126 + values[1]*0.7152 + values[2]*0.0722;
        };
        const contrast = (luminance(header.backgroundColor)+0.05)/(luminance(heading.color)+0.05);
        check(contrast >= 4.5, 'Dusk heading contrast');
        world.breeze.setReduced(true);
        const before = world.breeze.drift;
        world.sendBreeze(); world.breeze.hover(24); world.breeze.step(0.1, world.clock);
        check(world.breeze.drift === before && !world.breeze.puffs.size, 'Reduced motion suppresses gestures');
        canvas.dispatchEvent(new w.WheelEvent('wheel', { deltaY: -100, cancelable: true }));
        check(world.clock.time === 176.5 && !world.breeze.active, 'Reduced scroll is immediate');
        // Render the actual oscillator graph offline to verify audible, decaying synthesis.
        const offline = new w.OfflineAudioContext(1, 44100 * 5, 44100);
        offline.resume = async () => {};
        const furin = new w.Breeze.Furin(() => offline);
        await furin.enable(true); check(furin.ring(), 'Opted-in chime rings');
        const audio = await offline.startRendering(), samples = audio.getChannelData(0);
        const rms = (a,b) => Math.sqrt(samples.slice(a*44100,b*44100).reduce((s,v)=>s+v*v,0)/((b-a)*44100));
        check(rms(0,1) > 0.0001 && rms(3,4) < rms(0,1), 'Synthesized chime decays');
        return { frames, contrast, checks: 'tap, hover hit-test, inertia, wheel, reduced motion, default silence, offline chime decay' };
    `);
    const dir = 'renders/breeze'; mkdirSync(dir, { recursive: true });
    const paths = result.frames.map((data, i) => {
        const path = `${dir}/${String(i).padStart(3, '0')}.png`;
        writeFileSync(path, Buffer.from(data, 'base64')); return path;
    });
    const gif = spawnSync('python', ['-m', 'studio.analysis', 'animate', `${dir}/world-breeze.gif`, ...paths, '--fps', '10'], { encoding: 'utf8', windowsHide: true });
    if (gif.status !== 0) throw new Error(gif.stderr);
    const evidence = { checks: result.checks, headingContrast: result.contrast, frames: paths.length, elapsedMs: performance.now()-started };
    writeFileSync(`${dir}/checks.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence)); console.log(gif.stdout);
} finally { console.error(`breeze render elapsed: ${(performance.now()-started).toFixed(0)} ms`); }
