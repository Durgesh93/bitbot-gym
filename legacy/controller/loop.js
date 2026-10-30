/* ========================================================================
   6. The loop. One frame is a handful of 5 ms steps, and we yield between
      them so the program's next line really does run at the right moment.
   ======================================================================== */
const DT = 5;
// animation frames stop in a tab nobody is looking at, so keep a timer behind them:
// the gym carries on in the background instead of freezing mid-program
function nextFrame() {
  return new Promise(res => {
    let done = false;
    const fire = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(fire);
    setTimeout(fire, 50);
  });
}
/* The loop must survive a bad frame. It used to have no net at all: one
   error anywhere inside it ended the loop for good, and because `running`
   stayed true nothing ever started it again - so every later Play did
   nothing, the clock sat still and no card number changed. Now a bad frame
   is said once and the loop carries on, and loopAlive lets Play pick the
   loop up again if it ever does stop. */
let loopAlive = false;
async function loop() {
  if (loopAlive) return;                 // one loop at a time, never two
  loopAlive = true;
  let moaned = false;
  try {
    while (running) {
      try {
        const steps = Math.max(1, Math.round(16.7 * Number(document.getElementById("speed").value) / DT));
        for (let i = 0; i < steps; i++) {
          physics(DT); simTime += DT; flushTimers();
          await Promise.resolve();
        }
        soundWatch();
        draw(); instruments(); updateStage();
      } catch (e) {
        if (!moaned) { moaned = true; say("something went wrong in the room: " + e.message, "err"); }
      }
      await nextFrame();
    }
  } finally {
    loopAlive = false;
  }
  draw(); instruments();
}

