import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

test('main menu renders sculpted Arena de Honra emblem matching artwork', () => {
  assert.ok(html.includes('<div id="mt" class="notr" aria-label="Arena de Honra"><svg'));
  assert.ok(html.includes('>ARENA</text>'));
  assert.ok(html.includes('>DE</text>'));
  assert.ok(html.includes('>HONRA</text>'));
});

test('menu theme uses forged stone, steel, and gold palette tokens instead of cold navy', () => {
  assert.ok(html.includes("--gold:#f2be4b"));
  assert.ok(html.includes("--stone-card:linear-gradient(180deg,#353740 0%,#222329 100%)"));
  assert.ok(html.includes("--arena-scrim:radial-gradient("));
  assert.ok(html.includes("family=Cinzel"));
  assert.ok(html.includes("family=Plus+Jakarta+Sans"));
  assert.ok(!html.includes("#menu,#set{position:fixed;inset:0;z-index:8;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,18,28,.95)"));
});

test('all menu and overlay element IDs remain intact', () => {
  for (const id of ['menu', 'mt', 'mnm', 'lng', 'mb', 'mf', 'mrec', 'cls', 'ct', 'cc', 'bk', 'set', 'sc', 'sbk', 'bst', 'bfl', 'bgr', 'bbk', 'crd', 'cbk', 'lob', 'jn', 'pause', 'rank', 'over', 'fsb']) {
    assert.ok(html.includes(`id="${id}"`), `Missing #${id} in index.html`);
  }
});
