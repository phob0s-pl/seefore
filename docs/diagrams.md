# Automatic diagrams

The viewer: a page that draws the model, with nobody placing a box. This is stage 5 of
`plan.md`. It builds on `modelling.md`.

## What it is

`seefore --server` reads a source directory and serves one page on this machine. The page
draws the views of each system, lists the model and the problems of the check, and follows the
files as they change. It never writes.

No position is stored and nothing can be dragged. The engine works out every place: where each
box stands, how each arrow runs, where each label sits and how its words break. The page draws
what it is given.

## The views

Every system has a context view. A system that has an app or a store also has a container
view, and since stage 6b so has one that holds a piece of infrastructure with a box of its
own (`hard-cases.md`). A view is worked out from the model and is not stored.

| View | What it holds |
| --- | --- |
| Context | The system as one box, and each person and other system that has a connection with it or with anything inside it |
| Containers | The system's apps and stores inside its boundary, and outside it each person and other system that has a connection with one of them or with the system itself |

- **Where an end is drawn.** In a context view, at the person or the system it belongs to. In
  a container view: a component at its app; a part of another system at that system; the
  system in scope itself at its boundary.
- **One arrow for each pair of boxes and direction.** It stands for every connection between
  the two. Its label is their names, one to a line: first a connection written between the two
  boxes themselves, then the others by id. A connection with no name reads "Unnamed
  connection". When the lines run out the last reads "+ n more". The technology stands under
  the names only when every connection of the arrow names the same. A click lists each
  connection with its own two ends, its name, its technology and its file.
- **Not drawn as an arrow:**
  - a connection between two boxes that both stand outside. It is in the listing;
  - a connection from a record to itself, one copy acting on another. The box carries a mark
    with their number, and its panel lists them;
  - a connection between two parts that are drawn as one box. The panel of the box lists it.
- A box with no arrow stands where the layout puts it.
- **A record whose file has an error** is not drawn, and nothing inside it is. A connection
  with one end in the view and the other in such a record is counted on the view. When the
  marker cannot be read there are no views, and the page shows that problem in their place.

## The picture

- **A box** has one size for every kind: the name in bold, a line such as
  `[App: service · Go]`, and the first sentence of the description. The whole text is in the
  panel.
- **The kind** is told by that line and by the shape: a person, a system, an app and a store
  each have their own. Colour comes third, and never alone. The system in scope has a thicker
  line. Ours and somebody else's look alike until stage 6a decides on a stored mark.
- **The boundary** is a dashed line with a light tint and `Name [System]` at its top left.
- **An arrow** runs in right angles, from the one that acts, with its label on its own line.
  One that stands for several connections is drawn thicker. A box whose copies act on one
  another carries the mark ↻ with the number of those connections.
- **The title** names the type and the scope: "Container view: Shop". **The legend** shows each
  kind of box, line and mark that this view draws, and no other. Both stand beside the
  picture, not over it.
- Boxes are outlines, in a light and a dark theme. Text and lines meet the contrast rule of
  WCAG 2.2, also while the rest is faded.

## The layout

The engine lays out each view with ELK: layered, left to right, the boundary and its inside in
one run, each label placed by ELK. Since stage 7 the order of each column is the engine's
own and a label's room does not follow its words: `layout.md` says what then holds when the
model changes.

- **The same model gives the same picture.** What goes in is sorted by id, the seed is fixed
  and the version of ELK is pinned.
- **The engine breaks every text into lines** and cuts what does not fit with an ellipsis. It
  measures for one family of fonts, Arial and those made to its measure, and the page draws
  with that family and clips at the edge of the box. The whole text stays in the panel and in
  the name a screen reader gets.
- **One layout runs at a time, apart from the server, for at most five seconds.** A view whose
  layout fails says so in place of its picture; the other views still draw.
- A window that changes size, a hover or a click never lays a view out again.

## The page

- **The sidebar** lists the systems that have parts, each with its views; then the other
  systems, folded; then "Model"; then "Problems" with their number.
- **Moving.** The page opens with the picture fitted to the room it has, never larger than
  full size. "Fit diagram", "Fit selection" and the zoom are buttons. A hover, or the keyboard's
  focus, lights a box, its arrows and the boxes at their other ends, and fades the rest. A
  click, or Enter, keeps that and opens the panel. Escape clears.
- **The panel** shows a record: its name, kind, technologies, owner and where the owner comes
  from, its whole description and its file.
- **Detail follows the zoom.** Zoomed out, the description goes first, then the kind line and
  the words on arrows, then the names. A fitted picture too small to read says so: how many
  boxes and arrows it has, and from which zoom names can be read. Since stage 7 whatever is
  pointed at says its words on a line under the counts at any zoom, a line of the legend
  lights what it explains, and a view of more than 40 boxes says that it is a map
  (`layout.md`).
