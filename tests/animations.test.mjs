import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadAnimPure() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/\/\* ANIM_PURE_START \*\/([\s\S]*?)\/\* ANIM_PURE_END \*\//);
  assert.ok(m, 'ANIM_PURE block must exist in index.html');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    m[1] +
      '\n;this.__anim={RACE_ANIM,raceAnimProf,CLS_ANIM,clsAnimProf,heroPickAnim,moveDirRel,emClipPick,eTurnRate,eTurnStep,eSteerVec,eHit,eCanAct};',
    ctx,
  );
  return ctx.__anim;
}

function loadAnimJson() {
  return JSON.parse(fs.readFileSync(new URL('../modelos/animacoes2.json', import.meta.url), 'utf8'));
}

test('animacoes2.json contains all 38 clips with valid unit quaternions and impact windows', () => {
  const anim2 = loadAnimJson();
  const keys = Object.keys(anim2.c);
  assert.ok(keys.length >= 38, `Expected at least 38 clips, got ${keys.length}`);
  const expectedNew = [
    'kick', 'kickSpin', 'stab', 'dualCombo', 'dualCross',
    'twoHandSwing', 'spearThrust', 'staffCombo',
    'crouchIdle', 'crouchWalk', 'strafeL', 'strafeR', 'walkBack', 'jumpLand',
  ];
  for (const k of expectedNew) {
    assert.ok(anim2.c[k], `Missing Mesh2Motion clip "${k}" in animacoes2.json`);
  }
  for (const [k, c] of Object.entries(anim2.c)) {
    assert.ok(c.n >= 2 && c.d > 0, `Clip ${k} has invalid duration/frames`);
    const qb = Buffer.from(c.q, 'base64');
    const hb = Buffer.from(c.h, 'base64');
    const q = new Int16Array(qb.buffer, qb.byteOffset, qb.byteLength / 2);
    const h = new Float32Array(hb.buffer, hb.byteOffset, hb.byteLength / 4);
    for (const v of h) assert.ok(Number.isFinite(v), `Non-finite hip offset in ${k}`);
    for (let i = 0; i < c.n * c.b.length; i++) {
      const m = Math.hypot(q[i * 4] / 32767, q[i * 4 + 1] / 32767, q[i * 4 + 2] / 32767, q[i * 4 + 3] / 32767);
      assert.ok(m > 0.98 && m < 1.02, `Invalid quaternion norm ${m} in ${k}`);
    }
    if (c.i) {
      assert.ok(c.i[0] >= 0 && c.i[0] < c.i[1] && c.i[1] <= c.d, `Invalid impact timing ${c.i} vs ${c.d} in ${k}`);
    }
  }
});

test('all 8 races x 2 sexes have distinct tuned locomotion profiles', () => {
  const a = loadAnimPure();
  assert.equal(a.RACE_ANIM.length, 8);
  const cadences = new Set();
  for (let r = 0; r < 8; r++) {
    const pm = a.raceAnimProf(r, 0);
    const pf = a.raceAnimProf(r, 1);
    assert.ok(pm.cadence >= 0.8 && pm.cadence <= 1.4);
    assert.ok(pf.cadence > pm.cadence, `Female profile should step slightly brisker for race ${r}`);
    assert.ok(pf.shoulderRoll < pm.shoulderRoll, `Female shoulderRoll should refine male profile for race ${r}`);
    cadences.add(pm.cadence);
  }
  // Every race has distinct locomotion rhythm
  assert.equal(cadences.size, 8);
  // Goblin prowls crouched, short races step faster than Minotauro
  assert.ok(a.raceAnimProf(7, 0).crouchBias >= 0.35);
  assert.ok(a.raceAnimProf(2, 0).cadence > a.raceAnimProf(6, 0).cadence);
  assert.ok(a.raceAnimProf(3, 0).cadence > a.raceAnimProf(6, 0).cadence);
});

