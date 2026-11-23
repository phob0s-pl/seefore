# Depth and scope

One view with two controls, where the page had a list of views. This is stage 9 of `plan.md`.
It builds on `diagrams.md`, `hard-cases.md` and `layout.md`.

## What it is

The page draws one view, and two controls say what it shows:

- **Depth**: how far boxes are opened. System, Container or Component.
- **Scope**: what the picture is about. Everything, or one box with its neighbours.

A depth and a scope together are a **setting**. A setting is worked out from the model and is
not stored: there is no record for a view, and the format gains nothing. The two views of
stage 5 are two of the settings and draw what they drew.

The plan had a view as a record in a file here, with a name, a purpose and a rule for what it
includes. The owner dropped the record on 2026-11-23. A rule for what a view includes pulls
towards a query language, and a flow picks its parts for a reason a reader has: a flow gets a
picture of its own at stage 11. The check for a crowded view goes at this stage too.

The stage was planned by Astra, which built a trial of it and measured 1,160 settings on the
seven public trial models. The numbers below are from that trial, unless they say otherwise.

## Depth

A box is **closed** when it is drawn as one box, and **open** when it is drawn as a boundary
with what it holds inside.

| Depth | What is open |
| --- | --- |
| System | Nothing |
| Container | Each system that has parts to show: its apps, its stores, and its pieces of infrastructure that have a box |
| Component | Also each app that has components |

- **What has nothing to show inside stays closed** at every depth. A system with one part is
  open all the same.
- **A component is a box**, with a shape of its own and a line such as `[Component · Rust]`.
  The line names the technology the component's own record names, and no other.
- **A store that an app keeps has no box** at any depth. It is drawn at its app, as before,
  and at the app's boundary when the app is open.
- **A piece of infrastructure has a box** only where a connection starts or ends at it, as
  `hard-cases.md` says. One that connections only pass through has none at any depth.

## Scope

- **Everything**: every person, every system, and every piece of infrastructure in no system
  that has a box, each open as the depth says.
- **One box**: that box, open as the depth says, and its neighbours, each closed.

What can be the scope, and the depths it has:

| What is chosen | System | Container | Component |
| --- | --- | --- | --- |
| A person | yes | the same picture | the same picture |
| A system | yes | yes | yes |
| A piece of infrastructure in no system, with a box | yes | the same picture | the same picture |
| An app | no | yes | yes |
| A store in a system | no | yes | the same picture |
| A piece of infrastructure in a system, with a box | no | yes | the same picture |
| A component | no | no | yes |

- **The depths on offer start at the level of what is chosen.** Choosing an app while the
  depth is System sets the depth to Container, and choosing a component sets it to Component.
  A deeper depth that draws the same picture can still be chosen.
- **These have no scope of their own**: a store that an app keeps, a thing that connections
  only pass through, an owner, a technology and a connection. Each is read where it is read
  today: in a panel and in the listing.

### A neighbour

Every thing has a path from the top: its system, its app, itself. A person and a piece of
infrastructure in no system are their own whole path. A store that an app keeps ends its path
at that app.

A neighbour of the chosen box is the other end of a connection that starts or ends at the
chosen box or at anything inside it. It is drawn closed, as the first thing on its own path
that is not on the path of the chosen box:

| What is chosen | Its neighbours are drawn as |
| --- | --- |
| A system | A person, another system, a piece of infrastructure in no system |
| An app, a store, a piece in a system | The same; and for an end in its own system, the app, the store or the piece there |
| A component | The same; and for an end in its own app, the component there |

- **An end at something the chosen box is in** is drawn as that thing, closed: a connection
  from a component to its own system draws the system as a neighbour.
- **No frame stands around the chosen box.** A chosen app is drawn without the boundary of
  its system.
- **A neighbour's own neighbours are not followed.**

## Where an end is drawn, and which arrows

- **An end is drawn at the deepest thing on its path that the picture draws.** At System
  depth that is its system. At Container depth its app or store. At Component depth itself.
  An end outside the scope is drawn at its neighbour.
