// The house rule: no source file over 1,400 lines. Past that, split it into parts
// (see js/scenes/tatami-pixel/ for how the room is split into modules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LIMIT = 1400;
const SOURCE = /\.(js|mjs|cjs|py|html|css)$/;

test(`no source file is over ${LIMIT} lines`, () => {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
        .split('\n').filter(f => SOURCE.test(f));
    const long = files
        .map(f => { try { return [f, readFileSync(f, 'utf8').split('\n').length]; } catch { return [f, 0]; } })
        .filter(([, n]) => n > LIMIT)
        .map(([f, n]) => `${f} (${n} lines)`);
    assert.deepEqual(long, [], `split these into smaller parts:\n  ${long.join('\n  ')}`);
});
