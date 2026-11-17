#!/usr/bin/env node
/*
 * Renders one scene in every art style and lays them out on a contact sheet.
 *
 *   node scripts/styles.mjs                 # the futon scene
 *   node scripts/styles.mjs --scene=tatami
 *   node scripts/styles.mjs --size=1200x750 --styles=cel,radiant,lofi
 *
 * Writes renders/styles-<scene>.png. Needs Python with Pillow for the sheet.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const scene = opt('scene', 'futon');
const size = opt('size', '960x600');

// The style names, read from look.js so the sheet never falls out of step with it.
const lookSrc = readFileSync(join(root, 'js', 'look.js'), 'utf8');
const block = lookSrc.slice(lookSrc.indexOf('const PRESETS = {'), lookSrc.indexOf('function create('));
const all = [...block.matchAll(/^\s{8}(\w+): \{/gm)].map(m => m[1]);
const styles = opt('styles', '') ? opt('styles', '').split(',') : all;
const labels = Object.fromEntries([...block.matchAll(/^\s{8}(\w+): \{[\s\S]*?label: '([^']+)'/gm)].map(m => [m[1], m[2]]));

const dir = join(root, 'renders', 'styles');
mkdirSync(dir, { recursive: true });
const files = [];
for (const style of styles) {
    const out = join(dir, `${scene}-${style}.png`);
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'render.mjs'), size, `--scene=${scene}`, `--style=${style}`, `--out=${out}`], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`${style}: ${r.stderr}`); continue; }
    files.push([out, labels[style] || style]);
    console.log(`rendered ${style}`);
}

const sheet = join(root, 'renders', `styles-${scene}.png`);
const py = `
import sys, json, math
from PIL import Image, ImageDraw, ImageFont
items = json.loads(sys.argv[1]); out = sys.argv[2]
ims = [(Image.open(p).convert('RGB'), l) for p, l in items]
w, h = ims[0][0].size
cols = 3 if len(ims) > 4 else 2
rows = math.ceil(len(ims) / cols)
gap, bar = 16, 44
sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, rows * (h + bar) + (rows + 1) * gap), (14, 18, 40))
d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('segoeui.ttf', 26)
except Exception:
    try: font = ImageFont.truetype('DejaVuSans.ttf', 26)
    except Exception: font = ImageFont.load_default()
for i, (im, label) in enumerate(ims):
    c, r = i % cols, i // cols
    x, y = gap + c * (w + gap), gap + r * (h + bar + gap)
    sheet.paste(im, (x, y + bar))
    d.text((x + 4, y + 6), f'{i + 1}. {label}', fill=(225, 234, 255), font=font)
sheet.save(out)
print(out)
`;
const res = spawnSync('python', ['-c', py, JSON.stringify(files), sheet], { encoding: 'utf8' });
if (res.status !== 0) { console.error(res.stderr); process.exit(1); }
console.log(res.stdout.trim());
