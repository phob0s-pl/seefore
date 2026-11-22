# Automatic diagrams

The viewer: a page that draws the model, with nobody placing a box. This is stage 5 of
`plan.md`. It builds on `modelling.md`.

## What it is

`seefore --server` reads a source directory and serves one page on this machine. The page
draws two diagrams for each system, lists the model and the problems of the check, and follows
the files as they change. It never writes.

No position is stored and nothing can be dragged. The engine works out every place: where each
box stands, how each arrow runs, where each label sits. The page only draws what it is given.

## The views

A system is **in scope** when it has an app or a store. When no system has one, every system
is. Each system in scope gets two views, worked out from the model; none is stored.

| View | What it holds |
| --- | --- |
| Context | The system as one box, and each person and other system that has a connection with it or with anything inside it |
| Containers | The system's apps and stores inside its boundary, and outside it each person and other system that has a connection with one of them, or with the system itself |

- **An end is drawn at the box that stands for it.** A component is drawn at its app. A part
  of another system is drawn at that system. A connection that names the system in scope
  itself ends, in its container view, at the boundary.
- **One arrow for each pair of boxes and direction.** It stands for every connection between
  the two. Its label is their names, one to a line; with more than three, two names and
  "+ n more". A click lists them all.
- **Not drawn:** a connection between two boxes outside the system; a connection whose two
  ends are one box. The panel of that box and the listing still show them.
- A box with no arrow stands where the layout puts it.

## The picture

- **A box** has one size for every kind, 240 by 150: the name in bold; a line
  `[App: service · Go]`; the first sentence of the description, in at most four lines. The
  whole text is in the panel.
- **The kind** is told by the text line and by the shape: a person, a system, an app and a
  store each have their own. Colour comes third, and never alone. The system in scope has a
  thicker line. Ours and somebody else's look alike until stage 6 decides on a stored mark.
- **The boundary** is a dashed line with a light tint and `Name [System]` at its top left.
- **An arrow** runs in right angles, from the one that acts. Its label sits on its own line.
- **The title** names the type and the scope: "Container view: Shop". **The legend** is made
  from what this view draws, and shows each kind of box and line that is in it.
- **Outlines and dark text**, in a light and a dark theme. Every colour meets the contrast
  rule of WCAG 2.2: 4.5 to 1 for text and 3 to 1 for lines.

## The layout

The engine lays out each view with ELK: layered, left to right, the boundary and what is in it
in one run, right-angled lines, each label given to ELK at its measured size.

- **The same input gives the same picture.** The input is sorted by id, the seed is fixed, and
  the version of ELK is pinned.
- **Text is measured, not seen.** The engine counts widths from a table for one family of
  fonts, Arial and those made to its measure, and the page draws with that family.
- **A layout runs apart from the server, under a limit of five seconds.** Some settings make
  ELK crash or never end. A view whose layout fails says so in place of its picture, and the
  other views still draw.
- A window that changes size, a hover or a click never lays a view out again.

## The page

- **The sidebar** lists each system in scope with its two views, then "Model", then
  "Problems" with their count when there are any.
- **Moving.** The page opens with the picture fitted, never larger than full size. A hover
  lights a box, its arrows and the boxes at their other ends, and fades the rest. A click
  keeps that and opens the panel. A second click fits the picture to the box and its
  neighbours. Escape clears.
- **The panel** shows a record: its name, kind, technologies, owner and where the owner comes
  from, its whole description and its file. For an arrow it lists the connections it stands
  for.
- **Detail follows the zoom.** Below 75 % descriptions are hidden, below 60 % the kind lines
  and the words on arrows, below 40 % the names. A fitted picture too small to read says so:
  how many boxes and arrows it has, and from which zoom names can be read.
- **Model** is the listing of `seefore list`, in the same order, worked out by the same code.
  A click on a record opens the same panel.
- **Problems** lists what the check found, each with its file, line and column.
- **A broken file** takes its record out of the pictures; the rest still draws. Each view
  says how many connections it could not draw for that reason.
- **Following the files.** When a file changes the page takes the new model in place. It keeps
  the zoom and the selection, and fits again only when the reader has not moved.
