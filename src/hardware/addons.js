/* WHAT CAN BE BOLTED ONTO A BIT:BOT
   ==================================

   A real Bit:Bot is a board with sockets, and almost everything
   interesting is a separate little board you buy and screw on. The gym
   used to pretend none of them existed: every block for them said "the
   gym has not got it" and carried on. That was honest but it was a dead
   end, because the blocks are right there in the drawer and a child who
   drags one in deserves to see something happen.

   So the gym now has the sockets too. Each robot carries a set of
   fitted add-ons, chosen from this list, and a block only works if the
   board it needs is on. Unfit the ultrasonic and the sonar stops
   answering - which is exactly what happens if you unscrew it.

   WHY A TABLE AND NOT A PILE OF IFS. Three things need the same facts:
   the API (may this block run?), the menu (what may I fit to this
   robot?) and the card (what should I draw?). They disagreed within a
   day when the facts lived in three places.

   WHAT EACH ENTRY MEANS

     id       what the code calls it, and what a saved project stores
     name     what the child reads in the menu
     what     one line saying what the thing does, for the menu's hint
     models   which Bit:Bots it can be fitted to
     builtIn  models that already have it, where fitting is meaningless
     fitted   true if a robot arrives with it on (see the note below)
     clash    per model, what it cannot be fitted alongside
     draws    true if it puts a picture in the card

   WHY THE ULTRASONIC ARRIVES FITTED. Everything else starts off. The
   sonar does not, because the gym has simulated it since the beginning:
   Wall Dodger is built on it, it went home with the children as
   homework, and every saved project assumes it. A robot that arrived
   without it would break all of that the moment somebody pressed Play.
   Taking it off is a deliberate act, and then the sonar really does go
   quiet. */

export const ADDONS = [
  {
    id: "sonar",
    name: "Ultrasonic eyes",
    what: "measures how far away the thing in front is",
    models: ["Classic", "XL", "PRO"],
    fitted: true,
    /* on a Classic the claw and the eyes want the same connections; on an
       XL you buy the tall breakout and they live together */
    clash: { Classic: ["talon"] },
    draws: false        // the card already has its own sonar readout
  },
  {
    id: "ir",
    name: "IR receiver",
    what: "lets a remote control drive the robot",
    models: ["Classic", "XL"],
    builtIn: ["PRO"],   // the PRO has one on board, on P14
    fitted: false,
    draws: true
  },
  {
    id: "matrix",
    name: "5x5 matrix",
    what: "25 coloured lights - the micro:bit screen, in colour",
    models: ["Classic", "XL", "PRO"],
    fitted: false,
    draws: true
  },
  {
    id: "bitface",
    name: "BitFace",
    what: "two eyes, a nose and a mouth, in colour",
    models: ["Classic", "XL", "PRO"],
    fitted: false,
    draws: true
  },
  {
    id: "oled",
    name: "OLED screen",
    what: "a little screen for words and numbers that stay put",
    models: ["Classic", "XL", "PRO"],
    fitted: false,
    draws: true
  },
  {
    id: "talon",
    name: "Talon claw",
    what: "a jaw on the front that picks things up",
    models: ["Classic", "XL"],
    fitted: false,
    clash: { Classic: ["sonar"] },
    draws: true
  },
  {
    /* THE TALON IS A SERVO TOO, and this is not it.

       `set servo P1 to 90` is the plain block for a servo you have
       plugged into the header yourself - a horn that turns, or a
       continuous one that spins. The Talon is one particular servo with
       a jaw screwed to it, which is why 4tronix gave it its own block
       and why it is its own entry above. Fitting one does not fit the
       other; a robot can carry both, on different pins. */
    id: "servo",
    name: "Servo",
    what: "a horn that turns to an angle, or a wheel that spins",
    models: ["Classic", "XL", "PRO"],
    fitted: false,
    draws: true
  }
];

/* Which pins a servo may be plugged into. The dropdown in the blocks
   offers the micro:bit's pins; these are the ones a Bit:Bot actually
   breaks out, so a child who picks another gets told rather than
   watching nothing happen. */
export const SERVO_PINS = ["P1", "P2"];

export const BY_ID = {};
for (const a of ADDONS) BY_ID[a.id] = a;

/* What a brand-new robot of this model has on it. */
export function defaultFit(model) {
  const on = {};
  for (const a of ADDONS) {
    if (a.fitted && allows(model, a.id)) on[a.id] = true;
  }
  return on;
}

/* Can this model take this board at all? A model that has it built in
   cannot be "fitted" with one - there is nowhere to put a second. */
export function allows(model, id) {
  const a = BY_ID[id];
  if (!a) return false;
  return a.models.indexOf(model || "XL") >= 0;
}

export function isBuiltIn(model, id) {
  const a = BY_ID[id];
  return !!(a && a.builtIn && a.builtIn.indexOf(model || "XL") >= 0);
}

/* What this one would collide with on this model, of the things already
   fitted. Returns the ids, so the menu can say why it is refusing. */
export function clashesWith(model, id, fit) {
  const a = BY_ID[id];
  if (!a || !a.clash) return [];
  const list = a.clash[model || "XL"] || [];
  return list.filter(other => fit && fit[other]);
}

/* ---------------------------------------------------------------------
   THE 4TRONIX REMOTE

   These are the real codes off the real handset, straight out of the
   BitBot extension's `BBirKeys`. They matter: `IR code` hands the
   number to the child's program, and a child who looks it up in the
   MakeCode drawer must see the same number the gym gave them.

   Seventeen keys and no more, because that is what is on the card in
   the box. `label` is what is printed on the key. */
export const IR_KEYS = [
  { id: "One",   label: "1", code: 162 },
  { id: "Two",   label: "2", code: 98 },
  { id: "Three", label: "3", code: 226 },
  { id: "Four",  label: "4", code: 34 },
  { id: "Five",  label: "5", code: 2 },
  { id: "Six",   label: "6", code: 194 },
  { id: "Save",  label: "save", code: 224 },
  { id: "Stop",  label: "■", code: 168 },
  { id: "Load",  label: "load", code: 144 },
  { id: "Cross", label: "X", code: 104 },
  { id: "Pause", label: "║", code: 152 },
  { id: "Tick",  label: "/", code: 176 },
  { id: "Up",    label: "↑", code: 24 },
  { id: "Down",  label: "↓", code: 74 },
  { id: "Left",  label: "←", code: 16 },
  { id: "Right", label: "→", code: 90 },
  { id: "Go",    label: "►", code: 56 }
];

export const IR_BY_CODE = {};
export const IR_BY_ID = {};
for (const k of IR_KEYS) { IR_BY_CODE[k.code] = k; IR_BY_ID[k.id] = k; }

/* `Any` is code 0 in the extension and means "I do not care which key",
   so it is a handler name rather than something you can press. */
export const IR_ANY = 0;

/* How far a remote reaches, and how wide its beam is when pointed.
   Both are honest-ish: a cheap handset is good for a few metres and
   wants to be aimed, which is the whole lesson. */
export const IR_REACH = 4000;                  // mm
export const IR_CONE = 30 * Math.PI / 180;     // half-angle, each side of the nose
