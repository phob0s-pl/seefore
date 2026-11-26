# C5e: The bar says it, and the two pages

The fifth of the six stages of "data kept in a store"; `specs/C5.md` says where they come
from. C5d drew the rows. This stage says in words what a row shows, where words already
stand: the bar of a flow's page (C4), a store's page and a data record's page.

**After it** a person reads in the bar what the current step does at its store, and at Ends
what the whole flow leaves behind. A store's page says who puts, reads and takes out each
thing kept there, in every flow; a data record's page says the same of each store it is in.

## The bar of the current step

After the step's sentence, in place of "Data" for what makes an act (C5b):

| The act | The line | Its pills |
| --- | --- | --- |
| A put | "Puts into orders database", then a pill for each item | The tint of stores |
| A read | "Reads from payments topic", then the pills | Plain |
| A take | "Takes out of orders database", then the pills | Red, the name struck through |

- **Settled here**: a line for each of the three and each store, in that order, the stores by
  their first act in the step. A step on a connection has one store; a step that runs a flow
  may have several, and each of its lines ends with "by the flow it runs", quiet.
- **One item may stand in two lines**: a job that a step reads and takes out. **A pill bears
  the sign of a condition** where its item does, and a click on it opens the item's panel
  (C5d) and marks its row as picked.
- **"Data" stays** for the ids of `data` that make no act at this step: on a step between two
  parts, on a reply, and at a store with the way not said. Its pills are as today.
- **The list of steps says nothing of data**: the owner chose so.

## The bar at Ends

Today the bar at Ends is the bar before the first step (`flow.tsx`, line 327). Now it holds
the flow's name and these lines, a line with nothing in it left out:

| Line | What it holds |
| --- | --- |
| The sentence | The flow's `ends`; under a change that rewrites it, with the rule and today's words, as D7b reads a flow's own keys |
| "Kept" | Each store with an item kept at Ends: its name, then its pills, which open the item's panel as a step's do |
| "Gone", "Only read", "Only passed" | On one line that wraps, each with its label. Gone and only read by store, as Kept. "Only passed": a plain pill for each data record that a step of this flow names in `data` and that is no item in any store here, in the order they are first named |
| "Also runs" | A link for each flow that a step of this flow runs, each once, in order. Then, quiet: "What they keep in other stores is on their own pages." |

- **Settled here**: the stores stand in the order of their first row; the three lists share
  a line, as the mock-up has them, since the bar is 172 pixels high and scrolls beyond that.
- **Settled here**: the feature, the condition and the paragraph stand before the first step
  only; under a change the flow's own keys that change are read there, as today.
- **The owner chose on 2026-11-26**: the button on and the down key go on from the last step
  to Ends, and back. Before, only a click on its row and the End key reached it.
- **Settled here**: "Also runs" names the flows this flow's own steps run, not those they
  run in turn. "Only passed" counts this flow's own steps, not those of a flow it runs.
- **Data does not stand on the lines**: they run 6 to 8 pixels apart and bear no word.

## A store's page: "Kept here"

`specs/C2b.md` names it, and it is not built. **Settled here**: it is a section before
"Flows", left out when it has no row.

| Column | What it holds |
| --- | --- |
| The data record | Its name, a link |
| What is done | "Put by Orders", "Read by Scan", "Taken out by Orders": the part is the `from` of the step's connection |
| Where | The flow's name and "step 11": one link, to the flow opened on that step |

- **A row for each act of a step at this store**, in every flow. **Settled here**: by the
  data's name, then the flow's name, then the step's number; a flow's own steps only, so what
  a flow does here through one it runs stands under that flow, once. No way, no row.

## A data record's page: "Kept in"

**Settled here**: a section after "Connections", beside where the record travels, left out
when empty. The same rows, with the store in the first column: by the store's name, then the
flow's, then the step's number. 25 of 93 pairs of a store and a data record are touched by
more than one flow: only these two sections join them.

## How it is built, and what is out

- **`src/model/travel.ts`** gains what the two sections ask, worked out when first asked, as
  the rest of it is. `record.tsx` draws them. `flow.tsx` and `flow.css` gain the lines.
- **Out**: the bar's lines under a change, which is C5f. The two sections on a record under
  a change (D7): not planned. What a part sends and gets, which C2b names: not asked.

## Tests, about ten

Of the functions: the acts at a store, in order, with who acts; those of a data record by
store; an act that a run flow does stands under that flow alone; a step with no way gives no
row. In the browser: a put reads "Puts into" with its pill, and a pill opens the item's
panel; a take from a queue reads in two lines; a step that runs a flow says "by the flow it
runs"; "Data" keeps what makes no act; Ends lists Kept by store, Gone, Only read, Only passed
and Also runs, and leaves out a line with nothing; a store's page has "Kept here" and its
link opens the flow on the step; a data record's page has "Kept in".

## The try, on the copies of C5d

| Opened | It must read |
| --- | --- |
| Boxwick, "Buying tickets", at 17 | "Puts into orders database [Paid order]" and "Takes out of orders database [Basket]", as `mock-step-17.png` |
| The same, at 15 | "Puts into payments topic [Payment] by the flow it runs", as `mock-step-15.png` |
| The same, at Ends | Kept: holds store [Hold], inventory topic [Seat change], orders database [Paid order], payments topic [Payment], inventory database [Sold seats]. Gone: orders database [Basket]. Only passed: [Seat map]. Also runs: Paying for a basket, Tickets reach the fan. As `mock-ends.png` |
| Vellumoak, "Making the nightly backup", at Ends | The four lines of the picture in the design's section 5 |
| Boxwick, the orders database; Paid order | "Kept here" with Basket and Paid order, each flow that touches them; "Kept in" with each store |
