import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadComboPure() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/\/\* CMB_PURE_START \*\/([\s\S]*?)\/\* CMB_PURE_END \*\//);
  assert.ok(m, 'CMB_PURE block must exist in index.html');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[1] + '\n;this.__cmb={CMB_MIN_MUL,CMB_MAX_MUL,CMB_MAX_HITS,CMB_MAX_SPD,CMB_RANKS,cmbRank,cmbMult,cmbAtkSpd,cmbPct,cmbStep,cmbClearState};', ctx);
  return ctx.__cmb;
}

test('0 hits starts at 0.7x damage, 1.0x attack speed, rank -, 0%', () => {
  const c = loadComboPure();
  assert.equal(c.cmbMult(0), 0.7);
  assert.equal(c.cmbAtkSpd(0), 1.0);
  assert.deepEqual({ ...c.cmbRank(0) }, { rank: '-', prev: 0, next: 1, max: false });
  assert.equal(c.cmbPct(0), 0);
});

test('ranks advance from D to SSS, damage scales gradually 0.7x..2.0x and attack speed scales 1.0x..1.5x', () => {
  const c = loadComboPure();
  assert.equal(c.cmbRank(1).rank, 'D');
  assert.equal(c.cmbRank(3).rank, 'C');
  assert.equal(c.cmbRank(6).rank, 'B');
  assert.equal(c.cmbMult(6), 1.0);
  assert.ok(c.cmbAtkSpd(6) > 1.0 && c.cmbAtkSpd(6) < 1.5);
  assert.equal(c.cmbRank(10).rank, 'A');
  assert.equal(c.cmbRank(15).rank, 'S');
  assert.equal(c.cmbRank(20).rank, 'SS');
  assert.deepEqual({ ...c.cmbRank(26) }, { rank: 'SSS', prev: 26, next: 26, max: true });
  assert.equal(c.cmbMult(26), 2.0);
  assert.equal(c.cmbAtkSpd(26), 1.5);
  assert.equal(c.cmbPct(26), 100);
  // Caps at SSS / 2.0x / 1.5x
  assert.equal(c.cmbMult(40), 2.0);
  assert.equal(c.cmbAtkSpd(40), 1.5);
  assert.equal(c.cmbRank(40).rank, 'SSS');
  // Strictly monotonic increase up to 26
  for (let h = 1; h <= 26; h++) {
    assert.ok(c.cmbMult(h) > c.cmbMult(h - 1), `mult(${h}) should exceed mult(${h - 1})`);
    assert.ok(c.cmbAtkSpd(h) > c.cmbAtkSpd(h - 1), `spd(${h}) should exceed spd(${h - 1})`);
  }
});

test('anti-spam blocks repeating same move or same button', () => {
  const c = loadComboPure();
  const st = c.cmbClearState({});
  const r1 = c.cmbStep(st, { move: 'W0:L', btn: 'L', seq: 1 });
  assert.equal(r1.ok, true);
  assert.equal(st.hits, 1);

  // Different move name but SAME button -> blocked
  const rSameBtn = c.cmbStep(st, { move: 'W0:L>LL', btn: 'L', seq: 2 });
  assert.equal(rSameBtn.ok, false);
  assert.equal(rSameBtn.repeated, true);
  assert.equal(st.hits, 1);

  // Different button but SAME move name -> blocked
  const rSameMove = c.cmbStep(st, { move: 'W0:L', btn: 'H', seq: 3 });
  assert.equal(rSameMove.ok, false);
  assert.equal(rSameMove.repeated, true);
  assert.equal(st.hits, 1);

  // Varied move AND button -> advances!
  const rVaried = c.cmbStep(st, { move: 'W0:C:LH', btn: 'H', seq: 4 });
  assert.equal(rVaried.ok, true);
  assert.equal(st.hits, 2);
});

test('multi-target single action sharing seq counts once without false repeat warning', () => {
  const c = loadComboPure();
  const st = c.cmbClearState({});
  const r1 = c.cmbStep(st, { move: 'W0:H', btn: 'H', seq: 10 });
  const r2 = c.cmbStep(st, { move: 'W0:H', btn: 'H', seq: 10 });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  assert.equal(r2.sameAction, true);
  assert.equal(r2.repeated, false);
  assert.equal(st.hits, 1);
});

test('cmbClearState resets combo to 0 hits, 0.7x damage and 1.0x attack speed', () => {
  const c = loadComboPure();
  const st = c.cmbClearState({});
  c.cmbStep(st, { move: 'W0:L', btn: 'L', seq: 1 });
  c.cmbStep(st, { move: 'W0:H', btn: 'H', seq: 2 });
  assert.equal(st.hits, 2);
  c.cmbClearState(st);
  assert.equal(st.hits, 0);
  assert.equal(st.lastMove, '');
  assert.equal(st.lastBtn, '');
  assert.equal(st.lastSeq, null);
  assert.equal(c.cmbMult(st.hits), 0.7);
  assert.equal(c.cmbAtkSpd(st.hits), 1.0);
});
