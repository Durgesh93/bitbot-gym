/* Where saved rooms sit between lessons.

   A project is a FILE first - that is the one that survives a new laptop,
   a cleared browser and a school that reimages the machines over the
   holidays, and it is the one that can be emailed to another trainer.
   This is the shelf beside it: the same projects, kept in this browser,
   so that reopening last week's room is one press rather than a trip
   through a file picker.

   Everything in here is wrapped, because browser storage is not a
   promise. It throws in a private window, it is empty when site data has
   been cleared, and it refuses writes once it is full. None of those are
   reasons for the gym to fall over, so each one comes back as "it did not
   save" and the file route is still there. */

const KEY = "bitbot-gym:rooms";

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const got = JSON.parse(raw);
    return got && typeof got === "object" ? got : {};
  } catch (e) { return {}; }
}

function write(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
  catch (e) { return false; }                       // full, or a private window
}

export function available() {
  try { localStorage.setItem(KEY + ":test", "1"); localStorage.removeItem(KEY + ":test"); return true; }
  catch (e) { return false; }
}

/* Newest first, because the one you want is nearly always the last one
   you saved. */
export function list() {
  const all = read();
  return Object.keys(all)
    .map(name => ({ name, saved: all[name] && all[name].saved }))
    .sort((a, b) => String(b.saved || "").localeCompare(String(a.saved || "")));
}

export function get(name) {
  const all = read();
  return all[name] || null;
}

export function put(project) {
  const all = read();
  all[project.name] = project;
  return write(all);
}

export function remove(name) {
  const all = read();
  delete all[name];
  return write(all);
}
