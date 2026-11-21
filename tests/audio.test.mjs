import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sonsDir = path.join(root, 'sons');

function extractAudioConsts() {
  const sfxMatch = html.match(/const SFX_M=(\{[\s\S]*?\});\s*\nconst MUS_T=(\{[^;]+\});/);
  assert.ok(sfxMatch, 'SFX_M and MUS_T constants should exist in index.html');
  const ctx = {};
  vm.runInNewContext(`SFX_M = ${sfxMatch[1]}; MUS_T = ${sfxMatch[2]};`, ctx);
  return { SFX_M: ctx.SFX_M, MUS_T: ctx.MUS_T };
}

test('all SFX_M and MUS_T files exist on disk under sons/ and are non-empty MP3s', () => {
  const { SFX_M, MUS_T } = extractAudioConsts();
  const checked = new Set();

  for (const [key, entry] of Object.entries(SFX_M)) {
    assert.ok(Array.isArray(entry) && entry.length === 3, `Invalid SFX_M entry for ${key}`);
    const [files, gain, jitter] = entry;
    assert.ok(Array.isArray(files) && files.length > 0, `SFX_M.${key} needs >= 1 file`);
    assert.ok(gain > 0 && gain <= 1.2, `SFX_M.${key} gain out of bounds: ${gain}`);
    assert.ok(jitter >= 0 && jitter <= 0.25, `SFX_M.${key} jitter out of bounds: ${jitter}`);
    for (const fn of files) {
      const p = path.join(sonsDir, fn);
      assert.ok(fs.existsSync(p), `Missing SFX file: sons/${fn}`);
      assert.ok(fs.statSync(p).size > 500, `SFX file too small: sons/${fn}`);
      checked.add(fn);
    }
  }

  for (const mode of ['menu', 'combat', 'boss']) {
    const rel = MUS_T[mode];
    assert.ok(rel && rel.startsWith('sons/'), `Missing MUS_T.${mode}`);
    const p = path.join(root, rel);
    assert.ok(fs.existsSync(p), `Missing music file: ${rel}`);
    assert.ok(fs.statSync(p).size > 100000, `Music file too small: ${rel}`);
    checked.add(path.basename(rel));
  }

  assert.ok(checked.size >= 30, 'Expected full set of CC0 audio files in sons/');
});

test('every sfx("...") call in index.html maps to a defined key in SFX_M and fallback SFX', () => {
  const { SFX_M } = extractAudioConsts();
  const sfxBodyMatch = html.match(/const SFX=(\{[\s\S]*?\});\s*\nfunction sfxBuf/);
  assert.ok(sfxBodyMatch, 'Fallback SFX table should exist');
  const calls = [...html.matchAll(/sfx\('([a-z0-9_]+)'\)/gi)].map(m => m[1]);
  assert.ok(calls.length > 20, 'Expected sfx() call sites in index.html');
  for (const k of new Set(calls)) {
    assert.ok(SFX_M[k], `sfx('${k}') missing from SFX_M`);
    assert.ok(sfxBodyMatch[1].includes(`${k}:`), `sfx('${k}') missing from fallback SFX`);
  }
});

test('audio credits and CC0 documentation exist in both sons/CREDITOS.txt and index.html', () => {
  const credTxt = fs.readFileSync(path.join(sonsDir, 'CREDITOS.txt'), 'utf8');
  assert.ok(credTxt.includes('CC0 1.0'));
  assert.ok(credTxt.includes('RandomMind') && credTxt.includes('cynicmusic') && credTxt.includes('Juhani Junkala'));
  assert.ok(html.includes('RandomMind') && html.includes('cynicmusic') && html.includes('Juhani Junkala'));
  assert.ok(html.includes('rubberduck') && html.includes('Kenney'));
});
