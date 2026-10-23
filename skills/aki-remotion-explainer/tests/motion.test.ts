import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMotion, selectCharacterAsset, transformPoint, transformHandPoint} from '../template/src/kit/motion.ts';
import type {Motion} from '../template/src/kit/motion.ts';

const geometry = {width: 100, height: 200, bodyHeight: 180, anchor: {x: 50, y: 190}, hands: {left: {x: 20, y: 100}, right: {x: 80, y: 100}}};
const motion: Motion = {...geometry, fps: 12, frames: Array.from({length: 24}, (_, i) => ({src: `${i}.png`, hands: {...geometry.hands, right: {x: 80 + i / 2, y: 100}}})), loop: {start: 6, end: 18}, events: [{frame: 5, type: 'contact', hand: 'right', prop: 'card'}, {frame: 12, type: 'release', hand: 'right', prop: 'card'}]};

test('12 source fps maps to 30 output fps with exact start and end', () => {
  const indices = Array.from({length: 60}, (_, frame) => sampleMotion(motion, {frame, fps: 30}).index);
  assert.equal(new Set(indices).size, 24);
  assert.deepEqual(indices.slice(0, 6), [0, 0, 0, 1, 1, 2]);
  assert.equal(indices[59], 23);
  assert.equal(sampleMotion(motion, {frame: 900, fps: 30}).index, 23);
  assert.equal(sampleMotion(motion, {frame: 0, fps: 30}, {actionSince: 30}).index, 0);
  assert.equal(sampleMotion(motion, {frame: 35, fps: 30}, {actionSince: 30}).index, 2);
  assert.equal(sampleMotion(motion, {frame: 15, fps: 30}, {actionSpeed: 2}).index, 12);
});

test('loop preserves preparation and repeats only the declared interval', () => {
  const sample = (frame: number) => sampleMotion(motion, {frame, fps: 12}, {actionLoop: true}).index;
  assert.equal(sample(5), 5);
  assert.equal(sample(17), 17);
  assert.equal(sample(18), 6);
  assert.equal(sample(29), 17);
  assert.equal(sample(30), 6);
  assert.throws(() => sampleMotion({...motion, loop: undefined}, {frame: 0, fps: 30}, {actionLoop: true}));
});

test('contacts release exactly at the named source frame', () => {
  assert.deepEqual(sampleMotion(motion, {frame: 4, fps: 12}).contacts, {});
  assert.deepEqual(sampleMotion(motion, {frame: 5, fps: 12}).contacts, {card: 'right'});
  assert.deepEqual(sampleMotion(motion, {frame: 12, fps: 12}).contacts, {});
});

test('action takes precedence; single pose and expression remain compatible', () => {
  const character = {...geometry, faces: {idle: 'idle.png', happy: 'happy.png'}, poses: {hold: {...geometry, src: 'hold.png'}}, actions: {push: motion}};
  assert.equal(selectCharacterAsset(character, {}).src, 'idle.png');
  assert.equal(selectCharacterAsset(character, {face: 'happy'}).src, 'happy.png');
  assert.equal(selectCharacterAsset(character, {pose: 'hold', face: 'missing'}).src, 'hold.png');
  assert.equal(selectCharacterAsset(character, {action: 'push', pose: 'missing'}, {frame: 30, fps: 30}).src, '12.png');
  assert.throws(() => selectCharacterAsset(character, {action: 'push'}));
  assert.throws(() => selectCharacterAsset(character, {action: 'missing'}, {frame: 0, fps: 30}));
});

test('hand tracks the sampled frame through flip, scale and rotation', () => {
  const {asset} = sampleMotion(motion, {frame: 30, fps: 30});
  const point = transformPoint(asset, asset.hands.right, {x: 500, y: 800, h: 360, flip: true, rot: 90});
  assert.ok(Math.abs(point.x - 680) < 1e-8);
  assert.ok(Math.abs(point.y - 728) < 1e-8);
});

test('untracked video and static assets render but cannot drive prop contact', () => {
  const actor = {x: 500, y: 800, h: 360, flip: true, rot: 90};
  const untracked = {...motion, contactSupported: false};
  const character = {...geometry, faces: {idle: 'idle.png'}, poses: {untracked: {...geometry, contactSupported: false, src: 'pose.png'}}, actions: {video: untracked}};
  const frame = selectCharacterAsset(character, {action: 'video'}, {frame: 30, fps: 30});
  assert.equal(frame.src, '12.png');
  assert.throws(() => transformHandPoint(frame, 'right', actor), /not tracked/);
  assert.throws(() => transformHandPoint(selectCharacterAsset(character, {pose: 'untracked'}), 'left', actor), /not tracked/);
  assert.deepEqual(transformHandPoint(geometry, 'right', actor), transformPoint(geometry, geometry.hands.right, actor));
});

test('invalid timing fails instead of silently freezing', () => {
  for (const speed of [0, -1, NaN, Infinity]) assert.throws(() => sampleMotion(motion, {frame: 0, fps: 30}, {actionSpeed: speed}));
  assert.throws(() => sampleMotion(motion, {frame: 0, fps: 0}));
});
