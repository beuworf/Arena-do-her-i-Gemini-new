import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadHtml() {
  return fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
}

function loadPoolPure() {
  const html = loadHtml();
  const m = html.match(/\/\* POOL_PURE_START \*\/([\s\S]*?)\/\* POOL_PURE_END \*\//);
  assert.ok(m, 'POOL_PURE block must exist in index.html');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[1] + '\n;this.__pool={mkPool,mkKeyedPool};', ctx);
  return ctx.__pool;
}

test('mkPool tracks warm, hit/miss, idempotent release, cap eviction, and clear', () => {
  const { mkPool } = loadPoolPure();
  let nextId = 0;
  const disposed = [];
  const hidden = [];
  const resetCalls = [];
  const p = mkPool({
    cap: 3,
    create: (tag = 'warm') => ({ id: ++nextId, tag, visible: true }),
    reset: (o, tag) => {
      o.tag = tag;
      o.visible = true;
      resetCalls.push([o.id, tag]);
    },
    hide: (o) => {
      o.visible = false;
      hidden.push(o.id);
    },
    dispose: (o) => disposed.push(o.id),
  });

  p.warm(2);
  assert.equal(p.freeCount(), 2);
  assert.equal(nextId, 2);
  assert.deepEqual(hidden, [1, 2]);
  assert.equal(p.stats.inUse, 0);

  // Acquiring warmed items counts as hits
  const a = p.acquire('a');
  const b = p.acquire('b');
  assert.equal(a.tag, 'a');
  assert.equal(b.tag, 'b');
  assert.equal(a.visible, true);
  assert.equal(p.freeCount(), 0);
  assert.equal(p.stats.hit, 2);
  assert.equal(p.stats.miss, 0);
  assert.equal(p.stats.inUse, 2);
  assert.equal(resetCalls.length, 2);

  // Acquiring past freeCount triggers miss + create
  const c = p.acquire('c');
  const d = p.acquire('d');
  assert.equal(nextId, 4);
  assert.equal(p.stats.miss, 2);
  assert.equal(p.stats.inUse, 4);

  // Releasing items hides them and rejects double-release idempotently
  assert.equal(p.release(a), true);
  assert.equal(p.release(a), false);
  assert.equal(a.visible, false);
  assert.equal(p.stats.rel, 1);
  assert.equal(p.stats.inUse, 3);

  assert.equal(p.release(b), true);
  assert.equal(p.release(c), true);
  assert.equal(p.freeCount(), 3);

  // 4th release exceeds cap=3 -> evicted and disposed immediately
  assert.equal(p.release(d), false);
  assert.equal(p.stats.ev, 1);
  assert.deepEqual(disposed, [d.id]);
  assert.equal(p.freeCount(), 3);
  assert.equal(p.stats.inUse, 0);

  // clear() disposes all remaining free items
  p.clear();
  assert.equal(p.freeCount(), 0);
  assert.equal(disposed.length, 4);
});

