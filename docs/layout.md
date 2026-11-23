# Layout stability

What holds a picture still when the model changes, and what the page does with a view too
crowded to read. This is stage 7 of `plan.md`. It builds on `diagrams.md` and `hard-cases.md`.

## What it is

Nobody can drag a box, so the layout alone decides whether a reader finds again what they
knew. This stage adds no concept and nothing to the format. It is a gate: nothing is built on
a layout that does not hold.

Before it, one more connection redrew a container view. About half of the pairs of boxes kept
their order, where two boxes thrown down at random keep theirs one time in four. The new name
of a connection moved boxes.

## What holds

- **The same model gives the same picture**, on a second run, with the files read in another
  order, in a new process.
- **A rename moves nothing.** A new name for a person, a system, an app, a store, a piece of
  infrastructure, a connection or a technology changes the words where the name stands. Every
  box, the boundary, the run of every line and the size of the picture stay as they were. So
  does a new description.
- **One edit keeps the order.** An app, a store or a connection added or taken out, or an app
  moved to another system: the boxes that stand in one column before and after stand in the
  same order, top to bottom. Most pairs of boxes keep their order both across and down.
- **Not the place.** A column that gains a box pushes down what stands under it, and the
  columns to its right may step along. After one edit two boxes in three stand more than half
  a box from where they stood.
- **Not when a hub goes.** When the box that most others hang on is taken out or moved, the
  picture is rebuilt.

## How the order is found

The engine walks through the view, and the order of each column is the order of the walk.

- The walk starts at the boxes that nothing acts on: people first, then the others, each group
  in order of id.
- From each box in turn it takes the boxes joined to it by an arrow, either way, in order of
  id, that it has not yet taken.
- A box in a circle that no start reaches is a start of its own.
- The boundary has the turn of the first box inside it.

ELK still picks the column of each box, places the boxes and routes the lines. It no longer
picks the order within a column: before, it tried twenty orders and kept the one with the
fewest crossings, and one more arrow made another order win.

**Nothing is stored.** The turn of each box is worked out from the view each time, so a
picture is made from its model alone, and never from the picture before it.

**It costs crossings.** On the trial models the main views together have a third more. A view
with one hub and many spokes pays most.

## The room for an arrow's words

A box has one size, so its words cannot move anything. An arrow's label had the size of its
words, and ELK made room for it. Now the room does not follow the words.

- Every label has the full width a label may have, 140 px.
- The name of a single connection has room for its three lines, however short it is.
- An arrow for several connections has the lines their number gives, as before.
- The route, the condition, who opened the channel and the technology each take their line
  only when the arrow has them.
- The words stand in the middle of the room. The label of a picture is where the words are,
  not the room.

What still changes the room is an edit to the model and not a rename: a connection's first
`via`, `only` or technology; a second connection between the same two boxes; the words of a
condition that grow from one line to two.

## The long column of a context view

A context view of 16 boxes or more has its long column of neighbours split in two, so that it
fits the window. Stage 5 built this and the stage leaves it. Two things about it do not hold:

- **Crossing the size redraws the view.** One neighbour fewer at 16 boxes moves 93 to 100 %
  of the boxes, and 68 to 73 % of the pairs keep their order.
- **In a split column, a neighbour added or taken out sends the boxes after it to the other
  side.** Their order down the column holds.

Splitting at every size was decided, built and measured, and then withdrawn. With each
neighbour taken out in turn, a context view of 4 to 7 boxes kept 66 % of its order where it
keeps 81 %, and one of 8 to 15 boxes 81 % where it keeps 90 %. A split whose sides do not
depend on a box's place in its column would mend both faults. It is not built.

## A crowded view

A view of **more than 40 boxes** is crowded. The boxes the page draws are counted: in a
context view the system itself and each box around it; in a container view each box inside
the boundary and each box outside, and not the boundary.

