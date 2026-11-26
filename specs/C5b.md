# C5b: The item, worked out

The second of the six stages of "data kept in a store"; `specs/C5.md` says where they come
from. It says what an item is, and works it out in `src/model/`. No page shows one yet: C5d.

**After it** one function says, for any flow, every item its page will draw: in which store,
by which steps, under which condition, and what it is at each place of the flow.

## What an item is

**An item is one data record in one store, in one flow.** It is worked out from the steps and
never written on a store. Nothing is guessed from a step's name or from the store's kind.

| The step names the data in | And its way (C5) is | The act |
| --- | --- | --- |
| `data` | Write | A put |
| `data` | Read | A read. The item stays |
| `data` | Not said | None. Nothing is drawn; `way-unsaid` counts the step |
| `removes` | Any | A take. The item is gone from that step on |

- **An act is at the store its step's connection ends at** (`actsOf`, beside `wayOf`). A reply,
  a step in a part or with no place, and one between two parts make none. Two stores, two items.
- **Settled here**: of one step, the acts of `data` come first, in its order, then those of
  `removes`. So one id in both is a read, then a take.

## What it is at a place

| It is | When, by the acts of the steps up to and with the place: none before the first step, all at Ends |
| --- | --- |
| Hollow | There is none. It means "not yet touched by this flow", not "not yet there" |
| Gone | The last of them is a take |
| Kept | Else, when one of them is a put |
| Only read | Else |

- **Settled here**: the table is held as it stands. A put after a take is kept again. A read
  after a take is kept where a put came before, and only read where none did.
- **The step's word**, where the step at the place touches the item. **Settled here**, for a
  step with more than one act on it: "Gone" when the item is gone after the step; else "Put"
  when one of the step's acts puts it; else "Read".

## A step that runs a flow

- **It does, in the stores this flow draws, every act of the flow it runs**, in that flow's
  order, and of every flow that one runs in turn. It adds no box and no line.
- **The stores this flow draws** are the stores among the boxes of its view, `flowView`, all
  the way down: a flow in between need not draw the store. An act of a run flow in any other
  store makes no item here: it stays on that flow's own page.
- **All its acts stand at the one step of this flow that runs it.** So a row may stand that
  no step of this flow names. **A flow run twice acts twice**, once at each of the two steps.
- **A flow that runs itself** is an error of `flow-in-itself`, and the page still stands.
  **Settled here**: a flow already on the way down is not run again; that step does nothing.

## An item under a condition

- **An act stands under a condition** when a step on its way down has `only`: the step of
  this flow, each step below it that runs a flow, the step that acts. **Settled here**: its
  words are those conditions, the outermost first, joined with " and ".
- **An item is under a condition when every act on it is**, for the whole flow, not by place.
- **Settled here**, its words: "Only", then the words of each act, each once, in the order of
  the acts, joined with "; only": "Only when the export job is still queued; only when the
  export is already prepared". A flow's own `only` is no condition of an item, in this flow
  or in one it runs: it names the case the whole flow is told for.

## What the model gives, and what is out

- **`flowItems(records, flowId)` in `src/model/flow.ts`**: the items of a flow. **Settled
  here**: they stand by their first act, which is the order of the rows in a box. An item has
  its store and its data, by id and name, its condition's words, and its acts. An act has the
  number and the id of this flow's step, what it does, the part that acts (its connection's
  `from`), whether a flow that the step runs does it, and its condition.
- **`itemAt(item, place)`** says what the item is there, and the step's word. **`flowView`
  says on each store's box how many items it holds**, as `rows` on `Box` in `view.ts`: the
  box grows by them in C5d. **It touches** `flow.ts`, `view.ts` and the tests.
- **Out**: the rows, the bar, the two pages and the marks: C5d, C5e, C5f. A clock on an item
  that goes by itself: no step witnesses it. **Not known**: the order of two acts on strands
  side by side, where the file's is taken; a read that can miss; a flow only started here.

## Tests, about eleven

On small models written inline. A put, a read and a take give kept, only read and gone, and
`data` with no way gives no item. An item is hollow before its first act, and at Ends what
all its acts make it. One id in both lists is read and then gone: "Gone". A put after a take
is kept again. A step that runs a flow acts in a store this flow draws, and in no other.
Through a flow that runs a flow. A flow run twice acts at both steps. A flow that runs itself
does not loop. An item is under a condition only when every act is; a run step's `only`
counts and the flow's own does not; the words of two conditions. One step that reads and puts
one item says "Put". The items stand by their first act, and a store's box says its `rows`.

## The try

A script over the eight trial models as they are, the private one in
counts only, must find 110 items in 47 flows: at Ends 78 kept, 32 only read, none gone; by the
flows' own steps alone 100, 74 kept and 26 only read; 24 under a condition in 12 flows, two of
them under two conditions, at most four in one flow; at most three items in a box. Boxwick 18,
Vellumoak 38, GitLab 6, Sentry 24, Home Assistant 10, Syncthing 1, Teleport 7, private 6.

| Flow | It must give |
| --- | --- |
| Boxwick: "Buying tickets"; "Getting in through a turnstile"; "The Notifier sends an email" | Payment in the payments topic and no other item: put at 15 by the flow it runs, read at 16. Gate list read at 3; Scan put in the scans topic at 13, "Only when Scan answers"; no Scan in the scans database, since step 8 says no way. Email in the queue: put at 2, read at 3, kept |
| Sentry, "An error becomes an issue"; Vellumoak, "Taking in a donation" | At 16 the flow it runs reads Task activation, two flows down, and puts it: the word is "Put". Listening copy put at 13 by the flow it runs and read at 15 two flows down: "Only when the audio is valid; only when the rights allow it" |
