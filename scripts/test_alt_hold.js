import assert from 'node:assert/strict';
import { createAltHold } from '../src/background/alt_hold.js';

const pending = new Map();
let nextId = 0, starts = 0, stops = 0;
const hold = createAltHold({
  delay: 400,
  onStart: () => starts++,
  onStop: () => stops++,
  setTimer: callback => { const id = ++nextId; pending.set(id, callback); return id; },
  clearTimer: id => pending.delete(id)
});
const down = { code: 'AltRight', key: 'Alt', type: 'keydown', altKey: true };
const up = { ...down, type: 'keyup' };
function advance() { for (const callback of [...pending.values()]) callback(); pending.clear(); }

hold.handle(down); hold.handle(up); advance();
assert.equal(starts, 0); assert.equal(stops, 0);
hold.handle(down); advance();
assert.equal(starts, 1); assert.equal(hold.isDown(), true);
hold.handle(up); assert.equal(stops, 1);
hold.handle(down); hold.handle({ code: 'KeyF', key: 'f', type: 'keydown', altKey: true }); advance(); hold.handle(up);
assert.equal(starts, 1); assert.equal(stops, 1);
hold.handle({ ...down, code: 'AltLeft' }); advance();
assert.equal(starts, 1);
hold.handle({ ...down, ctrlKey: true }); advance(); hold.handle(up);
assert.equal(starts, 1);
hold.handle(down); hold.cancel(); advance();
assert.equal(starts, 1);
console.log('右 Alt 长按状态机测试通过');