- **An end at a thing that is open** is drawn at its boundary: a connection written to a
  system or to an app itself. An end at a store that an app keeps is drawn at that app, box
  or boundary.
- **One arrow for each pair of drawn ends and direction**, as before. Its label, its route,
  its ring, its `only` and its technology follow `diagrams.md`, `hard-cases.md` and
  `layout.md`. A connection written between the two drawn things themselves comes first, then
  the others by id. Everything a connection says stays within reach from its arrow.
- **Two ends at one drawn thing** make no arrow, as before. A connection from a record to
  itself is the mark ↻ on its box. A connection between two parts drawn as one box is in the
  panel of that box. An open box carries both on its boundary.
- **With everything as the scope, every connection whose two ends can be followed is in the
  picture once**: as an arrow, as a mark or in a box's panel. An arrow may then join two
  people.
- **With one box as the scope, a connection that neither starts nor ends in it is not
  drawn.** One between two boxes of the picture is counted under the title, as before.
- **A record whose file has an error** is not drawn, and nothing inside it is. A connection
  with an end in such a record is counted under the title when its other end is in the scope.

## The two pictures of stage 5

One system at System depth is the context view of stage 5. One system at Container depth is
its container view. Each has the boxes, the arrows, the words, the order and the places it
had. Astra's trial made all 111 of them on seven models both ways, with the code of stage 8
and from the rules above, and none differed in a box, a mark, an arrow, a route, a label or a
place. A test holds this on views made by code, and the trial script holds it on the trial
models.

## The layout

ELK lays a picture out as before: layered, left to right, in one run. What is new:

- **Several boundaries, and a boundary inside a boundary.** Each open box is a node with its
  children inside it, and has the settings that the one boundary of stage 5 has.
- **The walk takes every drawn thing.** A boundary that an arrow starts or ends at is taken
  as a box is. A boundary has the turn of the earliest thing inside it, worked out from the
  inside out.
- **A picture takes its turns from the picture one depth up.** For the same scope one depth
  up, the turns are worked out first, from the same model. Every thing that is in both
  pictures keeps its turn, also a box that is now open. What is newly shown takes its turns
  from the walk of the deeper picture. Nothing is taken from the picture that was on the
  screen: an address opened afresh and a change of depth by hand give the same picture.
  - With it, 83 % of the pairs of boxes keep their order both ways when the whole model is
    opened one depth, 86 % when an app is opened inside its system, and 94 % when the chosen
    app is opened. With the walk of the deeper picture alone: 71 %, 76 % and 66 %.
  - **One system at Container depth does not do this.** It keeps the turns of its own walk,
    since that picture must not change. So from the context view of a system to its
    container view the order of the neighbours does not hold: 56 % of the pairs over nine
    such changes, and 24 % in the worst. One system at Component depth takes the turns of
    its container view.
- **Two people, one acting on the other.** A person stands in the first column. With
  everything as the scope an arrow can join two people, and ELK fails when both must be
  first. The person acted on is let go of the first column.
- **The split of a long column** stays where it was and as it was: one system at System
  depth, from 16 boxes.

What it costs: more crossings. With the whole model at Container depth the seven models have
2,942 crossings under the walk alone, 3,402 with the turns from the depth above, and 2,224
when ELK orders by itself. At Component depth: 4,166, 4,317 and 2,705. A steady order comes
before the fewest crossings, as stage 7 decided.

## A change of depth

A change of depth opens or closes boxes. The page keeps one of them in place: its top left
corner stays at the same point of the screen, at the same zoom.

- **Which one.** The chosen box, when it opens or closes. Else the box that opens or closes
  nearest the middle of the canvas, and of two as near, the first by id.
- **A change of depth that opens nothing** gives the same picture, and the page does not
  move.
- **A change of scope** fits the new picture to its room.
- No layout is asked to keep a box where it was: in the trial none of 41 opened boxes kept
  its place by itself, and one moved 4,528 pixels. The page moves the canvas, as it does
  since stage 7 when the files change under a chosen box.

