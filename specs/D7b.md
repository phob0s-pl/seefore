# D7b: A flow under a change

Stage D7b of `plan2.md`, in milestone 4. The owner said on 2026-11-25: "new, deleted flow is
just label, updated flow will have red elements removed, green added, and yellow updated",
answered three questions, had it built as one stage, and after the review asked for the
switch. Fable and Astra each planned it apart (`research/changes/flow-page/`, out of Git).
The main session builds the model's part, Opus the pages, and Fable reviews.

## What the owner answered

| Asked | Answered |
| --- | --- |
| Where do the colours of an updated flow show? | On its steps and on its diagram |
| When is a box or a line yellow? | When the change updates its record. Green when the flow newly passes it, red when it no longer does |
| Where do the steps stand under a change? | In the sidebar, as on a flow's own page |

## The page

A flow opens under a change at `/changes/<change>/records/flows/<id>#<step>`, as the flow's
own page (C4): its steps in the sidebar, the bar of the current step, its diagram.

| Part | What it is |
| --- | --- |
| The top bar | The home button, the arrows, the way back: the change, to Need; "Records", to the list; the flow's name. After it the mark: **Added**, **Updated** or **Removed** |
| A flow the change adds | The flow as it would be. No colour on a step, a box or a line |
| A flow the change removes | The flow as it is today, the same way. The bar with no step says "Removed by this change. This is the flow as it is today.", with "Open it in the system" |
| A flow the change updates | Two views, by a switch after the mark. **Changes**: one list of steps and one diagram, of today and of the change together, as below. **Result**, at `?view=result`: the flow as it would be alone, read as a flow the change adds. A step picked stays picked where the other view has it |

**The mark "Updated" is yellow on every page of a change**, on the Records list too.

## The steps of an updated flow

| A step that | Shows |
| --- | --- |
| Goes | Red: a rule at the row's left, a minus in place of its number, its first line struck through, the word "Removed". It stands where it stood: after the nearest step before it today that stays |
| Comes | Green: the rule, its number as it would be, the word "Added" |
| Changes | Yellow: the rule and the word "Updated". A step changes when one of its own keys is written otherwise: `does`, `reply`, `after`, `name`, `only`, `description`, `data`. Not when its number shifts or the connection it is on is renamed |
| Only moves | No colour: it stands once, at its new place, with a quiet "Moved" |
| Stays | As today |

- **The numbers are those the flow would have.** "Reply to 5" and "4 of 12" count that flow.
- **A step that goes is read as it is today**: today's name and ends of its connection, also
  where the change rewrites that connection. It can be picked, like any row: the bar says
  "Was step 1", and the diagram lights the line it walks today. It names the steps it came
  after by the numbers they bear in the list, and opens no strand of its own.
- **No meaning lies in the colour alone**: each coloured row has its word.

## The bar of the current step

An updated step is shown as it would be. A line that reads otherwise than today has a yellow
rule, and under it, quiet, "Today: " and today's words; "Today: nothing" where the key is
new; "Taken out" over today's words where it goes. Who acts on what and the title are
always there: each bears the rule when its words differ, whichever key made them differ.
With no step picked, the flow's own keys that change read the same way.

## The diagram of an updated flow

| Part | What it is |
| --- | --- |
| What is drawn | Every box, frame and line the flow passes today and every one it would pass, as one picture, laid out once. What only today's flow passes is drawn as it is today. A step picked lays nothing out anew |
| Green, red | Green when only the flow as it would be passes it; red when only today's does. This comes before yellow |
| Yellow | It is in both, and the change updates its record. A line of several connections is yellow when they do not all bear one mark: its panel says which comes, goes or changes |
| On a box | The border keeps the colour of its kind. Inside: a band down the left side, a faint wash, and a round sign at the top right: +, − or ~ |
| On a frame, a line | A frame's outline takes the colour, with the sign by its name. A line's stroke and head take it; a red line is dashed |
| The current step | The outline and the brightness say it, as today. A coloured line keeps its colour and thickens |
| A legend | On an updated flow: "+ Newly passed", "− No longer passed", "~ Updated by the change" |
| The panel of a box or a line | Beside its type, the mark of what the change does to the record. On a green or a red one: "With this change the flow newly passes it." or "… no longer passes it." Its button follows `address` (D7) |

## The fields of a data record

In "Before and after" (D7), `fields` reads as one list, a row a field: its name and its
description, with "Added", "Removed" or "Updated" on one that comes, goes or whose
description differs, and today's words under an updated one.

## How it is built

- **`flowUnder` in `src/model/flow.ts`** says all that differs: the steps in one list, each
  with its mark, today's words for its changed keys and what it lights; the view of both; a
  mark for every box, arrow and connection; and the result. The page compares nothing.
- **The pages**: `flow.tsx` draws a flow from that; the links of the flow's page (its
  feature, a flow it runs) follow `address`; `diagram.tsx` draws the marks.

## What is out

- **Later**: the words that differ marked inside a text; the old ends of a connection whose
  `from` or `to` changes; a note that another change updates this flow too; the same marks
  on the whole diagram (D8); a rule and a line of context on pages of their own.
- **Never**: two changes laid together; a view of today alone under a change, which is the
  flow's own page; colour on a step or a box of a flow that is added or removed.

## Tests

Fourteen of the model: the one list and its numbers; what makes a step updated; a step
that only moves; the marks of boxes and lines; a step put on another connection; what a
removed step lights; a reply that goes; a step that goes on a connection the change
rewrites; strands and conditions in the one list; an id twice; the result; a flow added and
one removed; no flow where the change names none; the fields of a data record. Six in the
browser: an updated and an added flow open with their mark; the list's colours and a
removed step picked; the diagram's marks and legend; a panel's sentence and its button; a
removed flow, and the fields of a data record; the switch.
