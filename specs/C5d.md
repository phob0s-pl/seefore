# C5d: The rows in a store's box

The fourth of the six stages of "data kept in a store"; `specs/C5.md` says where they come
from. C5b works the items out. This stage draws them on the page of a flow (C4). Its picture
is `mock.html` in `research/data-kept/`, drawn by hand on two flows of Boxwick, out of Git.

**After it** a person opens a flow and sees in each store's box what the flow puts there,
reads there and takes out, step by step. A click on a row says which steps did it.

## The box, and what B11 means for it

- **A store's box grows 24 pixels for each of its items**: 84 high with none, as today. A row
  is 22 high with a gap of 2, and as wide as its box less 9 a side. **Settled here**: the
  first row begins 76 pixels below the top of the box, which leaves 10 at the foot.
- **The box is laid out once, at its full height.** `src/ui/layout.ts` hands ELK the taller
  size, also as the least size, and no new line.
- **A layout is kept by its view, its depth and its shape (B11).** The number of rows stands
  in the view, as `rows` on the box (C5b), so the key holds it. What a row is at a place comes
  beside the view, as `marks` do, so a change of step finds the layout that is kept: in the
  view, each step would be a layout of its own. A row is drawn from what the page is handed,
  by its store and its data, never from the kept layout: two flows alike in `rows` share one.
- **A change of step draws again only the boxes whose rows change their look** (a box is drawn
  again for its data, not its class). No row has a transition: B11 measured what a fade costs.
- **It touches** `layout.ts`, `diagram.tsx`, `diagram.css`, `inspector.tsx` and `flow.tsx`.
  The page is handed the items as it is the view: from `flowItems`, and under a change (D7b)
  from `flowUnder`, the Changes view those of the flow as it would be, unmarked until C5f.

## A row

| The item is (C5b) | Its look | Its word, at the right |
| --- | --- | --- |
| Hollow | No ground, a quiet dashed outline, its name quiet | None |
| Kept | A tint of the colour of stores, with a line of it around | None |
| Only read | A grey ground, quiet | "only read" |
| Gone | A tint of red; its name struck through | None |
| Touched by the current step | The tint of stores, strong, and a bright outline; the red one, strong, when the step leaves it gone | The step's word: "Put", "Read" or "Gone" |

- **A row is the data's name**, at 12 pixels, cut with "…" where it is too long; the word at
  11. No step number, no example value, and no legend: the owner chose so.
- **Before the first step every row is hollow.** At a step each row is what the acts so far
  make it. **Ends shows each as after the last step**, with none lit.
- **The sign of a condition** stands straight after the name of an item under one, in every
  state: lucide's `Split`, a path that parts in two, at 12 pixels. A pointer over it says the
  item's words (C5b), "Only when Scan answers": they are its `title` and its label.

## The current step

- **A step on a connection** lights its line and two ends as today, and the rows it touches.
  **A step that runs a flow** lights the rows it touches, no line, and fades nothing.
- **A faded box keeps its touched rows readable.** Today the fade sets the whole box to a
  quarter (`diagram.css`, lines 321 to 324), and a row cannot be brighter than its box.
  **Settled here**: a store's box with rows fades by its parts, wherever a box fades. Its
  outline, ground and heading go to a quarter; a touched row stands at 0.72; a hollow row
  keeps its own look.

## A click on a row

- **It picks the item, not the box**: the row gets the outline of a pick, the panel opens,
  and the step stays. A row is a button, and the mouse means it before the box it is in.
  **Settled here**: the field slides to keep the item's box clear of the panel, as for a
  picked box; the hover over a row is its box's; a double click on a row brings its box.

| Part of the panel, which is that of a data pill with the item's life first | Words |
| --- | --- |
| The small line, the name, a heading | "Data · in orders database"; "Basket"; "In orders database, in this flow" |
| A row for each act | "Put at 11 by Orders: Keeps the basket". "Read at 16 by Orders: …". "Taken out at 17 by Orders: Marks the order paid". By a flow that the step runs: "Put at 15 by the flow it runs: Paying for a basket". After the colon stands what happens in that step of this flow. The number is a link: it moves the page to that step and keeps the panel. The steps of an item stand nowhere else |
| Under an act, quiet | Its condition, "Only when Scan answers". **Settled here**: then the step's `description`, where it has one; so "The hold runs out by itself after ten minutes" is read here |
| A last row, quiet, when no act puts it | "Not put in this flow." |
| Then | The description, the fields and "Open data details", as today |

## What is out

| What | Why, or where it belongs |
| --- | --- |
| What a step does, in the bar, and Ends in words; the marks of a change on a row | C5e; C5f |
| Rows on the whole diagram of the model; a word on a hollow row; a legend | Fitted, the whole diagram's names are 2 to 3 pixels high. The owner chose a hollow row with no word, and no legend: if it does not read, the row is left out until its step and the box keeps its height |

## Tests, about eleven

Of the layout: a store's box is 24 pixels taller for each row, and one with none keeps its
size; two views that differ in `rows` alone are two layouts. In the browser, on `test/shop`
with a flow that puts, reads and takes: every row is hollow before the first step, with no
word; a put lights its row with "Put", and the row is kept after; a take strikes the name
through, with "Gone" at its step; an item only read says "only read"; Ends shows the whole,
none lit; the sign's title says the condition; a step that runs a flow lights a row and fades
nothing; in a faded box a touched row stands at 0.72; a click on a row opens the panel with
its life, and a number there moves the step; a double click on a row brings its box.

## The try

On copies that hold the design's own trial (C5c), at 1440 by 900, each against its picture.

| Flow | Places | Against |
| --- | --- | --- |
| Boxwick, "Buying tickets" | Before the first step, 9, 15, 17, Ends; 17 with Basket picked | `mock-starts.png`, `mock-step-9.png`, `mock-step-15.png`, `mock-step-17.png`, `mock-ends.png`, `mock-step-17-panel.png`: the rows and the panel, not the bar |
| Boxwick, "Getting in through a turnstile" | 8, Ends | `mock-turnstile-step-8.png`, `mock-turnstile-ends.png`: two signs |
| Boxwick, "The Notifier sends an email"; Vellumoak, "Making the nightly backup" | 3; Ends | Email struck through in the queue, kept in the database. The picture of the design's section 5 |

Every one of the 81 flows opens. The fit of each is read again and said here: the design
measured the least at 0.49, from 0.53, and names that can be read in 75 flows.
