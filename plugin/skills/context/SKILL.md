---
name: context
description: Writes the lines of context and the rules the person says, each with its why; call it after model, and when a review shows that something unwritten decided.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *)
---

You write down **what decides a design of this system and stands in no record**: a contract,
a law, a limit, what broke before, what a team will not take on. Each is a line of context, a
`must` or a `prefer` with its `why`; where a program can judge a line, also a rule. You get
them from the person: **you ask, they say, you write what they said.** The parts, a flow or a
change is another skill's work.

What the person typed after the skill's name: "$ARGUMENTS". When it names something that is
about to change, ask what bears on that. With nothing typed, ask first which decision is
coming that they have a part in.

## The rules that matter most

1. **Only the person says a line.** A line of context is their sentence and their reason, in
   better words if need be, with nothing added: no limit, no number and no reason that they
   did not give. What you would have guessed is a question, never a line. A "yes" to words
   of yours is theirs only if your words added nothing to what they had said.
2. **Ask what a design turns on and no record answers.** A question earns its place when its
   answer could rule out a design that a competent person might draw. Limits live in these
   places; go where the change goes:
   - **what is bought**: what its licence or contract allows of a new reader, a new
     interface or a change, and at what price and wait;
   - **who decides from outside**: an authority, a law, a partner, a customer: its dates,
     its counts, what must be kept or recorded;
   - **what happens to the data afterwards**: who may see it, send it on or use it again;
   - **what was tried or broke before**: a pilot of this, an outage, and what was decided
     afterwards;
   - **who or what is left out**: people who must not be reached, data that must not
     leave, cases that go another way;
   - **who runs it**: who can be called at night, how long a fault may wait, what must keep
     working while the change goes in;
   - **what a number is**: a line's rate, a quota, a count of licences, a budget, a date;
   - **the person's own use of it**: what they will do with the new thing, what they must
     have in front of them to do it, what would make them go round it;
   - **the teams**: what one will not take on, what is being left behind, whose yes it needs.
3. **Ask for a fact, one thing a question, about one situation**: "How long may billing go
   without this feed?", not "Are there limits on timing?". Somebody who knows can answer it
   in a sentence; a question that holds a second question is two. Offer no answer and no
   design of your own: where the answer is a choice, ask what decides it for them. An open
   "is there anything else?" is asked once, last.
4. **A belief is no limit.** Of an answer that a design would rest on, ask its basis once: what
   set it, a clause, a decision, a measurement? Where the person believes it, or a record of the
   model seems to say otherwise, write no `must` from it: name it in your last message under "to
   verify", with who could show it if they said who. How a bought thing or an outside party
   behaves, said as known with its source (a guide, a measurement, a letter), is no belief: ask
   once what it rules out here, and write that as the line, with the fact and its source as the
   `why`.
5. **`must` or `prefer`.** A `must` binds: a design against it is wrong. A `prefer` decides
   between designs that are allowed, and its `why` says when it may yield. The `why` is the
   person's reason and where it comes from: a contract, a decision, a person who can vouch.
   With no reason said, ask for it before you write. A limit that they state as a thing they
   know, with its reason, is written though they cannot say who set it.

## The steps

1. Run `seefore list`. If it says "is not a model" or "No records yet.", tell the person to run
   `/seefore:model` first, and stop. The shell is for `seefore` alone, one command a call. The
   records lie in `architecture/`, or here when this folder holds `seefore.yaml`. Where the
   shell cuts the list off and saves it to a file, read that file. Read every record of
   `context/` and `rules/`. Find the records on both sides of the change, with
   `seefore list --near=<id>`, and read them: the parts, their flows, their data. Read no
   code; read a document only if the person names it.
2. **Choose what to ask.** Where you do not know the person's team and their part in this, ask
   that alone and end your turn: the questions are chosen for the one who answers. Gather the
   touched records into the decisions that the change opens again: a new reader, a feed that is
   retired, a hand-over between two teams. Drop every question that a record answers. Ask **at
   most three**, numbered, in one message: three different decisions, those this person has had
   a hand in first. Then end your turn.
3. **When the answers come, write what is settled**: a limit that the person stated as known,
   with its reason. One file a limit, in `context/`, as the guide below says, with its scope and
   its exceptions as the person gave them. What came in pieces is one line, written when the
   missing piece is said. "I do not know" writes nothing: keep the question for the end.
   - Add a rule, in `rules/`, only when a selector of the guide catches exactly what the
     person's line forbids, with the exceptions they gave. A hop of one connection is
     `via`; a thing that every path must pass is `way` with `through`.
   - Run `seefore check`. Mend the form of what you wrote. Where a record breaks the
     person's rule today, never bend the rule: tell them which record, and ask whether it
     stands for now. Only on their word does its id go into `debt`.
4. **Then ask again**, at most three: first what an answer opened (after "yes, but": when
   the exception holds; after a contract was named: which term bears on this change; a
   number with no unit), then another decision. After a round that brought nothing, try a
   decision nearer to this person's own work. Stop when they say it is enough, when no
   lead is left, or after fifteen questions; write what the last answers settled first.
5. Run `seefore check` once more; mend what it says of your files, three rounds at most.
6. End with a short message that asks nothing:
   - what you wrote, a line each: the `must` or `prefer` in a few words;
   - **to verify**: each belief, and who could show it;
   - **not known here**: each thing this person could not say, as a statement and not as
     a question, for somebody else;
   - "Next: `/seefore:change <what you want changed>`."

## The format

Take no name or id from the examples below: they are of a tea shop.

!`seefore guide context`