- **`seefore check` warns**, at the file of the view's system, with the code `view-crowded`:
  "The container view of Sentry has 101 boxes. A view of more than 40 cannot be read as one
  picture: the page draws it as a map. Until focused views exist, read it by pointing at a
  box." It is a warning, so the exit code does not change.
- **The page draws it** and says so under the counts: "A crowded view: more than 40 boxes. It
  opens as a map, with no words. Point at a box or a line to read it here; click it to keep it
  lit." It opens fitted to its room, as every view does.
- **A view under the limit that opens too small** keeps its note from `diagrams.md`, with the
  zoom from which names can be read.
- **The warning does not ask for fewer boxes.** A system with thirteen topics has thirteen
  boxes. The remedy is a picture of one box with its neighbours, and that is stage 9.
- **A crowded view holds as any other does.** The limit excuses it from nothing above.

On the trial models the views fall in two groups with nothing between: 122 of 32 boxes or
fewer, and 5 of 56 to 101. Any limit from 33 to 55 names the same five.

## Zoomed out

Most of what stages 6a and 6b draw stands in views that open too small for words. The words
now come to the reader, at reading size, outside the scaled picture.

- **The reading line.** Whatever the reader points at, moves the keyboard's focus to, or has
  chosen says its words on one line under the counts, at any zoom.
  - A box: its name, its kind line and its `only`: `Relay [App: service · Rust]`.
  - An arrow: its two ends, the names of its connections, its route with the brackets, its
    condition, who opened the channel, and its technology: `Fan app → Shop API: Calls the
    backend to buy and to download tickets · via Content delivery network, Load balancer ·
    [HTTPS, JSON]`.
  - A thing that is passed through, from the list under the legend: its name and how many of
    the view's connections pass through it.
  - A line of the legend: what it lights.
- **The light keeps its strength.** Below the zoom at which names are drawn, a lit line keeps
  its width on the screen, a lit box is filled with a tint of its colour, and what is not lit
  fades further.
- **The legend lights what it explains.** Pointing at a line of the legend, or moving the
  focus to it, lights every box and arrow that line is about: every route, every ring, every
  `only`, every store that an app keeps.
- **The chosen box stays where it is on the screen** when a file changes and the picture is
  laid out again. The page moves the picture once, so that the reader keeps the place.
- **The dashed outline for a thing that has `only` is taken out.** Stage 6b built it and
  switched it off. It showed only from a third of full size, where words do not, and the
  legend's light now shows every condition at any zoom.

No mark is added, and the zooms at which detail comes and goes are those of stage 5.

## The commands

- **`seefore check`** gives the warning above. Nothing about how it is called changes.
- **`seefore list`**, **`seefore uses`** and how **`seefore --server`** is called: no change.
- **`node scripts/steady.mjs <directory> [<directory> ...]`** tries the layout on source
  directories, for the trial of a stage. It is not part of the installed command. For each
  directory it lays out every view twice, and then makes edits to a copy of the model in
  memory and compares the two pictures of the context view and the container view of the
  system with the largest container view:
  - a new name for every box, every thing on a route, connections and technologies, and a
    new description;
  - an app added, an app taken out, a connection added, an app moved to another system and a
    new system outside, each at boxes spread from the middle of the picture to its edge;
  - five such edits made together.

  It prints one row for each directory and one for all: the boxes that moved, the pairs that
  kept their order, the same within a column, the crossings, the area and the slowest layout.
  It ends with exit code 1 when a number of the next section is missed.

## What must be true

The numbers are this project's own, and each stands a little under what was measured when the
stage was built. They guard against a later loss. No study says that they are enough: the
owner's reading of the pictures decides that.

| # | What is measured | It passes at |
| --- | --- | --- |
| 1 | The same model, laid out again and in another order | No view differs |
| 2 | A new name or a new description | Nothing moves in any try |
| 3 | One edit, container view: pairs in one column that keep their order | 95 % over all models; 75 % in the worst edit |
| 4 | One edit, container view: pairs that keep their order both ways | 80 % over all models; 65 % in each model |
| 5 | One edit, context view: pairs that keep their order both ways | 80 % over all models |
| 6 | The slowest layout | 2 seconds |
| 7 | A view of more than 40 boxes | Each is reported |