## The crowded check goes

The warning `view-crowded`, the limit of 40 boxes and pass number 7 of stage 7 are taken out.
The model was right and the picture was large, so nobody could act on the warning, and with
the whole model in one picture it would fire on nearly every model.

- **The page has one note, and the zoom decides it.** When the names cannot be read at the
  zoom the picture is shown at, which is below 60 %, the page says, for Sentry's whole model
  at Component depth in a room of 1,000 by 700:

  > Too small to read at 7 %: 118 boxes and 193 arrows. Names can be read from 60 %. Zoom in,
  > or point at a box or an arrow, or move the keyboard's focus to it, to read it here. To see
  > one box with its neighbours, choose it as the scope.

- It is said of the zoom the picture is shown at, also after a change of depth that kept a
  box in place, and never of a zoom it would have opened at.
- What a picture shows at each zoom is as `diagrams.md` and `layout.md` say. Nothing counts
  boxes any more.

## The page

- **The sidebar** has the model's name, then the two controls, then "View", "Model" and
  "Problems" with their number. The list of views by system is gone.
  - **Depth** shows its three choices at once: System, Container, Component. One that the
    scope does not have cannot be chosen.
  - **Scope** is a list: "Everything", then every box that can be the scope, grouped and
    ordered as the listing under "Model" is. Two boxes of one name are told apart by their
    ids.
  - **View** leads back to the picture last shown, from "Model" and from "Problems".
- **The page opens with everything at System depth.** On a model with nothing to draw it
  says "No boxes to draw."
- **A box becomes the scope from its panel.** The panel of a record that can be the scope has
  the button "Show with its neighbours": on a box, on a boundary and from the listing. It is
  not shown for the present scope. A click on a box opens its panel, as before, and changes
  no setting.
- **The title** names the depth and the scope: "System view: Everything", "Container view:
  Relay", "Component view: Shop". One system at System depth keeps "Context view: Shop".
- **The chosen box has the thicker line** that the system in scope has since stage 5, as a
  box and as a boundary. With everything as the scope no box has it.
- **The counts and notes under the title** are as before, over what the picture draws. For a
  chosen box that is not a system the line for what is left out reads "3 connections between
  two of its neighbours are not drawn:".
- **The legend** shows what the picture draws, as before. It gains "Component: a part of an
  app"; "This box: what the view is about", for a chosen box that is not a system; and a
  line for the boundary of an open app, "Boundary: an app, with its components inside". With
  everything as the scope a system is "System: software seen as one thing, ours or somebody
  else's".
- **The reading line** says the words of a boundary as it says those of a box.
- **The address** holds the depth and the scope: `#/view/system` for everything,
  `#/view/component~relay` for one box. An id cannot hold `~`. An address with a depth that
  the box does not have opens at the shallowest it has. One the page does not know opens the
  start. The addresses of stage 5, such as `#/view/shop.containers`, are gone.
- **While a picture is laid out** the one before it stays, and the page says "Laying out the
  view…".
- **Following the files.** The depth and the scope stay. When the box in scope is gone the
  page shows everything at the same depth and says "That box is gone. This is everything."
  What is chosen stays chosen while the picture draws it, and stays in place as stage 7 has
  it.
- **The keyboard** works both controls. A change of depth leaves the focus on the control.

## The commands

- **`seefore check`** no longer reports `view-crowded`. Nothing else in it changes, and
  checking a model makes no picture.
- **`seefore list`**: a connection is in no picture only when an end of it cannot be
  followed, since everything as the scope draws every other. The line that says so is
  reworded to that.
- **`seefore uses`** is as it was. A setting is no use of a record.
- **`seefore --server`** no longer sends every view with the state. The state lists what can
  be the scope, each with the shallowest depth it has. `/api/pictures/<revision>/<setting>`
  answers with the view of that setting and its picture, where `<setting>` is what the
  address holds: `system`, `component~relay`. It answers 404 for a setting it does not have
  and 409 for a revision that is not the latest, as before. One layout runs at a time, for
  at most five seconds, and a setting is laid out once for each revision.
