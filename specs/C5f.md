# C5f: Items under a change

The last of the six stages of "data kept in a store"; `specs/C5.md` says where they come
from. The page of a flow under a change (D7b) is the flow's own page, so the rows of C5d and
the lines of C5e are there already. This stage adds what the change does to an item.

**After it** who decides a change sees, on the page of a flow that it rewrites, what the flow
newly keeps, what it no longer keeps, and what it keeps otherwise, each with its word.

## Where an item bears a mark

| The page | Its items |
| --- | --- |
| A flow the change adds; the Result view; a flow the change removes | As any flow's (C5d), from the records as they would be, or for the last as they are. No mark |
| The Changes view of a flow the change updates | Those of today's flow and of the flow as it would be, each worked out (C5b) and held against each other |
| A flow the change does not name | It has no page under the change (D7b). A change to a data record, a connection or a flow that this one runs marks nothing on it, as it marks no box and no line of it today |

## The mark of an item

| It is | When | It shows |
| --- | --- | --- |
| Added | Only the flow as it would be has it | Green, "Added" |
| Removed | Only today's flow has it | Red, "Removed", drawn as today has it |
| Updated | Both have it, and its acts differ; or the change updates its data record | Yellow, "Updated" |

- **Settled here**: its acts differ when the two lists of acts are not alike, an act being
  the id of this flow's step, what it does, the part that acts, whether a flow that the step
  runs does it, and its condition's words; a number that shifts differs nothing. **An item that
  today's steps name with no way is not drawn today**: a change that says the way adds it.
- **A change that turns a connection's `access`, or moves its end, marks what it alters**,
  though no key of a step differs: the acts differ, or the item is Removed in one store and
  Added in the other. So does a change to a flow that this one runs. **`flowUnder` in
  `flow.ts` says it all**, with today's acts of a marked item: the page compares nothing.
- **Settled here**: a store that only today's flow reaches is drawn, with its frames, also
  where the change moves the end of a connection that stays: today `flowUnder` takes such a
  connection with its new ends alone (`flow.ts`, lines 410 to 419), and a Removed item would
  have no box. The stage is built in two parts, as D7b was: the model, then the page.

## The rows

- **The box is laid out for the items of both flows**, as the diagram is for the boxes of
  both: `rows` counts them. **Settled here**: they stand as they would be, and a Removed one
  is put back where it stood today, by `orderOfBoth`, as a step that goes is.
- **Settled here**: each row is read from its own side, as a step is (D7b): a Removed item
  from today's steps, every other from the steps as they would be. An act stands at the row
  of its step in the one list of steps, and "so far" counts down that list.
- **A marked row** has a rule of 3 pixels at its left and the mark's word at its right, both
  in the mark's colour, in every state, also while the row is hollow. At its own step it bears
  the step's word, and keeps the rule. **"Removed" is what the change does; "Gone", a step.**
  **Settled here**: an item's mark calls no legend, for each has its word; D7b's is as today.

## The bar of a step

- **A step the change updates is shown as it would be** (D7b), with the lines of C5e. Where
  what it does at its store reads otherwise than today, each of those lines and "Data" has
  the yellow rule, and under the last of them stands "Today: " with today's words.
- **Settled here**, today's words: each data record that today's step names, with what the
  step does to it, joined with "; ": "Basket, put"; "Payment, read"; "Basket, taken out";
  "Paid order, no way said". "Today: nothing" where it names none; "Taken out" over them
  where the step names none now. On a step at no store, the names alone, as today.
- **Settled here**: only a step the change updates has the rule (`flow.ts`, lines 455 to
  470): one that stays has none, though its connection turns, and its items say it. A step that
  goes says what it does at its store as today has it. At Ends the lists are the Result's.

## The panel of a marked item

| The item is | After its life: "Under this change: Added", and this, quiet. **Settled here**, but for the first two |
| --- | --- |
| Added, and today's steps name it here with no way | "Today: not drawn. Step 11 names it and says no way." As the mock-up |
| Added, else | "Today: not in this store, by what the flow says." As the mock-up |
| Removed | Its life is today's, read as above. "With this change: not in this store, by what the flow says." |
| Updated, by its acts | "Today:", and today's life, a row an act, as the life above: each with its step's words and description as today has them, and "at what was step 4" where its step goes |
| Updated, by its data record alone | "The change updates the data record." |

## What is out

| What | Why, or where it belongs |
| --- | --- |
| A mark on an item of a flow the change does not name, or on the whole diagram; "Kept here" and "Kept in" under a change; the words that differ inside a line; a note that another change marks this item too | A flow has a page under a change when the change writes it (D7b), and no item is drawn on the whole diagram. The rest is not planned: later, as in D7b |

## Tests, about eleven

Of `flowUnder`, on small models: an item that only the flow as it would be has is added; one
that only today's has is removed, with today's acts; acts that differ update it, and a number
that shifts does not; an update of its data record updates it; a connection whose `access`
turns from `write` to `read` updates it though no step differs; one whose end moves removes
it in one store and adds it in the other; the rows of a box are those of both, a removed one
where it stood; a step that gains `access` has "Paid order, no way said" as today's words; a
flow the change adds bears no mark. In the browser: a hollow row bears "Added", and "Put" at
its step; a removed row is red, with its word; the bar has the rule and "Today:"; the panel
says "Under this change: Added"; the Result view has no mark.

## The try

- **A copy of Boxwick as it is, and a change that writes the nine keys of the design's trial**
  into "Buying tickets", with the three data records, held against `mock-change-step-17.png`
  and `mock-change-ends.png`: five items say "Added", Payment has no mark, seven steps Updated.
- **Two changes more on that copy**: one takes `removes` off step 17, so Basket says
  "Updated" and is kept at Ends; one takes step 19 out, so Sold seats says "Removed". And
  each flow under each of Boxwick's seven open changes opens, and its items' marks are read.