- **Model** is the listing of `seefore list`, in the same order, from the same code. A click on
  a record opens the same panel. **Problems** lists what the check found, each with its file,
  line and column.
- **Following the files.** When a file changes the page takes the new model in place. It keeps
  the zoom and the selection, and fits again only when the reader has not moved. Since stage
  7 a chosen box stays where it is on the screen. A selection that is gone is cleared; when
  the view itself is gone the page opens the first one.
- The address reopens the view it names.

## The command

```
seefore --server [--workdir=<directory>] [--port=<number>] [--no-open]
```

- It listens on `127.0.0.1` only and answers no request made under another host's name. It
  serves its own page, and the model and the pictures to read. It takes no path from a request
  to the disk.
- Without `--port` it takes 4173, or the next free one. A `--port` that is taken ends with
  exit code 2. Once it listens it prints the address, and opens it in the browser unless
  `--no-open` is given or the output is not a terminal.
- It watches the source directory it found when it started. If that directory goes, the page
  says so and waits for it to come back; it never moves to another one.
- A directory that cannot be found ends with exit code 2, as for `seefore check`. So does a
  command whose own page or layout file is missing: it says to install seefore again.
- `node scripts/shoot.mjs` takes a picture of every view of a directory in a headless browser,
  for the trial of a stage. It is not part of the installed command.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| What draws and what lays out | React Flow draws. ELK lays out, in the engine, so that a picture can be tested without a browser (the owner) |
| Which systems get views | A context view for every system; a container view where there is something inside |
| Direction | Left to right for every view. A choice for each view would flip on a small edit |
| Arrows | One for each pair of boxes and direction |
| Labels | Placed by ELK. Placed after the layout, a line ran through half of them |
| The font | Arial and the fonts made to its measure, so that the engine can measure text |
| A view too large to read | Drawn, with its counts and a note. The limit is stage 7's to set: it is more than 40 boxes (`layout.md`) |
| The sidebar | The views by system, the model's listing, and the problems (the owner) |
| ELK in the package | A dependency at a pinned version, under its licence EPL-2.0. Not copied into the command's file |

## Names this stage adds

One way to run the command, `seefore --server`, with two options, `--port` and `--no-open`.
Two kinds of view, context and containers. Nothing in the format. Four libraries: ELK
(`elkjs`), React (`react`, `react-dom`) and React Flow (`@xyflow/react`).

## Skips

Of "Every stage ends the same way": part 3, since nothing new can be written, and part 5.

## Leaves out

Editing, dragging, stored positions and styling controls. Search, a link to a box and
drill-down: stage 25. Component views, a landscape and "this box and its neighbours" as a view:
stage 9. The limit for a crowded view, and what holds a picture still when the model changes:
stage 7. What a connection passes through, and a mark for somebody else's system: stage 6a.
Export of a picture.

## Against the research

Checked against `research/synthesis.md` and against `research/diagrams/recommendations.md`,
which checks seven reports on diagram craft and on six tools by measuring on the trial models.

Follows it:

- **Automatic layout that copes with nesting** (synthesis, layout). The boundary and its inside
  are one run of ELK. Dagre, which the synthesis warns of, is not used.
- **A typed model apart from its views** (1.1). A view holds nothing the model does not.
- **A title, a key and labelled arrows on every diagram**, and **never colour alone**: the
  checklist of C4's author and the accessibility guidelines, both in the practices report.
- **Following one box by eye**: hover and click light its arrows and neighbours, as four of the
  six tools do.
- **A broken file is reported and the rest still loads** (the plan, stage 3).

Departs from it, with the reason:

- **Left to right, not top-down**, which the studies and two tools favour. On the trial models
  the two fit within 17 % of each other, and left to right sent no arrow through a boundary's
  title.
- **One arrow for many connections**, where C4's notation draws each. Drawn each, the trial
  models have up to 4.4 times the crossings.
- **No last good picture.** Five tools keep the last picture when the source breaks. Here the
  rest of the model draws, as the plan asks.

Risks it takes on:

- **The largest views cannot be read when fitted.** A container view of 59 to 88 boxes shows
  names 2 to 4 pixels high on a screen of 1600 by 1000, whatever the settings. Until stages 7
  and 9 the answer is the zoom, the light on one box, and a note.
- **Text is measured for one family of fonts.** With another font, or with signs outside the
  table, words may be cut early or clipped.
- **Nobody but a program has judged these pictures.** The trial with the owner is still to do.