test('all 14 class builds (wi 0..13) resolve every attack key to valid clips in animacoes2.json', () => {
  const a = loadAnimPure();
  const anim2 = loadAnimJson();
  assert.equal(a.CLS_ANIM.length, 14);
  for (let w = 0; w < 14; w++) {
    const prof = a.clsAnimProf(w);
    assert.ok(prof.rL >= 0 && prof.rL <= 1);
    for (const k of ['L', 'H', 'T', 'S', 'G', 'B']) {
      const r1 = a.heroPickAnim(w, k, { alt: false, ck: 'atkA', cT: 0.1, pl: false, ht: 0.4 });
      const r2 = a.heroPickAnim(w, k, { alt: true, ck: 'atkB', cT: 0.1, pl: false, ht: 1.5 });
      assert.ok(anim2.c[r1.clip], `Build ${w} key ${k} picked unknown clip "${r1.clip}"`);
      assert.ok(anim2.c[r2.clip], `Build ${w} key ${k} (alt) picked unknown clip "${r2.clip}"`);
    }
  }
  // Specific class upgrades:
  // Monge (8) kicks cleanly on H and spin-kicks on T
  assert.equal(a.heroPickAnim(8, 'H', {}).clip, 'kick');
  assert.equal(a.heroPickAnim(8, 'T', {}).clip, 'kickSpin');
  // Armadilheiro (13) uses dagger stab / dualCross
  assert.equal(a.heroPickAnim(13, 'L', { alt: false }).clip, 'stab');
  assert.equal(a.heroPickAnim(13, 'H', {}).clip, 'dualCross');
  // Selvagem (4) thrusts spear and sweeps twoHandSwing
  assert.equal(a.heroPickAnim(4, 'L', {}).clip, 'spearThrust');
  assert.equal(a.heroPickAnim(4, 'H', {}).clip, 'twoHandSwing');
  // Mago (6) and Necro (9) use staffCombo
  assert.equal(a.heroPickAnim(6, 'L', {}).clip, 'staffCombo');
  assert.equal(a.heroPickAnim(9, 'H', {}).clip, 'staffCombo');
});

test('moveDirRel distinguishes forward, walkBack, strafeL, and strafeR accurately', () => {
  const a = loadAnimPure();
  // Facing +Z (0 rad)
  assert.equal(a.moveDirRel(0, 4, 0), 'fwd');
  assert.equal(a.moveDirRel(0, -4, 0), 'walkBack');
  assert.equal(a.moveDirRel(4, 0, 0), 'strafeL');
  assert.equal(a.moveDirRel(-4, 0, 0), 'strafeR');
  assert.equal(a.moveDirRel(0.1, 0.1, 0), 'fwd');
  // Facing +X (PI/2 rad): forward is +X, backward is -X, character left is -Z
  const hpi = Math.PI / 2;
  assert.equal(a.moveDirRel(4, 0, hpi), 'fwd');
  assert.equal(a.moveDirRel(-4, 0, hpi), 'walkBack');
  assert.equal(a.moveDirRel(0, -4, hpi), 'strafeL');
  assert.equal(a.moveDirRel(0, 4, hpi), 'strafeR');
});

test('all enemy archetypes map to valid clips and smooth turning / flanking / ranged hysteresis', () => {
  const a = loadAnimPure();
  const anim2 = loadAnimJson();
  const kinds = ['n', 'r', 'c', 'b', 'B', 'k', 'K', 'Q', 'H', 'I', 'e', 'a', 'f', 'u', 'l', 'x', 'h', 'v', 'w', 'y', 't', 'p', 'j', 'o', 'X0', 'X5', 'X11'];
  for (const k of kinds) {
    const boss = k === 'B' || k === 'K' || k === 'Q' || k === 'H' || k === 'I';
    for (let seq = 0; seq < 6; seq++) {
      const clip = a.emClipPick(k, k === 'r' || k === 't', boss, boss ? 2 : 1, seq);
      assert.ok(anim2.c[clip], `Enemy ${k} seq ${seq} picked unknown clip "${clip}"`);
    }
    const rate = a.eTurnRate(k, boss);
    assert.ok(rate > 0);
  }
  // Shielder turns slower than agile ninja
  assert.ok(a.eTurnRate('e', false) < a.eTurnRate('f', false));
  // Shortest-arc wraparound turn step
  const tr = a.eTurnStep(Math.PI - 0.1, -Math.PI + 0.1, 2.0, 0.05);
  assert.ok(tr.delta > 0 && tr.delta <= 0.1001, `Expected positive short wraparound turn, got ${tr.delta}`);

  // Melee flanking pushes perpendicular component at distance and converges close up
  const farFlank = a.eSteerVec(0, 0, 10, 10, 1.5, 0.8, 0);
  const nearFlank = a.eSteerVec(0, 0, 1.7, 1.7, 1.5, 0.8, 0);
  assert.ok(Math.abs(farFlank.vx) > 0.25, 'Distant melee pursuer should apply lateral flank');
  assert.ok(Math.abs(nearFlank.vx) < 0.05, 'Close melee pursuer should converge directly on target');

  // Ranged hysteresis holds steady instead of oscillating at boundary
  const holdStrafe = a.eSteerVec(1, 0, 8, 8, 8, 1, 0);
  assert.equal(holdStrafe.mode, 0);
  assert.ok(Math.hypot(holdStrafe.vx, holdStrafe.vz) > 0.99);
  const keepRetreat = a.eSteerVec(1, 0, 6.2, 6.2, 8, 1, -1); // between pr-3 (5) and pr-1.4 (6.6)
  assert.equal(keepRetreat.mode, -1);
});

