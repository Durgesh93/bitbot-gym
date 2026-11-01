# The hand checks

Everything below the UI is covered by `npx vitest run`. The UI is not: there
is no React test renderer in here and adding one would buy jsdom's opinion of
a canvas, which is no opinion at all. So the screen is checked by hand, and
this is the list, written down so it is the same list every time.

Run it against a **built** gym, not the dev server:

```
npx vite build && npx vite preview --port 4173
```

then open `http://localhost:4173/gym.html`.

Each check says what to do, what should happen, and - where there is one -
the bug it is standing guard over. A check with a bug named under it is there
because that bug shipped once.

---

## 1. The Build tool does not follow you into the Room menu

1. **Build → Add object** (the chip reads `add chair`).
2. **Room → Add a lamp.**
3. Click the new lamp and drag it.

The chip goes back to `drag` the moment the lamp is added, and the lamp moves
with the pointer.

> **Guards:** the lamp's own hint says "stands in the room - drag it", and it
> was a lie whenever Build had been used first. The pointer was still in
> "add chair", so the obvious next click - straight at the new lamp - put a
> chair on top of it and the room went dark.

## 2. Two things from the Room menu do not land on each other

1. **Room → Add a lamp**, then **Room → Add a speaker**.
2. Look at the middle of the room.

Two separate things, a clear gap between them. The lamp is still a lamp you
can see and the speaker is a box beside it.

> **Guards:** everything the Room menu adds is aimed at the exact middle, so
> the second arrival used to swallow the first.

## 3. A lamp over a box can still be picked up, and so can the box

With a speaker and a lamp close together:

1. Right-click the **lamp's dot** → the lamp's menu (`switch it off`).
2. Right-click the **corner of the box** → the speaker's menu.

> **Guards:** both directions have been broken. With furniture tested first a
> lamp inside a box could not be clicked at all; with lamps tested first on a
> generous radius the box underneath could not be. The near pass is now the
> drawn glyph only, and the generous pass comes after the furniture.

## 4. A speaker can be switched on where it stands

Right-click a speaker → **Stop the music** / **Play some music**, and the
microphone reading on the cards follows it.

> **Guards:** a lamp could be switched off from the room and a speaker could
> not - you had to know it was also listed in the Room menu, under a number.

## 5. The microphone has somewhere to go

With one speaker playing, drag a robot from the far corner to beside it.
**SOUND** should climb somewhere around 70 → 230 and the bar should never
sit pinned at the end.

> **Guards:** the reading pinning at 255 everywhere, which teaches nothing.
> `loud` now means "what a microphone reads at `reach`, out in the open",
> and the room adds to it rather than being fudged into it.

## 6. An empty room is silent

**Build → Empty room** with a speaker playing. **SOUND** falls to 0.

> **Guards:** the reverberant field was kept under a key that matched "no
> sources at all", so taking the last speaker out left the room ringing.

## 7. Sound comes out of the middle of the speaker

Put a robot the same distance to the left and to the right of a speaker
standing in the middle of the room. The two readings should agree exactly.

> **Guards:** furniture is measured from a corner, so the source sat in the
> cabinet's corner; and the cabinet screened its own driver, which put a
> cliff down the middle of the room. Two robots a hand's breadth apart read
> 113 and 255. The wave field has its own version of the same fault: 60mm
> cells do not divide a 2000mm room, and taking 33 of them modelled a room
> 20mm too small, which tilted the whole field by 4%.

## 8. A menu taller than the window can be reached

Make the window about 400 px tall. **Robots →** the panel stops at the bottom
of the glass and scrolls; grip, battery and the light-sensor switch are all
reachable.

> **Guards:** only the width was clamped. On a classroom laptop the bottom
> third of that menu was off the screen with no way to get at it.

## 9. Renaming a robot takes the whole name

Right-click a robot, type a full name, press Enter. The whole name lands on
the card and on the robot, and the menu closes.

> **Guards:** the ref callback re-focused and re-selected on every render, and
> the card re-renders about sixty times a second, so only the first character
> survived. Enter also used to leave the menu sitting open over the robot,
> which reads as "nothing happened".

## 10. A speaker switched on does not stall the gym

Switch a speaker on, then drag a robot about. The room should carry on
smoothly; the solve behind the reading happens once, when the speaker
changes, not while the robot moves.

