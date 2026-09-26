export function createShiftToggle(onToggle) {
  let down = false, used = false;
  function cancel() { down = used = false; }
  function handle(key) {
    const shift = key.code === 'ShiftLeft' || key.code === 'ShiftRight' || key.key === 'Shift';
    if (shift) {
      if (key.type === 'keydown' && !down && !key.ctrlKey && !key.altKey && !key.metaKey) {
        down = true; used = false;
      } else if (key.type === 'keyup' && down) {
        const toggle = !used;
        cancel();
        if (toggle) onToggle();
      }
      return true;
    }
    if (down && key.type === 'keydown') used = true;
    return false;
  }
  return { handle, cancel };
}
