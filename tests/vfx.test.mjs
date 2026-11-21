import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const efeitosDir = path.join(root, 'efeitos');

function loadVfxPure() {
  const m = html.match(/\/\* VFX_PURE_START \*\/([\s\S]*?)\/\* VFX_PURE_END \*\//);
  assert.ok(m, 'VFX_PURE_START / VFX_PURE_END block must exist in index.html');
  const ctx = {};
  vm.runInNewContext(
    `${m[1]}; this.FX_TEXTURES = FX_TEXTURES; this.PROJ_FX = PROJ_FX; this.VFX_BURSTS = VFX_BURSTS; this.resolveProjKind = resolveProjKind; this.resolveEnemyProjKind = resolveEnemyProjKind; this.resolveBossProjKind = resolveBossProjKind; this.resolveTurretFxKind = resolveTurretFxKind;`,
    ctx
  );
  return ctx;
}

test('all FX_TEXTURES exist in efeitos/, are valid non-empty PNGs, and all descriptors reference valid textures', () => {
  const { FX_TEXTURES, PROJ_FX, VFX_BURSTS } = loadVfxPure();
  assert.equal(FX_TEXTURES.length, 15, 'Expected 15 CC0 Kenney Particle Pack textures');
  const texSet = new Set(FX_TEXTURES);
  assert.equal(texSet.size, FX_TEXTURES.length, 'FX_TEXTURES must not contain duplicates');

  for (const fn of FX_TEXTURES) {
    const p = path.join(efeitosDir, fn);
    assert.ok(fs.existsSync(p), `Missing texture file: efeitos/${fn}`);
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 1000, `Texture file too small: efeitos/${fn}`);
    assert.equal(buf[0], 0x89, `Invalid PNG magic byte 0 in efeitos/${fn}`);
    assert.equal(buf[1], 0x50, `Invalid PNG magic byte 1 in efeitos/${fn}`);
    assert.equal(buf[2], 0x4e, `Invalid PNG magic byte 2 in efeitos/${fn}`);
    assert.equal(buf[3], 0x47, `Invalid PNG magic byte 3 in efeitos/${fn}`);
  }

  for (const [k, def] of Object.entries(PROJ_FX)) {
    assert.ok(texSet.has(def.tex), `PROJ_FX.${k}.tex "${def.tex}" must be in FX_TEXTURES`);
    assert.ok(texSet.has(def.tex2), `PROJ_FX.${k}.tex2 "${def.tex2}" must be in FX_TEXTURES`);
    assert.ok(texSet.has(def.muzzle), `PROJ_FX.${k}.muzzle "${def.muzzle}" must be in FX_TEXTURES`);
    assert.ok(texSet.has(def.boom), `PROJ_FX.${k}.boom "${def.boom}" must be in FX_TEXTURES`);
  }

  for (const [k, def] of Object.entries(VFX_BURSTS)) {
    assert.ok(texSet.has(def.tex), `VFX_BURSTS.${k}.tex "${def.tex}" must be in FX_TEXTURES`);
    assert.ok(def.life > 0, `VFX_BURSTS.${k}.life must be positive`);
  }
});