Then press **Play** on a program that beeps and let the robot drive. A
beeping robot IS a moving sound source, and that one does cost a fresh
solve - about a tenth of a second - every 60mm it travels. One beeping
robot is comfortable. If several beep while driving at once and the gym
goes gluey, that is this, and it is the known cost of the wave field.

> **Guards:** the sound field is now a wave simulation of the whole room.
> It is cached per SOURCE, so a listener moving is free and a source
> moving is not.

## 11. Eight robots are all readable at once

Add six Bit:Bots and two micro:bits, then **View → Light sensors** and
**Sonar**.

They stand in two tidy rows. Every name can be read, every row of sensor
readings can be read, nothing is cut off at the edge of the room and
nothing sits on top of the legend along the bottom.

> **Guards:** three things that only show up together. Robots ringed
> outwards from one start spot into a corner huddle; each robot's caption
> stack was laid out knowing only about its own rows; and the names were a
> third pass that knew about neither. At eight robots it was one grey
> smear. They now share a single list of what is already on the glass.

## 12. A cupboard barely hides a robot, and that is correct

Park a robot behind the cupboard with a speaker playing on the far side.
The reading should drop by perhaps a fifth - noticeable, not dramatic.

> **Guards:** the temptation to "fix" this. The old field put Maekawa's
> barrier formula in the way, which is the sum for a screen running the
> whole width of the room, and took about 19 dB off. A cupboard is 300mm
> wide and this sound is around 600mm from crest to crest, so most of it
> walks round the sides. About a decibel is the honest answer, and the
> wave simulation produces it without being told to.

## 13. The magnet reading on the card is a cliff, not a slope

**Room → Add a magnet**, then walk a robot at it in steps. **MAGNET**
should sit at about **50 µT** across most of the room and then shoot into
the hundreds and past a thousand in the last hand's breadth. Measured:
50.3, 49.8, 47.5, 73.1, 1378.

Two things that look wrong and are not:

- the reading **dips a little below 50.5** on the way in. A bar magnet's
  field alongside it points the OTHER WAY to the way it points off its
  ends, so from the side it is taking a bite out of the Earth's field
  before it starts adding to it.
- the bar on the card is **logarithmic**, 10 µT to 4000. A linear bar
  would be a flat line that suddenly hits the end, which is the truth and
  is useless to look at.

> **Guards:** the temptation to make the fall-off gentler so it "shows
> up better". It is an inverse CUBE - twice as far away is eight times
> weaker - and that is the thing worth learning.

## 14. Turn it round is a HALF turn