test('mkKeyedPool buckets by key, enforces capPerKey and cross-key LRU totalCap, and guards double release', () => {
  const { mkKeyedPool } = loadPoolPure();
  let seq = 0;
  const disposed = [];
  const kp = mkKeyedPool({
    capPerKey: 2,
    totalCap: 3,
    create: (k) => ({ id: ++seq, k, visible: true }),
    reset: (o, k, x) => {
      o.visible = true;
      o.x = x;
    },
    hide: (o) => {
      o.visible = false;
    },
    dispose: (o) => disposed.push(`${o.k}#${o.id}`),
  });

  const n1 = kp.acquire('n', 10);
  const n2 = kp.acquire('n', 20);
  const n3 = kp.acquire('n', 30);
  const r1 = kp.acquire('r', 40);
  const c1 = kp.acquire('c', 50);
  assert.equal(kp.stats.miss, 5);
  assert.equal(kp.stats.inUse, 5);

  // Release n1, n2 (fills capPerKey=2 for 'n'); n3 should evict itself cleanly
  assert.equal(kp.release(n1), true);
  assert.equal(kp.release(n1), false); // idempotent guard
  assert.equal(kp.release(n2), true);
  assert.equal(kp.release(n3), false); // capPerKey=2 exceeded
  assert.deepEqual(disposed, ['n#3']);
  assert.equal(kp.freeCount(), 2);

  // Releasing r1 fits totalCap=3
  assert.equal(kp.release(r1), true);
  assert.equal(kp.freeCount(), 3);

  // Releasing c1 triggers cross-key LRU eviction of oldest free item (n1)
  assert.equal(kp.release(c1), true);
  assert.equal(kp.freeCount(), 3);
  assert.deepEqual(disposed, ['n#3', 'n#1']);

  // Acquiring 'n' reuses n2 (hit), acquiring 'r' reuses r1 (hit)
  const nReused = kp.acquire('n', 99);
  assert.equal(nReused, n2);
  assert.equal(nReused.x, 99);
  assert.equal(nReused.visible, true);

  const rReused = kp.acquire('r', 77);
  assert.equal(rReused, r1);
  assert.equal(rReused.x, 77);
  assert.equal(kp.stats.hit, 2);

  kp.clear();
  assert.equal(kp.freeCount(), 0);
  assert.ok(disposed.includes('c#5'));
});

test('index.html wires object pooling for enemies, projectiles, shurikens, turret bombs, and arena resets', () => {
  const html = loadHtml();

  // Enemy pool & lifecycle wiring
  assert.match(html, /const ENP=mkKeyedPool\(/);
  assert.match(html, /function mkE\(k,sx,sz\)\{const K=EK\[k\],rig=ENP\.acquire\(k,sx,sz\)/);
  assert.match(html, /if\(d\.t>\(d\.T\|\|1\)\)\{if\(d\.rig\)ENP\.release\(d\.rig\)/);
  assert.match(html, /function restart\(\)[\s\S]*?E\.forEach\(enRelE\);E\.length=0;dyClear\(\);/);
  assert.match(html, /function lvlUp\(\)[\s\S]*?E\.forEach\(enRelE\);E\.length=0;dyClear\(\);/);
  assert.match(html, /function netLvl\(lv\)[\s\S]*?E\.forEach\(enRelE\);E\.length=0;dyClear\(\);/);
  assert.match(html, /if\(NET\.lvClr\)\{enRelE\(e\)\}/);

  // Projectile pools & callsites
  assert.match(html, /const PMP=mkPool\([\s\S]*?PMP\.warm\(16\)/);
  assert.match(html, /const PRP=mkPool\(/);
  assert.match(html, /const EPP=mkPool\(/);
  assert.match(html, /const RPV=\[\],RPVP=mkPool\(/);
  assert.match(html, /const SHP=mkPool\(/);
  assert.match(html, /const GEAR=[^;]+MQBG=new THREE\.SphereGeometry/);
  assert.match(html, /function shot\(a,o\)[\s\S]*?pmAcq\(/);
  assert.match(html, /function projUpd\(dt\)[\s\S]*?prDropAt\(i\)/);
  assert.match(html, /function fireE\(e,tg\)[\s\S]*?epPush\(/);
  assert.match(html, /function epUpd\(dt\)[\s\S]*?epDropAt\(i\)/);
  assert.match(html, /function rpvUpd\(dt\)[\s\S]*?rpvDropAt\(i\)/);
  assert.match(html, /function shuri\(x,z,a\)\{const g=SHP\.acquire\(\)/);
  assert.match(html, /if\(d\.t=='sh'\)[\s\S]*?pmAcq\([\s\S]*?RPVP\.acquire\(\)/);
  assert.match(html, /if\(d\.t=='fe'\)[\s\S]*?epPush\(/);
  assert.match(html, /MQB\.forEach\(b=>pmRel\(b\.m\)\)/);
  assert.match(html, /pmAcq\(MQBG,MQM\.dark\)/);

  // Debug telemetry hook (strictly under #dbg)
  assert.match(html, /if\(location\.hash=='#dbg'\)window\.__dbg=\{[\s\S]*?poolStats:\(\)=>/);
});
