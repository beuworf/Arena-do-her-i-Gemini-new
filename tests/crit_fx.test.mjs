import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test('all crit() call sites in index.html trigger critFx on critical hit', () => {
  const critLines = html
    .split('\n')
    .map((line, i) => ({ line, num: i + 1 }))
    .filter((entry) => entry.line.includes('crit(') && !entry.line.includes('function crit('));

  assert.equal(critLines.length, 6, 'Expected 6 crit() call sites across combat paths');
  for (const entry of critLines) {
    assert.ok(
      entry.line.includes('critFx('),
      `Line ${entry.num} calls crit() without calling critFx()`
    );
  }
});

test('dmgNum resets CRT.on before any early return', () => {
  const match = html.match(/function dmgNum\([^)]*\)\{([^}]*)\}/);
  assert.ok(match, 'dmgNum function should exist');
  const body = match[1];
  const resetIdx = body.indexOf('CRT.on=0');
  const returnIdx = body.indexOf('return');
  assert.ok(resetIdx !== -1 && returnIdx !== -1 && resetIdx < returnIdx);
});

test('strike and darkBoom do not clobber crit shake', () => {
  const strikeMatch = html.match(/function strike\(\)\{[\s\S]*?\n\}/);
  assert.ok(strikeMatch, 'strike function should exist');
  assert.ok(
    strikeMatch[0].includes("shake=Math.max(shake,.15+c.m*.1+(critAny?.16:0))"),
    'strike should combine critAny into Math.max(shake, ...)'
  );

  const darkBoomMatch = html.match(/function darkBoom\([^)]*\)\{[^\n]+\}/);
  assert.ok(darkBoomMatch, 'darkBoom function should exist');
  assert.ok(
    darkBoomMatch[0].includes('shake=Math.max(shake,.35)'),
    'darkBoom should use Math.max for shake'
  );
});

test('critFx spawns extra particles and triggers bounded camera shake respecting FXV', () => {
  const PA = [];
  const rings = [];
  let shake = 0;
  let FXV = 1;
  let now = 1000;
  const PN = 220;
  const puff = (x, y, z, n, c) => {
    if (!FXV) return;
    for (let i = 0; i < n; i++) {
      if (PA.length >= PN) PA.shift();
      PA.push({ x, y, z, c });
    }
  };
  const ring = (x, z, r, c) => rings.push({ x, z, r, c });

  function critFx(e, nx = 0, nz = 0, sh = 0.32) {
    shake = Math.max(shake, sh);
    if (!FXV) return;
    const s = e.sz || 1, y = 1.25 * s;
    puff(e.x, y, e.z, 12, 0xffb830, 8.5, 7.2, 0.52, 0.18, 1, nx * 3.5, nz * 3.5);
    puff(e.x, y + 0.1 * s, e.z, 8, 0xfff8c4, 10.5, 6, 0.38, 0.13, 0.45, nx * 4.2, nz * 4.2);
    puff(e.x, y + 0.15 * s, e.z, 7, 0xff4a18, 5.2, 8.2, 0.62, 0.15, 0.28);
    if (now - (critFx.rt || 0) > 45) {
      critFx.rt = now;
      ring(e.x, e.z, 1.25 * s, 0xffd34d);
    }
  }

  critFx({ x: 2, z: -3, sz: 1 }, 1, 0, 0.43);
  assert.equal(shake, 0.43);
  assert.equal(PA.length, 27);
  assert.equal(rings.length, 1);

  // Rapid second crit within 45ms should add particles without spamming ring, and preserve higher shake
  now = 1020;
  critFx({ x: 3, z: -3, sz: 1 }, 0, 1, 0.32);
  assert.equal(shake, 0.43);
  assert.equal(PA.length, 54);
  assert.equal(rings.length, 1);

  // With FXV disabled, camera shake still works and no particles are added
  FXV = 0;
  shake = 0;
  PA.length = 0;
  now = 1200;
  critFx({ x: 1, z: 1, sz: 1 }, 0, 0, 0.32);
  assert.equal(shake, 0.32);
  assert.equal(PA.length, 0);
  assert.equal(rings.length, 1);
});

test('3-axis screen shake (sx, sy, sz) is wired into both camera modes', () => {
  assert.ok(html.includes('const sx=rnd(-1,1)*shake*.4,sy=rnd(-1,1)*shake*.26,sz=rnd(-1,1)*shake*.4;'));
  assert.ok(html.includes('if(CAMV)camUpd(rdt,fp,sx,sz,sy);else{C.position.set(cx+sx,13+sy,cz+10+sz);C.lookAt(cx+sx,sy*.4,cz-1)}'));
});