test('resolveProjKind maps every weapon/spell/projectile option deterministically', () => {
  const { resolveProjKind } = loadVfxPure();
  assert.equal(resolveProjKind(null), 'arrow');
  assert.equal(resolveProjKind({ fxKind: 'bolt' }), 'bolt');
  assert.equal(resolveProjKind({ hm: 1 }), 'hammer');
  assert.equal(resolveProjKind({ mKey: 'HMM' }), 'hammer');
  assert.equal(resolveProjKind({ dk: 1 }), 'dark');
  assert.equal(resolveProjKind({ gKey: 'DKG' }), 'dark');
  assert.equal(resolveProjKind({ gKey: 'WVG' }), 'wave');
  assert.equal(resolveProjKind({ gKey: 'RBG' }), 'chi');
  assert.equal(resolveProjKind({ kn: 1 }), 'dagger');
  assert.equal(resolveProjKind({ gKey: 'EPG' }), 'earrow');
  assert.equal(resolveProjKind({ gKey: 'EPO' }), 'emagic');
  assert.equal(resolveProjKind({ gKey: 'MQBG' }), 'bomb');
  assert.equal(resolveProjKind({ mKey: 'MI' }), 'ice');
  assert.equal(resolveProjKind({ mIdx: 2 }), 'ice');
  assert.equal(resolveProjKind({ bn: 1 }), 'fireball');
  assert.equal(resolveProjKind({ gKey: 'SG' }), 'fireball');
  assert.equal(resolveProjKind({ slow: 1 }), 'arrowIce');
  assert.equal(resolveProjKind({ weak: 1 }), 'arrowIce');
  assert.equal(resolveProjKind({}), 'arrow');
});

test('resolveEnemyProjKind, resolveBossProjKind, and resolveTurretFxKind cover all variants', () => {
  const { resolveEnemyProjKind, resolveBossProjKind, resolveTurretFxKind } = loadVfxPure();
  assert.equal(resolveEnemyProjKind(3), 'shuriken');
  assert.equal(resolveEnemyProjKind(1), 'earrow');
  assert.equal(resolveEnemyProjKind(2), 'emagic');

  assert.equal(resolveBossProjKind({ g: 4 }), 'earrow');
  assert.equal(resolveBossProjKind({ g: 1 }), 'axe');
  assert.equal(resolveBossProjKind({ g: 2 }), 'hammer');
  assert.equal(resolveBossProjKind({ g: 3 }), 'dagger');
  assert.equal(resolveBossProjKind({ c: 0xff6a2a }), 'fireball');
  assert.equal(resolveBossProjKind({ c: 0x7a4ac0 }), 'dark');
  assert.equal(resolveBossProjKind({}), 'magic');

  assert.equal(resolveTurretFxKind(0), 'flameJet');
  assert.equal(resolveTurretFxKind(1), 'bolt');
  assert.equal(resolveTurretFxKind(2), 'bomb');
  assert.equal(resolveTurretFxKind(3), 'venom');
  assert.equal(resolveTurretFxKind(4), 'ice');
  assert.equal(resolveTurretFxKind(5), 'healPulse');
  assert.equal(resolveTurretFxKind(6), 'decoyPulse');
});

test('index.html wires object-pooled FXP/VFXP, turret effects 0-6, lifecycle cleanup, and CC0 credits', () => {
  assert.match(html, /const FXP=mkKeyedPool\(/);
  assert.match(html, /VFXP=mkPool\(/);
  assert.match(html, /fxWarmTex\(\)/);
  assert.match(html, /fxBurstUpd\(dt\)/);
  assert.match(html, /vfxClear\(\)/);
  assert.match(html, /o\.userData\.vfx/);
  assert.match(html, /fxTickRig\(/);
  assert.match(html, /fxBurn\('boltMuzzle'/);
  assert.match(html, /fxBurn\('bombMuzzle'/);
  assert.match(html, /fxBurn\('venomMuzzle'/);
  assert.match(html, /fxBurn\('cryoMuzzle'/);
  assert.match(html, /fxBurn\('healPulse'/);
  assert.match(html, /fxBurn\('decoyPulse'/);
  assert.match(html, /fxBurn\('acidSplash'/);
  assert.match(html, /projFx:\{\.\.\.FXP\.stats/);
  assert.match(html, /vfxBurst:\{\.\.\.VFXP\.stats/);
  assert.match(html, /vfxInfo:\(\)=>/);

  const credTxt = fs.readFileSync(path.join(efeitosDir, 'CREDITOS.txt'), 'utf8');
  assert.ok(credTxt.includes('Kenney') && credTxt.includes('Particle Pack') && credTxt.includes('CC0'));
  assert.ok(html.includes('Kenney') && html.includes('Particle Pack'));
});