test('eHit locks normal enemies out of attacks, cancels windups, and increments hc per combo hit', () => {
  const a = loadAnimPure();
  const enemy = { boss: false, wind: 0.32, chw: 0.4, sw: 0.2, cd: 0.05, ht: 0, fl: 0, hc: 0, pst: 0, stun: 0, lf: 0, kd: 0, ice: 0 };
  assert.equal(a.eCanAct(enemy), true);

  // First light hit interrupts active windup/swing and enters hitstun
  const ok1 = a.eHit(enemy, 0.36, 0.12);
  assert.equal(ok1, true);
  assert.equal(enemy.wind, 0);
  assert.equal(enemy.chw, 0);
  assert.equal(enemy.sw, 0);
  assert.ok(enemy.ht >= 0.36);
  assert.ok(enemy.fl >= 0.12);
  assert.ok(enemy.cd >= enemy.ht + 0.19);
  assert.equal(enemy.hc, 1);
  assert.equal(a.eCanAct(enemy), false);

  // Second and third combo hits retrigger hc even while fl/ht are still active
  enemy.ht = 0.2;
  const ok2 = a.eHit(enemy, 0.36, 0.12);
  const ok3 = a.eHit(enemy, 0.46, 0.12);
  assert.equal(ok2, true);
  assert.equal(ok3, true);
  assert.equal(enemy.hc, 3);
  assert.ok(enemy.ht >= 0.46);
  assert.equal(a.eCanAct(enemy), false);

  // Recover once hitstun expires
  enemy.ht = 0;
  assert.equal(a.eCanAct(enemy), true);
  enemy.stun = 0.1;
  assert.equal(a.eCanAct(enemy), false);
});

test('bosses briefly flinch cleanly on first hit then gain poise immunity to prevent infinite stunlock', () => {
  const a = loadAnimPure();
  const boss = { boss: true, chg: false, wind: 0.55, chw: 0, sw: 0, cd: 0.1, ht: 0, fl: 0, hc: 0, pst: 0 };

  // First hit causes short poise-break flinch and cancels regular windup
  assert.equal(a.eHit(boss, 0.46, 0.12), true);
  assert.ok(boss.ht >= 0.18 && boss.ht <= 0.26);
  assert.equal(boss.pst, 2.4);
  assert.equal(boss.wind, 0);
  assert.equal(boss.hc, 1);
  assert.equal(a.eCanAct(boss), false);

  // Follow-up hit during poise cooldown flashes fl only without extending ht or re-stunning
  boss.ht = 0;
  boss.fl = 0;
  boss.wind = 0.4;
  assert.equal(a.eHit(boss, 0.46, 0.12), false);
  assert.equal(boss.ht, 0);
  assert.ok(boss.fl >= 0.12);
  assert.equal(boss.wind, 0.4);
  assert.equal(boss.hc, 1);
  assert.equal(a.eCanAct(boss), true);
});

test('index.html wires hit animation interruption, non-stunning aura noHt, and separate healer timer ht2', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(
    html.includes('const hitNow=(e.hc||0)!==(d.phc||0)||(e.fl>0&&!(d.pf>0)&&!(e.hc>0))'),
    'emAnim must trigger A.hit via monotonic hc even when another attack animation was playing',
  );
  assert.ok(!html.includes('d.one!==A.hit'), 'old blocking condition d.one!==A.hit must remain removed');
  assert.ok(html.includes('const dmg=(e,n,cmv,scmb,noHt)=>'), 'dmg helper must support noHt for continuous aura ticks');
  assert.ok(html.includes('e.ht2=(e.ht2===undefined?2:e.ht2)-dt'), 'healer AI timer must use e.ht2 rather than colliding with e.ht');
});