- The address names the view, so a view can be opened again.

## The command

```
seefore --server [--workdir=<directory>] [--port=<number>] [--no-open]
```

- It serves on `127.0.0.1` only, and answers no request that names another host.
- Without `--port` it takes 4173, or the next free one. It prints the address, and opens it in
  the browser unless `--no-open` is given or the output is not a terminal.
- It keeps running until it is stopped. A directory that cannot be found ends with exit code
  2, as for `seefore check`.
- What the page gets is JSON over HTTP: the model with its problems and the list of views, and
  for each view its boxes, arrows and labels with their places.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| What draws and what lays out | React Flow draws. ELK lays out, in the engine, so a picture can be tested without a browser (the owner; `research/diagrams/`) |
| Direction | Left to right for every view. A rule for each view would flip on a small edit |
| Arrows | One for each pair of boxes and direction. Measured: 29 to 77 % fewer crossings |
| Labels | Placed by ELK, on their line. Measured: none over a box or a line; placed afterwards, a line ran through half of them |
| A box | One size, 240 by 150. Two lines of description would cut most first sentences |
| The font | Arial and the fonts made to its measure, so the engine can measure text without a browser |
| A view too large to read | Drawn, with its counts and a note. The limit is stage 7's to set |
| The sidebar | The views by system, the model's listing, and the problems (the owner) |
| ELK in the package | A dependency at a pinned version, not copied into the command's file. ELK's licence is EPL-2.0 |

## Names this stage adds

One way to run the command, `seefore --server`, with two options, `--port` and `--no-open`.
Two kinds of view, context and containers. Nothing in the format: a source directory is read
as it was. Four libraries: ELK (`elkjs`), React (`react`, `react-dom`) and React Flow
(`@xyflow/react`).

## Skips

Of "Every stage ends the same way": part 3, since nothing new can be written, and part 5.

## Leaves out

Editing, dragging, stored positions and styling controls. Search, links to a box and
drill-down: stage 10. Component views, a landscape and "this box and its neighbours" as a view
of its own: stage 9. The limit for a crowded view, and what holds a picture still when the
model changes: stage 7. What a connection passes through: stage 6. A mark on a box for a
connection to itself. Export of a picture.

## Against the research

Checked against `research/synthesis.md`, and against `research/diagrams/recommendations.md`,
which checks seven reports on diagram craft and on six tools by measuring on the trial models.

Follows it:

- **Automatic layout that copes with nesting** (synthesis, layout). ELK lays out the boundary
  and its inside in one run. Dagre, which the synthesis warns of, was not used.
- **A typed model apart from its views** (1.1). A view is worked out and holds nothing the
  model does not.
- **A title, a key and labelled arrows on every diagram** (the C4 checklist, in the practices
  report). The legend is made from what is drawn.
- **Never colour alone, and contrast that holds** (practices report). The classic C4 fills with
  white text fail the contrast rule, so boxes are outlines with dark text.
- **Following one box by eye** (practices, IcePanel, Ilograph, LikeC4): hover and click light
  its arrows and neighbours.
- **A broken file is reported and the rest still loads** (the plan, stage 3).

Departs from it, with the reason:

- **Left to right, not top-down.** The studies and two tools favour top-down. Measured on the
  eight trial models the two fit within 17 % of each other; left to right puts labels on
  level runs and sent no arrow through a boundary's title.
- **One arrow for many connections.** C4's own notation draws each. Measured, that gives up to
  3.4 times the crossings.
- **No last good picture.** Five tools keep the last picture when the source breaks. Here the
  rest of the model draws and the error is shown at its place, as the plan asks.

Risks it takes on:

- **The largest views cannot be read when fitted.** A container view of 59 to 88 boxes shows
  names 2 to 4 pixels high on a screen of 1600 by 1000, whatever the settings. Until stages 7
  and 9 the answer is zoom, the light on one box, and a note.
- **Text is measured in one family of fonts.** On a machine without it, words may not fit
  their boxes.
- **Nobody but a program has judged these pictures.** The counts are geometry.