- **`node scripts/shoot.mjs`** takes pictures of settings, and **`node scripts/steady.mjs`**
  measures the pass numbers below.

## The skill

Its section on the check loses what it says of `view-crowded`. It gains one sentence for an
agent to tell a person where to look: "To read one part, choose it as the scope on the page;
choose Component to see inside an app." The skill writes nothing for a view.

## What must be true

The numbers were set before the build, from Astra's trial on seven models: the same bars as
stage 7 where a measure is of the same kind, and a little under what was measured where it is
new. `scripts/steady.mjs` measures them on all eight. A measure with nothing to measure does
not pass.

Stage 7's six stay. Numbers 1, 2 and 6 now hold for every setting:

| # | What is measured | It passes at | Astra's trial |
| --- | --- | --- | --- |
| 1 | The same model, laid out again and in another order: every setting | No picture differs, and none fails | 0 of 1,160 |
| 2 | A new name or a new description: every setting | Nothing moves in any try | 0 |
| 3 | One edit, one system at Container depth: pairs in one column that keep their order | 95 % over all edits; 75 % in the worst edit that adds something | 98.4 %; 80.1 % |
| 4 | One edit, one system at Container depth: pairs that keep their order both ways | 80 % over all models; 65 % in each model | 88.3 %; 79.8 % |
| 5 | One edit, one system at System depth: pairs that keep their order both ways | 80 % over all models | 84.4 % |
| 6 | The slowest layout of any setting | 2 seconds | 1.42 s |

The new ones. "The bars of 3 and 4" are 95 % in one column, 75 % in the worst edit that adds
something, and 80 % both ways:

| # | What is measured | It passes at | Astra's trial |
| --- | --- | --- | --- |
| 8 | One edit, everything at System depth: both ways | 80 % | 90.6 % |
| 9 | One edit, everything at Container depth | The bars of 3 and 4 | 99.2 %; 86.5 %; 84.1 % |
| 10 | One edit, everything at Component depth | The bars of 3 and 4 | 99.2 %; 85.4 %; 86.8 % |
| 11 | Of 9, the pictures with more than one boundary, alone | The bars of 3 and 4 | 99.3 %; 86.5 %; 80.2 % |
| 12 | Of 10, the pictures with a boundary inside a boundary, alone | The bars of 3 and 4 | 99.4 %; 85.4 %; 87.0 % |
| 13 | One edit, the largest system at Component depth: both ways | 80 % | 88.0 % |
| 14 | One edit, the app that has components, chosen, at Component depth: both ways | 80 % | 91.8 % |
| 15 | A component added, taken out or moved: everything, its system and its app, at Component depth | The bars of 3 and 4 | 99.0 %; 100 %; 86.1 % |
| 16 | One edit: pairs of boxes inside one boundary before and after, both ways | 80 % at Container depth and at Component depth | 84.6 %; 83.8 % |
| 17 | A change of depth, everything, System to Container: pairs in both pictures that keep their order both ways | 75 % over all; 50 % in the worst | 79.7 %; 52.6 % |
| 18 | The same, everything, Container to Component | 80 %; 75 % in the worst | 86.3 %; 78.1 % |
| 19 | The same, one system, Container to Component | 80 %; 60 % in the worst | 85.7 %; 63.5 % |
| 20 | The same, the chosen app, Container to Component | 90 %; 80 % in the worst | 93.7 %; 81.2 % |
| 21 | The box kept in place at a change of depth, opening and closing | Within 1 pixel of the screen each way, at the same zoom | By arithmetic only |
| 22 | The two pictures of stage 5, against the code of stage 8; and a change of depth that opens nothing | No picture differs | 0 of 111; 0 of 568 |
| 23 | Every setting: pairs of boxes in one column of one boundary that stand against their turns | None | 0 of 16,361 |

