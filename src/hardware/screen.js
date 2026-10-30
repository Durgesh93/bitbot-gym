/* The micro:bit's 5x5 screen, and the font the board draws on it.

   Twenty-five numbers, 0 to 9, because the real screen has brightness per
   LED and `plot brightness` is a block children do find. Anything that only
   asks "is it on" treats anything above 0 as on.

   One character stands still; anything longer scrolls in from the right a
   column at a time, exactly as the board does. That is worth having right:
   "show number 12" taking a second and a half to go past is a thing children
   notice and ask about, and a screen that showed "12" at once would quietly
   teach them the wrong thing about how long their program takes. */

export const W = 5, H = 5, CELLS = W * H;

/* Five rows of five, top to bottom. Taken off the board's own font. */
const FONT = {
  "0": "01100 10010 10010 10010 01100", "1": "00100 01100 00100 00100 01110",
  "2": "11100 00010 01100 10000 11110", "3": "11110 00010 01100 00010 11100",
  "4": "10000 10100 10100 11110 00100", "5": "11110 10000 11100 00010 11100",
  "6": "00110 01000 11100 10010 01100", "7": "11110 00010 00100 01000 01000",
  "8": "01100 10010 01100 10010 01100", "9": "01100 10010 01110 00010 01100",
  "A": "01100 10010 11110 10010 10010", "B": "11100 10010 11100 10010 11100",
  "C": "01110 10000 10000 10000 01110", "D": "11100 10010 10010 10010 11100",
  "E": "11110 10000 11100 10000 11110", "F": "11110 10000 11100 10000 10000",
  "G": "01110 10000 10110 10010 01110", "H": "10010 10010 11110 10010 10010",
  "I": "11100 01000 01000 01000 11100", "J": "11110 00010 00010 10010 01100",
  "K": "10010 10100 11000 10100 10010", "L": "10000 10000 10000 10000 11110",
  "M": "10001 11011 10101 10001 10001", "N": "10001 11001 10101 10011 10001",
  "O": "01100 10010 10010 10010 01100", "P": "11100 10010 11100 10000 10000",
  "Q": "01100 10010 10010 01100 00110", "R": "11100 10010 11100 10100 10010",
  "S": "01110 10000 01100 00010 11100", "T": "11111 00100 00100 00100 00100",
  "U": "10010 10010 10010 10010 01100", "V": "10001 10001 10001 01010 00100",
  "W": "10001 10001 10101 11011 10001", "X": "10010 10010 01100 10010 10010",
  "Y": "10001 01010 00100 00100 00100", "Z": "11110 00100 01000 10000 11110",
  " ": "00000 00000 00000 00000 00000", "-": "00000 00000 11110 00000 00000",
  "+": "00000 00100 01110 00100 00000", ".": "00000 00000 00000 00000 00100",
  "?": "11100 00010 01100 00000 01000", "!": "01000 01000 01000 00000 01000",
  ":": "00000 01000 00000 01000 00000", "=": "00000 11110 00000 11110 00000",
  "%": "10001 00010 00100 01000 10001", "/": "00001 00010 00100 01000 10000",
  "<": "00010 00100 01000 00100 00010", ">": "01000 00100 00010 00100 01000"
};
const UNKNOWN = "11111 10001 10101 10001 11111";

export function glyph(ch) {
  return (FONT[String(ch).toUpperCase()] || UNKNOWN).replace(/ /g, "");
}

/* The icons children reach for most. The rest of the MakeCode set follows
   the same shape, five rows of five. */
