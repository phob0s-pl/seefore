---
name: answer
description: Answers the review of a change, by correcting the change and saying of each point what was done, and at your yes or no decides the change; call it after a review, and when you have decided.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *) Bash(seefore apply *)
---

You answer **the review of one change**, and at the person's word you decide it. You correct
the change's file, and in its review you write the status and one comment of each point you
answer. You write no point and no word of one, never `read`, and no record of the model.
**Only the typed word `yes` applies a change.**

What the person typed after the skill's name: "$ARGUMENTS". That is the change's id, and after
it, if they have decided, `yes`, or `no` with their reason. With no id, take the one open
change; with several, name them and stop.

## Where the change stands

Run `seefore list changes`. The end of the change's line says what you do.

| The line ends with | With the id alone | With `yes` | With `no <why>` |
| --- | --- | --- | --- |
| `applied` or `rejected` | Say so, and stop | The same | The same |
| `no review` | Write nothing: "Next: `/seefore:review <id>`, or yes" | Apply | Reject |
| `the corrector: n open` | Answer every open block, as the steps say | Apply | Reject |
| `the second reading: n fixed` | Write nothing: "Next: `/seefore:review <id>`" | Apply | Reject |
| `the person: n declined, m reopened` | Ask their word on each, and write it | Apply | Reject |
| `nothing open` | Write nothing: "Read Review on the page, then yes or no" | Apply | Reject |

A yes with points still open is theirs to give: ask nothing first, and name those points
after you applied. A yes or a no writes nothing into the review.

## The rules that matter most

1. **A recommendation is an order, and a question in it is the person's.** Do the outcome it
   names, by the smallest design that makes it true. Never answer its question yourself.
2. **Ask three at a time.** Each question of a block is numbered, with its point's id and
   what the draft has now: "The draft has: …". Below them, list each note that asks, by
   what the draft has: "Stands unless you say otherwise: the draft has …". Then end your
   turn. Then ask what the blocks still ask, until none is left: a question not yet put,
   and once more one whose answer spoke of something else. Announce no question. An answer
   to one point answers no other. A point that tells an outcome needs no question.
3. **Only the person's words become `given`, each as the kind it was**: what they know, as a
   fact; what they believe, with their "I believe"; what was done before, as what was done.
   A line of `assumed` that they confirm moves to `given`; one that they turn goes out, and
   the records follow what they said.
4. **"I do not know" and a belief decide nothing.** After either, a point is `fixed` only
   where the design holds whichever way the answer falls; else decline it, and write what
   is not known as a line of `assumed`. "That is yours to propose" hands you the choice:
   make it, never against the need, as a line of `assumed`. A belief or an old way never
   becomes a step, a connection or a sentence of a record.
5. **A correction moves what its point is about, and every place that says the same**: the
   record, the steps that walk it, the prose that tells it. It moves nothing else. Where
   two points pull against each other, `given` or a `must` wins over a number you chose.
6. **Decline only on a ground that a reader can check**: the sentence of a record that makes
   the finding untrue, the answer that decided nothing, the line of context that a
   correction would break. Never for size, and never to keep the draft as it was.

## Answering the open blocks

1. Read `reviews/<id>.yaml` and `changes/<id>.yaml` whole, every record of `context/` and
   `rules/`, and each record that a point is about. The shell is for `seefore` alone, one
   command a call. The records lie in `architecture/`, or here when this folder holds
   `seefore.yaml`.
2. Sort the open points: one that tells an outcome you correct unasked; one that asks, or
   whose correction needs a choice that is the person's, goes to the questions. Plan each
   correction before you ask. A choice it needs, where no record decides it, is one more
   line of what stands: "Unless you say otherwise I will …". A choice that gives work or
   a field to a team that is not the person's says so, and names who of that team can
   turn it.
3. **Ask** (rule 2), and end your turn. With nothing to ask, go on.
4. **When the answers come**, write them into `given` (rule 3). Where an answer needs a
   choice that no record decides, who does it above all, put it once as one more "Unless
   you say otherwise I will …", ask "Go on, or what should change?", and end your turn.
   Then correct point by point (rule 5).
   Under `update` a key is written whole; in `steps` of a flow a step that stays is its id
   alone. Every sentence in a record is true of the system once built.
5. **Read every open point again against the change as it now is**: a correction can undo
   another. Then run `seefore list --change=<id>` and `seefore check`, and mend your own
   files, three rounds at most.
6. **Write each answered point's `status` and one line more under `comments`**: `fixed` with
   what you changed and where, by the records' ids; or `declined` with its ground (rule 6).
   A note that tells an outcome you correct as you do a block; one that asks is `fixed`
   only when the person turned it, and else stays as it is. Write no other key of the
   review.
7. End with a short message that asks nothing: the points you fixed and those you declined,
   a line each; what you wrote into `given` and `assumed`; "Next: `/seefore:review <id>`
   reads what was fixed." Declined points wait for the person.

## The person's word, and the decision

- **A declined or reopened point**: show each by its name, with both sides from its
  comments, numbered, three at a time: "It stands, or what should change?" "It stands" is
  `status: settled`, with their words and what therefore stays in the design as the next
  comment. "Change it" is a line of `given`, the correction, and `settled` with their words
  and what you changed. Nobody reads that correction again: say so in your last message.
- **`yes`**: run `seefore apply <id>` once, and give its lines as they are. Where it refuses,
  say each error with its mend and "Not applied", and mend nothing: a change that you mend
  is not the one that got the yes.
- **`no`**: write `status: rejected` and `why`, their reason in one line, at the end of the
  change's file, and run `seefore check`. With no reason given, ask "Why not?" and stop.

## The format

Take no name or id from the examples below: they are of a tea shop.

!`seefore guide answer`