Right-click a magnet → **Turn it round**. The bar stays lying the same way
across the room and the two ends swap: `S|N` becomes `N|S`. With a robot
parked beside it the µT reading changes (299.0 → 278.7 in one spot, the
Earth's field adding along the bar one way and taking away the other).

> **Guards:** it was a QUARTER turn, copied from the furniture item above
> it in the same menu. A table has four sides worth turning between; a
> magnet has two ends. The quarter turn left the magnet lying across the
> room with its field barely changed, which reads as "the menu did
> nothing".

## 15. A magnet lands beside the lamp, not on it

**Room → Add a magnet** twice over, in a room that already has a floor
lamp in the middle. Three separate things with gaps between them, all
three right-clickable.

But drop a magnet **on the table** with the pointer and it stays there:
a magnet works straight through a table top, and hiding one underneath is
the whole trick.

> **Guards:** check 2's bug, which magnets were not covered by - the
> magnet arrived at the exact middle of the room and sat on top of the
> floor lamp.

## 16. A lesson's .hex opens, shows its blocks and runs

Press **Code** on a robot's card, wait for MakeCode, then **Open a .hex**
and pick any file from a week folder - say `W38L02P3.Breathing Heart.hex`.

Three things, all of them:

1. the real blocks appear, at the big size, with no MakeCode simulator in
   the corner;
2. the bar says `opened "W38L02P3.Breathing Heart" - the blocks are here
   and it is on Bit:Bot 1, press Play`;
3. go back to the room, press **Play**, and it runs - the heart breathes
   and the log fills with `screen brightness 190, 185, 180`.

Dragging the file anywhere onto the editor sheet does the same thing, and
the sheet outlines itself while the file is over it.

A file that is not a MakeCode .hex, or one built without its source,
says so in the bar and in the log rather than failing quietly.

> **Guards:** the editor is in controller mode, which hides MakeCode's own
> home screen and its Import button, so this is the ONLY way into the gym
> for the course's own files. Without it a child who missed last week
> cannot be shown what the class built. Also guards the tidy-up: importing
> a project resets the editor, which brings MakeCode's little simulator
> back and shrinks the blocks, undoing both of the things done at startup.

## 17. The self test, watched

The one check that touches everything at once. **Code** on a robot's card,
**Open a .hex**, pick `checks/Gym Self Test.hex`, go back to the room and
press **Play**. It takes about half a minute. Watch for all of it:

| what you should see | what it proves |
|---|---|
| `GO` scrolls, then a heart | the screen, strings and icons |
| **SOUND** jumps to 255 for a moment | the buzzer, and a board hearing itself |
| **ARMS** go red, then green, then out | the FireLeds |
| the robot drives, stops, spins right, stops | both wheels, and braking |
| six numbers scroll past | sonar, the Bit:Bot light sensor, a line sensor, the micro:bit light sensor, the microphone, the compass |
| a ring spreads out from the robot | the radio |
| a tick | it got to the end |

Then the four it cannot do for itself. Press **A** (shows the light
level), **B** (reverses a step), **logo** (shows the heading), **shake**
(a surprised face).

**The log must start at `show "GO"`.** Anything above that line is the gym
saying it did not recognise something.

> **Guards:** this is how `TouchButtonEvent` was found missing from
> ENUMS. The logo block worked - the handler ignores the event argument -
> but every program containing one opened with a complaint across the top
> of the log, which reads as a broken block. Neither existing test caught
> it: `all-blocks.test.js` calls blocks straight off the object, and no
> sample program used a micro:bit EVENT enum.
>
> `test/app/selftest.test.js` now runs this same hex headlessly on every
> `npm test` - it reads the source out OF the hex, so the two cannot
> drift - and insists it ends clean. What it cannot check is the half in
> the table above: whether the lights really went red, whether the robot
> really moved. That is why this check is here as well.

**If a press does nothing, press it again** while the screen is idle. A
scrolling number blocks the event queue, which is exactly what a real
micro:bit does.

## 18. The rest of the sweep

Quick, but worth doing after anything that touches the shell:

- **Stop all / Reset all** appear once there is a robot, and the logs clear.
- **The theme button** in the header turns the gym dark and light, and the
  choice survives a reload.
- **View → Light sensors / Sonar** draw their overlays and the legend along
  the bottom matches what is drawn. **Plain** turns them off.
- **Draw line**, then drive over it: the card's **LINE** row lights up.
- **Add object / Remove object** put a thing down where you pointed and take
  it away again.
- The floor is one speckled sheet with no tile joints and no grid of lines
  on it; a child who sees squares starts counting them.
- **Room → Add a magnet**, then **Take it out of the room**: the
  **MAGNET** row falls back to about 50 µT, the Earth on its own.
- There is no clock readout in the header and no room picker in the Room
  menu: one room, and the speed control is under **Clock**.

## 19. Saving a room and opening it again

This is the one a lesson leans on: if it half works, next week's class
starts with a room that is nearly right, which is worse than an empty one.

1. Build a room worth keeping: a Bit:Bot and a micro:bit, a table, a
   magnet, a line on the floor, and a program loaded onto at least one
   board. Note what the cards read - **LIGHT**, **SOUND**, **MAGNET**.
2. **Rooms → Save this room to a file**, give it a name. A
   `<name>.gym.json` lands in Downloads and the name appears in the
   Rooms menu underneath.
3. **Reload the page.** The room comes back empty, as it should.
4. **Rooms → <name>**. Everything is back: both boards on their spots and
   facing the way they faced, the table, the magnet, the line, the radio
   groups, and **the code still on the board** - press Play and it runs.
5. **The cards read the same three numbers as in step 1.** This is the
   real check. A room that opens with the furniture right but SOUND at 50
   instead of 0 is a different room, and the child's readings will not
   match the lesson.
6. **Save it again without touching anything, and open that.** Nothing
   may creep: a thing that comes back half a box down and to the right
   each time is a room that slowly falls apart over a term. The speaker
   is the one to watch, because it is the one that goes in centred.
7. **Open the same room twice in a row.** Still one of everything - not
   two tables, two lamps and four robots.
8. **Try opening something that is not a saved room** (any other `.json`,
   or a `.hex`). A red strip under the header says so in a sentence a
   teacher can act on, and the room that was already there is left alone.
   The strip waits to be clicked away; the plain grey one that says
   "opened ..." or "saved ..." goes by itself after a few seconds. Check
   both in **dark mode** too - they are the only red thing in the shell.