export const ICONS = {
  Heart:      "01010 11111 11111 01110 00100",
  SmallHeart: "00000 01010 01110 00100 00000",
  Happy:      "00000 01010 00000 10001 01110",
  Sad:        "00000 01010 00000 01110 10001",
  Yes:        "00000 00001 00010 10100 01000",
  No:         "10001 01010 00100 01010 10001",
  Asleep:     "00000 11011 00000 01110 00000",
  Surprised:  "01010 00000 00100 01010 00100",
  Angry:      "10001 01010 11111 11011 10001",
  Confused:   "01010 00000 01110 10001 01010",
  Square:     "11111 10001 10001 10001 11111",
  Diamond:    "00100 01010 10001 01010 00100",
  Triangle:   "00000 00100 01010 11111 00000",
  Chessboard: "01010 10101 01010 10101 01010",
  Duck:       "01100 11100 01111 01110 00000",
  House:      "00100 01110 11111 01110 01010",
  Target:     "00100 01110 11011 01110 00100",
  Umbrella:   "01110 11111 00100 10100 01100",
  Skull:      "01110 10101 11111 01110 01110",
  Ghost:      "11111 10101 11111 11111 10101",
  Rollerskate:"00011 00011 11111 11111 01010",
  Sword:      "00100 00100 00100 01110 00100",
  Scissors:   "11011 11011 01110 11011 11011",
  TShirt:     "11011 11111 01110 01110 01110",
  ArrowNorth: "00100 01110 10101 00100 00100",
  ArrowSouth: "00100 00100 10101 01110 00100",
  ArrowEast:  "00100 00010 11111 00010 00100",
  ArrowWest:  "00100 01000 11111 01000 00100"
};

/* A screen is 25 brightnesses and nothing else. Everything that writes to
   it goes through here, so there is one place that knows what "on" means. */
export function createScreen() {
  let cells = new Array(CELLS).fill(0);

  const inRange = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  function setPattern(bits, bright) {
    const b = bright == null ? 255 : bright;
    for (let i = 0; i < CELLS; i++) cells[i] = bits[i] === "1" ? b : 0;
  }

  return {
    cells: () => cells.slice(),
    clear() { cells = new Array(CELLS).fill(0); },
    plot(x, y, bright) { if (inRange(x, y)) cells[y * W + x] = bright == null ? 255 : bright; },
    unplot(x, y) { if (inRange(x, y)) cells[y * W + x] = 0; },
    toggle(x, y) { if (inRange(x, y)) cells[y * W + x] = cells[y * W + x] ? 0 : 255; },
    point: (x, y) => inRange(x, y) && cells[y * W + x] > 0,
    brightnessAt: (x, y) => (inRange(x, y) ? cells[y * W + x] : 0),
    pattern: setPattern,
    glyph(ch) { setPattern(glyph(ch)); },
    icon(name) { const i = ICONS[name]; if (i) setPattern(i.replace(/ /g, "")); },

    /* "show leds" in a block is a picture typed as dots and hashes. */
    leds(text) {
      const bits = String(text).replace(/[^#.]/g, "").replace(/#/g, "1").replace(/\./g, "0");
      setPattern(bits.padEnd(CELLS, "0").slice(0, CELLS));
    },

    /* A bar graph is the one block that draws itself, bottom row first. */
    bar(value, high) {
      const top = high > 0 ? high : 1;
      const n = Math.max(0, Math.min(25, Math.round(25 * Math.abs(value) / top)));
      cells = new Array(CELLS).fill(0);
      for (let k = 0; k < n; k++) {
        const col = k % 5, row = 4 - Math.floor(k / 5);
        cells[row * W + col] = 255;
      }
    }
  };
}

/* One column of a whole message, five bits top to bottom, with a blank
   column between letters. This is what scrolling walks along. */
export function columnsOf(text) {
  const cols = [];
  const chars = String(text).split("");
  chars.forEach((ch, n) => {
    const g = glyph(ch);
    for (let c = 0; c < W; c++) {
      let bits = "";
      for (let r = 0; r < H; r++) bits += g[r * W + c];
      cols.push(bits);
    }
    if (n < chars.length - 1) cols.push("00000");
  });
  return cols;
}

/* What the screen shows at step `offset` of scrolling `text`. The caller
   does the waiting, because only it knows about the clock - which is how
   the same scroll works in a test with no clock at all. */
export function frameAt(cols, offset) {
  const out = new Array(CELLS).fill("0");
  for (let c = 0; c < W; c++) {
    const col = cols[offset + c];
    if (!col) continue;
    for (let r = 0; r < H; r++) out[r * W + c] = col[r];
  }
  return out.join("");
}

export const scrollSteps = cols => cols.length + 5;
