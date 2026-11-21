// Conversor de animações CC0 (Mesh2Motion / Quaternius UAL, meshoptimizer) -> modelos/animacoes2.json
// Uso: node tools/import_anims.mjs <pasta-glbs> <caminho-meshopt-decoder.js>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const srcDir = process.argv[2] || '/tmp/anim_probe/clips';
const decoderPath = process.argv[3] || '/tmp/anim_probe/meshopt_decoder.js';
const outPath = path.resolve('modelos/animacoes2.json');

const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
function qSlerp(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (dot > 0.9995) {
    return qNorm([a[0] + t * (bx - a[0]), a[1] + t * (by - a[1]), a[2] + t * (bz - a[2]), a[3] + t * (bw - a[3])]);
  }
  const th0 = Math.acos(Math.min(1, Math.max(-1, dot))), th = th0 * t;
  const s0 = Math.cos(th) - (dot * Math.sin(th)) / Math.sin(th0), s1 = Math.sin(th) / Math.sin(th0);
  return [s0 * a[0] + s1 * bx, s0 * a[1] + s1 * by, s0 * a[2] + s1 * bz, s0 * a[3] + s1 * bw];
}

const M2M_TO_GAME = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Chest', spine_03: 'UpperChest', neck_01: 'Neck', head: 'Head',
  thigh_l: 'RightUpperLeg', calf_l: 'RightLowerLeg', foot_l: 'RightFoot', ball_l: 'RightToes',
  thigh_r: 'LeftUpperLeg', calf_r: 'LeftLowerLeg', foot_r: 'LeftFoot', ball_r: 'LeftToes',
  clavicle_l: 'RightShoulder', upperarm_l: 'RightUpperArm', lowerarm_l: 'RightLowerArm', hand_l: 'RightHand',
  clavicle_r: 'LeftShoulder', upperarm_r: 'LeftUpperArm', lowerarm_r: 'LeftLowerArm', hand_r: 'LeftHand',
};
for (const [mS, gS] of [['l', 'Right'], ['r', 'Left']]) {
  for (const [mf, gf] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Little'], ['thumb', 'Thumb']]) {
    M2M_TO_GAME[`${mf}_01_${mS}`] = `${gS}${gf}Proximal`;
    M2M_TO_GAME[`${mf}_02_${mS}`] = `${gS}${gf}Intermediate`;
    M2M_TO_GAME[`${mf}_03_${mS}`] = `${gS}${gf}Distal`;
  }
}

const anim2 = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const BONES = anim2.c.idle.b.slice();
const m = require(decoderPath);

function decodeGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jlen).toString('utf8').replace(/\0+$/, ''));
  const blen = buf.readUInt32LE(20 + jlen);
  const bin = buf.slice(28 + jlen, 28 + jlen + blen);
  const views = json.bufferViews.map((bv) => {
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    if (!ext) return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const dst = new Uint8Array(ext.count * ext.byteStride);
    const src = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
    m.decodeGltfBuffer(dst, ext.count, ext.byteStride, src, ext.mode, ext.filter || 'NONE');
    return Buffer.from(dst.buffer);
  });
  return { json, views };
}

function sampleT(T, t) {
  if (t <= T[0]) return [0, 0, 0];
  if (t >= T[T.length - 1]) return [T.length - 1, T.length - 1, 0];
  let lo = 0, hi = T.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
  return [lo, hi, (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo])];
}