- **As built, number 3 is missed in its worst edit.** On one trial view of 26 boxes, taking
  out or moving an app that takes four other boxes out of the view with it keeps 73 % of the
  order within a column, where 75 % is asked. Over all models the number stands at 98 %. The
  owner decides what becomes of it: `plan.md`, "Open questions".
- **A box has moved** when its centre is more than half a box from where it stood, after the
  shift that all boxes share is taken away. The script prints the share. It has no pass
  number: no layout of this kind holds the place.
- **Crossings and area** are printed and have no pass number of their own. A stage that
  changes the layout puts its table beside the last one in its trial note and says what rose.
- **Every later stage that changes a view or the layout runs the script** on the trial models.
- **ELK stays pinned.** A new version is taken only with the script's table beside it.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| A steady order, or the fewest crossings | A steady order, at a third more crossings (the owner) |
| What "recognisably in place" means | The order, not the place. Nothing found holds the place without five times the crossings |
| How the order is held | The engine's own walk, which ELK keeps in every column. ELK's model order crashes inside a boundary in the pinned version |
| What counts as a rename | Every name: of a box, a thing on a route, a connection and a technology |
| The split column of a context view | As stage 5 built it, from 16 boxes. Splitting at every size was decided and then withdrawn: on the trial models the small context views held worse |
| A crowded view | Drawn as a map with a note, and reported. Not replaced by a list |
| The limit | More than 40 boxes, counted on the view, so that the check needs no layout |
| Layout hints | None. The plan listed direction, grouping and order. Nothing measured asks for one, and a hint belongs on the view record of stage 9 |
| The dashed outline for `only` | Taken out |
| Callers on the left and callees on the right in a context view | Not now. It is the first thing to try if a context view does not hold |

## Names this stage adds

One problem code, `view-crowded`. One limit, 40 boxes. One script for the trial,
`scripts/steady.mjs`. Nothing in the format, no command and no option. Taken out: the dashed
outline.

## Skips

Of "Every stage ends the same way": part 5. For part 3 the `model` skill learns one thing:
what to tell the person when a change takes a view over the limit.

## Leaves out

Stored coordinates, places set by hand, and a promise that nothing moves. Layout hints. A
picture of one box with its neighbours, and splitting a view: stage 9. A mark for what
changed since the last picture: stages 14 and 16. A limit that looks at arrows or at the size
of the window.

## Against the research

Checked against `research/synthesis.md` and the reports on diagram craft behind stage 5.

Follows it:

- **Stable placement is the first pain it names** (synthesis, 1.2). The stage holds the order.
- **A fresh layout from the model on each change**, and no half-kept places. Nothing is
  stored, and a layout between the two ends measured worse than either.
- **Draw, count and warn.** No tool refuses to draw a view. The limit is taken from real dense
  views, and the split is left to focused views.
- **Detail on demand**, and following one thing by its light.
- **A limit that does not ask for a smaller model**, and a report before anything blocks.

Departs from it, with the reason:

- **"Model order as a tie-breaker only; developers prefer fewer crossings."** As a tie-breaker
  it held nothing on the trial models, and inside a boundary it crashes. So the order is
  imposed, and crossings are given up for it. The research ranks crossings first among what
  makes a picture hard to read.
- **No layout hints**, which two of the tools offer.
- **No mark for what changed after a reload.** Left to stages 14 and 16, which know what
  changed.

Risks it takes on:

- **More crossings where lines are followed.** The small views pay most, and there a reader
  does follow lines.
- **One rule still looks at the size of a view:** the split of a context view's long column
  from 16 boxes. The research warns that such a rule flips on a small edit, and it does.
- **The pass numbers are the project's own.** The research has none, and no measure of
  "recognisably".
- **ELK's setting for keeping an order** is less trodden than its defaults.
- **Nobody but a program has judged these pictures.** The trial with the owner is still to do.
