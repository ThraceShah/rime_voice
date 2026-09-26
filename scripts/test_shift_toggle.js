import assert from 'node:assert/strict';
import { createShiftToggle } from '../src/background/shift_toggle.js';

let toggles = 0;
const shift = createShiftToggle(() => toggles++);
const down = { code: 'ShiftLeft', key: 'Shift', type: 'keydown', shiftKey: true };
const up = { ...down, type: 'keyup' };
shift.handle(down); shift.handle(up);
assert.equal(toggles, 1);
shift.handle(down); shift.handle({ code: 'KeyA', key: 'A', type: 'keydown', shiftKey: true }); shift.handle(up);
assert.equal(toggles, 1, 'Shift+字母不能切换模式');
shift.handle({ ...down, code: 'ShiftRight' }); shift.handle({ ...up, code: 'ShiftRight' });
assert.equal(toggles, 2);
shift.handle({ ...down, altKey: true }); shift.handle(up);
assert.equal(toggles, 2, 'Alt+Shift 不能切换模式');
shift.handle(down); shift.cancel(); shift.handle(up);
assert.equal(toggles, 2);
console.log('Shift 模式切换状态机测试通过');
