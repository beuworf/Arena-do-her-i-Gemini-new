import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function loadAchievementsPure() {
  const start = html.indexOf('/* ACH_PURE_START */');
  const end = html.indexOf('/* ACH_PURE_END */');
  assert.ok(start !== -1 && end !== -1 && end > start, 'ACH_PURE markers must exist in index.html');
  let block = html.slice(start, end);
  // Expose const bindings cleanly onto the vm sandbox global
  block = block.replace(/^const\s+(ACH_CATS|ACH_TIER|ACH)\s*=/gm, 'var $1=');
  const sandbox = { Math, Object, Date, Array, Set, Map };
  vm.runInNewContext(block, sandbox);
  return sandbox;
}

test('catalog contains 100 unique merit-only achievements across all categories and tiers', () => {
  const { ACH, ACH_CATS, ACH_TIER } = loadAchievementsPure();
  assert.equal(ACH.length, 100, 'Expected exactly 100 achievements');
  assert.deepEqual(Array.from(ACH_CATS), ['Combate', 'Bestiário', 'Chefes', 'Progressão', 'Classes', 'Desafios']);
  assert.deepEqual(Array.from(ACH_TIER), ['Comum', 'Raro', 'Épico', 'Lendário', 'Mítico']);

  const ids = new Set();
  const titles = new Set();
  const tierCounts = [0, 0, 0, 0, 0];
  const catSet = new Set();

  for (const a of ACH) {
    assert.equal(a.length, 8, `Achievement ${a[0]} must have 8 tuple fields`);
    const [id, icon, title, desc, cat, tier, target, key] = a;
    assert.ok(id && typeof id === 'string');
    assert.ok(icon && typeof icon === 'string');
    assert.ok(title && typeof title === 'string');
    assert.ok(desc && typeof desc === 'string');
    assert.ok(ACH_CATS.includes(cat), `Invalid category ${cat} on ${id}`);
    assert.ok(tier >= 0 && tier <= 4, `Invalid tier ${tier} on ${id}`);
    assert.ok(typeof target === 'number' && target >= 1, `Invalid target ${target} on ${id}`);
    assert.ok(key && typeof key === 'string');
    assert.ok(!ids.has(id), `Duplicate achievement id: ${id}`);
    assert.ok(!titles.has(title), `Duplicate achievement title: ${title}`);
    ids.add(id);
    titles.add(title);
    tierCounts[tier]++;
    catSet.add(cat);
  }

  assert.equal(catSet.size, 6, 'All 6 categories should be represented');
  assert.ok(tierCounts[2] >= 15, 'Should include plenty of Épico achievements');
  assert.ok(tierCounts[3] >= 15, 'Should include plenty of Lendário achievements');
  assert.ok(tierCounts[4] >= 10, 'Should include hard Mítico achievements');

  // Prompt milestone titles
  assert.ok(titles.has('Primeiro abate'));
  assert.ok(titles.has('Chegar ao nível 5'));
  assert.ok(titles.has('Derrotar o primeiro chefe'));
});

test('achievements system has zero combat/stat modifiers (strictly merit-only)', () => {
  const { ACH, achCreate, achEval } = loadAchievementsPure();
  for (const a of ACH) {
    assert.equal(a.length, 8);
    assert.ok(!/bônus|\+\d+%|recompensa de|aumenta seu|ganhe \+/i.test(a[3]), `Unexpected buff wording in ${a[0]}: ${a[3]}`);
  }
  const state = achCreate({});
  const unlocked = Array.from(achEval(state, { rk: 1, up: 0 }, 123456));
  assert.deepEqual(unlocked, []);
  state.st.k = 1;
  const first = Array.from(achEval(state, { rk: 1 }, 999));
  assert.equal(first.length, 1);
  assert.equal(first[0][0], 'k1');
  assert.equal(state.u.k1, 999);
});

test('unlock evaluation triggers key milestones and hard challenges accurately and idempotently', () => {
  const { achCreate, achVal, achEval } = loadAchievementsPure();
  const S = achCreate();
  const run = { rk: 0, up: 0, hits: 0, t: 0, tm: 0, els: new Set(), sec: new Set() };

  // 1. Primeiro abate
  S.st.k = 1;
  run.rk = 1;
  S.st.rk = 1;
  let nw = Array.from(achEval(S, run, 1000));
  assert.deepEqual(Array.from(nw, (a) => a[0]), ['k1']);

  // Idempotent on repeat evaluation
  const repeat = Array.from(achEval(S, run, 2000));
  assert.deepEqual(repeat, []);
  assert.equal(S.u.k1, 1000);

  // 2. Chegar ao nível 5
  S.st.ml = 5;
  nw = Array.from(achEval(S, run, 3000));
  assert.deepEqual(Array.from(nw, (a) => a[0]), ['xp5']);

  // 3. Derrotar o primeiro chefe (+ hard boss flags)
  S.st.bo = 1;
  S.st.nh = 1;
  S.st.nu = 1;
  S.st.cl = 1;
  nw = Array.from(achEval(S, run, 4000));
  assert.deepEqual(
    Array.from(nw, (a) => a[0]).sort(),
    ['bo1', 'clch', 'nhB', 'noUp'].sort()
  );

  // 4. Hard progression & mastery achievements
  for (let i = 0; i < 8; i++) {
    S.cl[i] = 10;
    S.rc[i] = 10;
  }
  for (let b = 0; b < 14; b++) S.bw[b] = 1;
  run.els = new Set([0, 1, 2, 3]);
  S.st.ms = 15;
  S.st.ml = 25;
  S.st.sB = 1;
  S.st.sd = 5;
  S.st.sp = 1;
  assert.equal(achVal(S, 'ac', run), 8);
  assert.equal(achVal(S, 'ar', run), 8);
  assert.equal(achVal(S, 'bw', run), 14);
  assert.equal(achVal(S, 'm4', run), 4);

  nw = Array.from(achEval(S, run, 5000));
  const ids = new Set(nw.map((a) => a[0]));
  for (const req of ['allC', 'allR', 'bw6', 'bw14', 'mg4', 'lv15', 'xp25', 'secB', 'sec5', 'sp3']) {
    assert.ok(ids.has(req), `Expected ${req} to unlock`);
  }
});

test('achievements DOM elements, visual toast, SFX hook, and menu entry exist in index.html', () => {
  for (const id of ['ach', 'achSum', 'afl', 'agr', 'abk', 'achPop']) {
    assert.ok(html.includes(`id="${id}"`), `Missing #${id}`);
  }
  assert.ok(html.includes("'Conquistas'"));
  assert.ok(html.includes("localStorage.getItem('arena_ach')"));
  assert.ok(html.includes('Conquista Desbloqueada'));
  assert.ok(html.includes('ach:()=>[659,880,1047,1319]'));
});
