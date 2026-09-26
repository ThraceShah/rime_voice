export function createAltHold({ keyCode = 'AltRight', delay = 400, onStart, onStop, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let down = false, triggered = false, interrupted = false, timer;
  function cancel() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    down = triggered = interrupted = false;
  }
  function handle(key) {
    if (key.code === keyCode) {
      if (key.type === 'keydown' && !down && !key.ctrlKey && !key.metaKey && !key.shiftKey) {
        down = true; triggered = interrupted = false;
        timer = setTimer(() => {
          timer = undefined;
          if (!down || interrupted) return;
          triggered = true;
          onStart();
        }, delay);
      } else if (key.type === 'keyup' && down) {
        const shouldStop = triggered;
        cancel();
        if (shouldStop) onStop();
      }
      return true;
    }
    if (down && !triggered && key.type === 'keydown') {
      interrupted = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    }
    return false;
  }
  return { handle, cancel, isDown: () => down };
}