function convertClip(filePath, opts = {}) {
  const g = decodeGLB(filePath), json = g.json;
  const parent = {};
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const gRest = [];
  function getGR(i) {
    if (gRest[i]) return gRest[i];
    const r = json.nodes[i].rotation || [0, 0, 0, 1], p = parent[i];
    return (gRest[i] = p !== undefined ? qMul(getGR(p), r) : r);
  }
  json.nodes.forEach((_, i) => getGR(i));
  function readVec(accIdx) {
    const acc = json.accessors[accIdx], vw = g.views[acc.bufferView];
    const off = vw.byteOffset + (acc.byteOffset || 0), comp = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC3' ? 3 : 4;
    if (acc.componentType === 5126) return new Float32Array(vw.buffer, off, acc.count * comp);
    if (acc.componentType === 5122) {
      const s = new Int16Array(vw.buffer, off, acc.count * comp), f = new Float32Array(s.length);
      for (let i = 0; i < s.length; i++) f[i] = Math.max(-1, s[i] / 32767);
      return f;
    }
    throw new Error('Unsupported componentType ' + acc.componentType);
  }
  const a = json.animations[0];
  let rawDur = 0;
  const rotCh = {}, posCh = {};
  for (const ch of a.channels) {
    const n = json.nodes[ch.target.node], s = a.samplers[ch.sampler];
    const T = readVec(s.input), V = readVec(s.output);
    if (T.length && T[T.length - 1] > rawDur) rawDur = T[T.length - 1];
    if (ch.target.path === 'rotation' && M2M_TO_GAME[n.name]) rotCh[M2M_TO_GAME[n.name]] = { nodeIdx: ch.target.node, T, V };
    else if (ch.target.path === 'translation' && n.name === 'pelvis') posCh.pelvis = { nodeIdx: ch.target.node, T, V };
  }
  const tMin = opts.tMin ?? 0, tMax = Math.min(rawDur, opts.tMax ?? rawDur), dur = Math.max(0.1, tMax - tMin);
  const fps = anim2.fps || 30, nFrames = Math.max(2, Math.round(dur * fps) + 1), nb = BONES.length;
  const qArr = new Int16Array(nFrames * nb * 4), hArr = new Float32Array(nFrames * 3), prevQ = {};
  const HSCALE = 0.9491 / 0.9167;
  for (let fi = 0; fi < nFrames; fi++) {
    const tm = tMin + (fi === nFrames - 1 ? dur : fi / fps);
    if (posCh.pelvis) {
      const { T, V } = posCh.pelvis, [i0, i1, u] = sampleT(T, tm);
      const vx = V[i0 * 3] * (1 - u) + V[i1 * 3] * u;
      const vy = V[i0 * 3 + 1] * (1 - u) + V[i1 * 3 + 1] * u;
      const vz = V[i0 * 3 + 2] * (1 - u) + V[i1 * 3 + 2] * u;
      hArr[fi * 3] = vx * HSCALE;
      hArr[fi * 3 + 1] = vz * HSCALE - 0.9491;
      hArr[fi * 3 + 2] = vy * HSCALE - 0.043;
    }
    for (let bi = 0; bi < nb; bi++) {
      let q = [0, 0, 0, 1];
      if (rotCh[BONES[bi]]) {
        const { nodeIdx, T, V } = rotCh[BONES[bi]], [i0, i1, u] = sampleT(T, tm);
        const ql = qSlerp([V[i0 * 4], V[i0 * 4 + 1], V[i0 * 4 + 2], V[i0 * 4 + 3]], [V[i1 * 4], V[i1 * 4 + 1], V[i1 * 4 + 2], V[i1 * 4 + 3]], u);
        const gP = parent[nodeIdx] !== undefined ? gRest[parent[nodeIdx]] : [0, 0, 0, 1], gN = gRest[nodeIdx];
        const wd = qMul(qMul(gP, ql), qConj(gN));
        q = qNorm([-wd[0], -wd[1], wd[2], wd[3]]);
        if (prevQ[bi] && prevQ[bi][0] * q[0] + prevQ[bi][1] * q[1] + prevQ[bi][2] * q[2] + prevQ[bi][3] * q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
        prevQ[bi] = q;
      }
      const base = (fi * nb + bi) * 4;
      for (let e = 0; e < 4; e++) qArr[base + e] = Math.round(Math.max(-1, Math.min(1, q[e])) * 32767);
    }
  }
  if (opts.inPlace) {
    let sx = 0, sz = 0;
    for (let fi = 0; fi < nFrames; fi++) { sx += hArr[fi * 3]; sz += hArr[fi * 3 + 2]; }
    sx /= nFrames; sz /= nFrames;
    for (let fi = 0; fi < nFrames; fi++) { hArr[fi * 3] -= sx; hArr[fi * 3 + 2] -= sz; }
  }
  const out = {
    d: +dur.toFixed(4), n: nFrames, o: opts.once ? 1 : 0, b: BONES,
    q: Buffer.from(qArr.buffer, qArr.byteOffset, qArr.byteLength).toString('base64'),
    h: Buffer.from(hArr.buffer, hArr.byteOffset, hArr.byteLength).toString('base64'),
  };
  if (opts.i) out.i = opts.i;
  return out;
}

const CLIPS = [
  ['kick', 'kick-roundhouse.glb', { once: 1, tMin: 0.08, tMax: 1.15, i: [0.08, 0.62] }],
  ['kickSpin', 'kick-spin.glb', { once: 1, tMin: 0.06, tMax: 1.30, i: [0.08, 0.60] }],
  ['stab', 'dagger-stab.glb', { once: 1, tMin: 0.06, tMax: 0.95, i: [0.06, 0.40] }],
  ['dualCombo', 'dual-wield-combo.glb', { once: 1, tMin: 0.20, tMax: 0.92, i: [0.04, 0.42] }],
  ['dualCross', 'dual-wield-cross-slash.glb', { once: 1, tMin: 0.06, tMax: 1.10, i: [0.06, 0.41] }],
  ['twoHandSwing', 'two-handed-horizontal-swing.glb', { once: 1, tMin: 0.06, tMax: 1.15, i: [0.06, 0.41] }],
  ['spearThrust', 'spear-thrust.glb', { once: 1, tMin: 0.05, tMax: 1.00, i: [0.05, 0.32] }],
  ['staffCombo', 'staff-combo.glb', { once: 1, tMin: 0.10, tMax: 1.25, i: [0.08, 0.52] }],
  ['crouchIdle', 'crouch-idle.glb', { once: 0, inPlace: 1 }],
  ['crouchWalk', 'crouch-walk.glb', { once: 0, inPlace: 1 }],
  ['strafeL', 'strafe-left.glb', { once: 0, inPlace: 1 }],
  ['strafeR', 'strafe-right.glb', { once: 0, inPlace: 1 }],
  ['walkBack', 'walk-backwards.glb', { once: 0, inPlace: 1 }],
  ['jumpLand', 'jump-land.glb', { once: 1, tMin: 0, tMax: 0.85 }],
];

await m.ready;
for (const [key, file, opts] of CLIPS) {
  anim2.c[key] = convertClip(path.join(srcDir, file), opts);
}
fs.writeFileSync(outPath, JSON.stringify(anim2));
console.log('Saved', Object.keys(anim2.c).length, 'clips to', outPath, 'size:', (fs.statSync(outPath).size / 1024).toFixed(1) + 'KB');