- **Number 11 passes by a hair in the trial**: 80.2 % against 80 %. The eighth model, and
  the build in place of the trial code, may put it under. Then it is said, and not set again
  without the owner.
- **From a system's context view to its container view no number holds the order**: both
  pictures are kept as they were, and number 22 holds that.
- The numbers are this project's own, as stage 7's are. The owner's reading of the pictures
  decides whether they are enough.

## Decisions

| Decision | Outcome |
| --- | --- |
| What a view is | One view with two controls and no record (the owner) |
| What the scope can be | Any box (the owner). Not a store that an app keeps, nor a thing only passed through |
| How deep the neighbours are drawn | Closed (the owner) |
| The whole model | Drawn at every depth, however large (the owner) |
| The crowded check | Taken out (the owner). One note on the page, by the zoom |
| A box chosen at a depth above its own | The depths on offer start at its level, as the plan recommended |
| The list of views in the sidebar | The two controls take its place, as the plan recommended |
| Which control stands first | Depth, then Scope, as the owner named them. Astra had Scope first, since it limits the depths |
| How a box becomes the scope | From its panel, with a button. A click on a box still only reads it |
| The start | Everything at System depth. Astra kept the context view of the first system, for a reader used to it; nobody is yet |
| The addresses of stage 5 | Gone. Astra kept them readable. The tool is not released, and two forms are one name too many |
| The title | The depth and the scope, as the controls say them. "Context view" stays for one system at System depth |
| A frame around a chosen app | None |
| The order when a box opens | Taken from the picture one depth up. Not for one system at Container depth, whose picture must not change |
| Keeping a box in place | The page moves the canvas. No layout holds a place |
| A route as a picture of its own | Not here. It was left to this stage by stage 6b. A flow's picture, at stage 11, is where it is asked again |

## Names this stage adds, and takes away

Adds: three depths and the word "Everything"; two labels of controls, "Depth" and "Scope";
one button, "Show with its neighbours"; one link, "View"; two beginnings of a title, "System
view" and "Component view"; one shape, the component; three lines of the legend; one form of
address. Nothing in the format, no command, no option and no problem code.

Takes away: one problem code, `view-crowded`; one limit; one pass number; the list of views
in the sidebar; the two ids of a view, `<system>.context` and `<system>.containers`.

## Skips

Of "Every stage ends the same way": part 3, since nothing new can be written, and part 5.

## Leaves out

A view as a record, a query language, a layout hint, a stored place, a picture picked by hand
for one audience. Deployment views. A route as a picture of its own. Making a large picture
read better: stage 28. Search, and drill-down by a click on a box: stage 25. Pruning a picture
by itself, and a new way to route lines in a dense one.

## Against the research

- **Follows** `research/synthesis.md`, 2.8: "Define a relationship once at the lowest level
  known and let it roll up", with the underlying ones kept within reach. The same section
  advises to split a crowded diagram into "one per service with its direct neighbours", which
  is one box as the scope, and says of the old limit of elements that it "was never
  validated", which is why the limit of 40 goes.
- **Follows** section 4, on the page: "a landscape as the atlas, drill-down with a clear
  sense of level" and "a legend generated from the styles in use". Everything at System depth
  is the atlas, and the depth is the level.
- **Follows** 2.1, "Stable placement, understandable routing and a fast preview", in the
  first and the last: the old pictures stay, an opened box takes its order from the picture
  above, and one box stays in place. **It works against the second**: the steady order costs
  crossings, and a third more than ELK's own at the whole model. The owner's task of
  following an exchange decides whether that holds.
- **Departs** from section 4, on the model: "Views as selections over the model: each has an
  identity, a purpose, a scope, a rule for what it includes, and its own layout stored
  apart." This stage keeps none. An address gives a built-in selection again. It cannot keep
  an author's purpose, a picture picked for one audience, or all that one team owns across
  systems. A flow, at stage 11, picks parts for the reason its scenario gives, and search by
  owner, at stage 25, answers part of the team's question. Neither is a view that is kept.
