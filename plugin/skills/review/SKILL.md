---
name: review
description: Reviews one change to the model with four readers, each with a lens of its own, and writes their points as one review; call it when a change is drafted, before you decide.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *)
context: fork
---

You review **one change to this system's model**, in a context of your own: you did not
draft it, and you see nothing of the session that did. You start four readers, join what
they find by the rules below, and write one file, `reviews/<id>.yaml`. You change nothing
else: not the change, and no record of the model. You approve nothing, and you ask the
person nothing: a question for them is a point.

What the person typed after the skill's name: "$ARGUMENTS". That is the change's id, and
after it, if they wish, one reader alone: `plain`, `assumed`, `failure` or `trust`. With
nothing typed, take the one open change that has no review; with several, name them and stop.

## The readers

Each is a subagent that the plugin ships. It reads the change and the model with a fresh
context, and answers with its points.

| Reader | Its lens |
| --- | --- |
| `seefore:plain` | None: a careful architect who will have to live with what is built |
| `seefore:assumed` | What was decided without the person, in `assumed` or silently in the records |
| `seefore:failure` | The steps of each flow the change moves: their order, their moment, their failure |
| `seefore:trust` | By whose leave the data is where the change sends it |

## The rules of what to keep

The readers bring about twenty points, half of them said twice, and most of them true. A
person answers ten. You cut by these rules alone, never by your own view of the design.

1. **A question to the person is kept, also when one reader alone asks it.** Never cut a
   point for being alone: the faults that matter most are found by one reader.
2. **One point a subject.** The same record and the same outcome is one point, with the
   strongest severity and the finding that names most records. Its recommendation holds
   every case and every question of the joined points: a join drops words, never a case.
3. **What three or more readers raise ranks up**, after rule 4.
4. **A finding that rests on one sentence of a record or of `given` is kept only when that
   sentence says it.** Do this for every point you keep, the blocks first: set the sentence
   beside the finding. Where the finding says "only", "never", "all" or "none" and the
   sentence does not, or asks for an agreement, a leave or a limit that `given` names, the
   point goes out, also when several readers share it: agreement is no proof.
5. **What is as true of a flow or a record that the change does not touch goes out.**
6. **A number, an hour or a size chosen inside a limit that `given` states is one note for
   all of them**, and the note names that limit. Where `given` states none, this rule does
   not apply: how many people are asked at once, in which order, and how long one has to
   answer are points of their own.
7. **Data kept "without end" or passed "more than needed" goes out** where no line of the
   model names a term.
8. **Stale prose, and what a description tells and no flow walks, is one joined note**; a
   block only where a person named in the need cannot get what was promised.

A block on a choice stays a block only when the choice serves or leaves out people, is
promised to a user, a caller or an operator, or would have to be undone by somebody outside
the team. Else it is a note, by rule 6. **At most ten points: a ceiling, and fewer is a full
review.** Blocks have no ceiling of their own. When more than ten are left, the joined notes
of rules 6 and 8 go first, then the other notes, then a fault, never a question, whose harm
rests on an "if" that no record states. Lower no block and raise no note for a count.

## The steps

1. Run `seefore list changes`. The line of the change ends with its mark, eight characters.
   A line that ends with `applied` or `rejected` is of a decided change: say so, and stop.
   The shell is for `seefore` alone, one command a call. The records lie in `architecture/`,
   or here when this folder holds `seefore.yaml`.
2. Run `seefore list --change=<id>`, and keep the lines it marks: `+` adds, `~` updates, `-`
   removes. Where the shell cuts the list off and saves it to a file, read that file.
3. **Start the readers, all in one message**, each as a subagent of its type, with this task
   and no word of your own view: "Review the change `<id>`. The model's folder is `<folder>`.
   The change's file is `<folder>/changes/<id>.yaml`. It touches these records:" and the
   marked lines. With one reader named, start that one alone. **Never start a reader in the
   background, and do not end your turn before every reader has answered**: a turn that
   ends on "waiting for the readers" leaves no review.
4. **Join their answers by the rules.** Read the change's file yourself first, so that you
   can tell one subject from another. What a reader passed on under `outside` is a point
   when another reader raised it too, when it is a question to the person, or when it names
   a record of `context/` or `rules/`, or a sentence of the need, that the change may not
   meet: open that record and judge the line. A line of `assumed` that a reader names there
   as the person's is a point.
5. **Write `reviews/<id>.yaml`** as the guide below says: `read` is the mark, in quotes; the
   points stand the weightiest first, each under an id of a few words. A finding names the
   records by their ids and holds no remedy; a recommendation is an outcome or a question.
   With nothing kept, the review is `read` alone: that is a full answer. The review is the
   file: one told in a message alone is none.
6. Run `seefore check`, and mend what it says of your file, three rounds at most. What it
   holds against the change itself is no thing for you to mend.
7. End with a short message that asks nothing:
   - the points by name, the blocks first;
   - how many points each reader brought, how many you kept, and how many each rule cut;
   - "Next: read Review on the page, then decide, or have the change corrected."

## The format

Take no name or id from the example below: it is of a tea shop.

!`seefore guide review`
