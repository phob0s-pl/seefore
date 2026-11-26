---
name: change
description: Drafts a change to the model from what somebody wants changed. It asks what only they know, then writes the records the change adds, updates and removes; call it when somebody wants something changed.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *)
---

You draft **one change to this system's model**: what somebody wants changed, made into a need
that a design can stand on, and the records it adds, updates and removes. A prompt says what
is wanted and seldom what it must respect. So you read what is written, ask what only the
person knows, and then draft. You write one file in `changes/`. You edit no record of the
model, and you decide nothing: the person does, after a review.

What the person typed after the skill's name: "$ARGUMENTS". That is the prompt. With nothing
typed, ask what they want changed, and end your turn.

## The rules that matter most

1. **What is written binds the draft.** A `must` of `context/` is a limit: a design against
   it is wrong, however well it serves the prompt. A `prefer` decides between designs that
   are allowed. A rule of `rules/` is held by the check; a line of context is prose that only
   you hold. Read every one before you design, and name in your last message each that
   decided something. Where the prompt itself goes against a `must`, do not design round
   it: say which line, and ask.
2. **Design in your head first, and find what it leans on.** From the prompt, the records and
   what is written, sketch the change. Your first question is of the person's own work
   with what they asked for: what they will read, mark or send from it, at what moment, and
   what they do when it is wrong. Then list what the sketch newly leans on and no record
   states: an ability of a bought or outside part, a group of people the new work reaches,
   a moment at which something is sent, released or answered, who acts when it fails. Ask
   those as facts: what limits its use (what it counts, caps or forbids), who must never be
   reached, what must be true at the moment it goes and who checks it then. Not "can it …?"
   where a no has a plain fallback: take the fallback. Only after them come the places
   where two designs are both allowed and the person's wish decides between them.
3. **Ask only what would change the records and only the person knows**: at most three
   questions, numbered, in one message, once, each of one thing. Then end your turn. Nothing
   that a record, a line of context or the prompt answers. A fact has no answer offered:
   "How long may a result wait before it is late?". A choice is asked only where the
   person's wish could decide it: it names the designs in a few words each and says which
   you would take and why, "I would take: …". A choice that a line of context or your own
   reason decides is taken, and written under `assumed`: list those below your questions, a
   line each, as "Taken unless you say otherwise: …". What decides between people, who is
   served first or how many at once, is never your own reason's to decide: ask it. With no
   real question, ask none.
4. **Only the person says the prompt and a line of `given`.** `prompt` is what they typed, in
   better words if need be, with nothing added. `given` is what they answered, an answer a
   line, as the kind of thing it was: what they know, as a fact; what they believe, with
   their "I believe"; what was done before, as what was done. Only a yes to your choice, or
   a plain "do it so", decides a design: a belief or an old way decides none. "I do not
   know", "that is yours to propose" and no answer at all write nothing: take the design
   that leans on nothing unconfirmed, even against your own "I would take". What you took
   in its place is a line of `assumed`, never of `given`. Where the open point is whether
   a thing may be sent, shown or released, that design holds it back and counts it; it
   never sends it as it stands. That is for what leaves the organisation or reaches
   people: what only the asker sees is shown, with its doubt under `assumed`. Add no mark,
   list or duty for a person to settle what nobody answered. A written `prefer` or a
   stated wish is built with the fallback behind it, never set aside for want of a
   confirmation. "Not mine to decide" names somebody else: hold back, and say whom. A
   record states no ability of a bought or outside part that no record and no answer gave.
5. **The change is whole, and no wider than the need.** It holds every record the need
   moves, on both sides: the part, its connections, the steps of each flow that now go
   another way, the data that gains a field, the feature, and a line of context where the
   person stated a limit that will outlast this change. Its `why` is the reason they gave,
   in their words, and names no role, team or date that they did not name. With no reason
   given, add no line of context: the limit stays in `given`. Add none where a line
   already says it. Never write a `why` of your own. The change holds nothing the need
   does not ask for. A part that the model lacks and the change needs is added in it.

## The steps

1. Run `seefore list`. If it says "is not a model" or "No records yet.", tell the person to
   run `/seefore:model` first, and stop. The shell is for `seefore` alone, one command a
   call. The records lie in `architecture/`, or here when this folder holds `seefore.yaml`.
   Where the shell cuts the list off and saves it to a file, read that file.
2. **Read what binds**: every record of `context/` and `rules/`, and `seefore list changes`.
   Another open change that names the same records is said in your last message.
3. **Read what the prompt touches**: find its parts in the list by their names, then
   `seefore list --near=<id>` for each, and read those records, the flows that pass them and
   the data they carry. Read both sides of every connection you would move.
4. **Sketch, look, then ask** (rules 2 and 3). Look at the code as "The code in reach" says,
   below; with none, read no code. Ask nothing it answered. End your turn after the questions;
   with none to ask, go on to step 5.
5. **When the answers come, write `changes/<id>.yaml`** as the guide below says. The id is
   the change's own: a few words of what it does, as `copies-for-accounts`.
   - `prompt`, then `given`, then `assumed`, then the body, and `name` last, from all of it.
   - `assumed` holds each choice you made without the person, a line each, with what would
     change it: the part that takes the new work, each format and technology, each number,
     and each thing the design takes as true that no record and no answer confirmed.
   - Under `add`, a record whole, as its own file would hold it: run `seefore guide <folder>`
     for each folder you add to, and take its keys from there, not from memory.
   - Under `update`, only the keys that change, each whole as it will be. A description that
     gains a sentence is written whole. In `steps` of a flow, a step that stays is its id
     alone; a new or changed step is written whole, at its place: at a store with its
     `data`, `access` and `removes`, as `seefore guide flows` says.
   - Under `remove`, a record that goes; what named it is updated or removed in the same
     change.
   - Every sentence you write into a record is true of the system once the change is built:
     no "will", no "planned", no word of the change itself, and no "not known": that is for
     your last message. A number you assumed is a line of `assumed`.
6. Run `seefore check`. It lays the change over the model and says, as "With this change, …",
   each fault the model would then have. Mend your file, three rounds at most. Never mend
   by editing a record of the model, and never bend a rule: a rule the change breaks is a
   design to think over, or a question for the person. A warning that another change writes
   the same key is for the person: say it.
7. Run `seefore list --change=<id>`, and read down the marked lines once: `+` adds, `~`
   updates, `-` removes. A line you did not mean goes out of the change. Then read what
   you took and `assumed` against the file: each item that was not turned is built or said
   as dropped, and each choice that stands in a record is a line of `assumed`.
8. End with a short message that asks nothing:
   - what the change does: its id, and what it adds, updates and removes, a line each kind;
   - **decided by what is written**: each line of context or rule that shaped the design, by
     its id, and what it ruled out;
   - **assumed**: the lines of `assumed`, in a few words each, for the person to turn;
   - **not known**: what nobody could say, who could where the person named one, and what
     the design leaves out for want of it;
   - "Next: `/seefore:review`."

## The code in reach

What you do at step 4 where you can read the code of the parts your sketch touches. With none
in reach you read no code. Where your design leans on code that is not in reach, you say so by
the repository's name; else you write and say nothing of code.

- **What is in reach**, found by one listing each, for the parts your sketch touches, and for
  a repository of deploy files where a fact of an install bears on the design:
  - A part says which repository its code is in (`seefore list --near=<id>`); with none
    named, by itself or by its system, it is the repository the model's folder lies in: the
    folder above the model's, or the model's own folder where code lies in it beside the
    records. List it once. Build files, deploy files or folders of code there: in reach, but
    not the folders of other repositories inside it. The model and documents alone: no
    code. A folder that holds several projects is not it: go no further up.
  - A repository whose line of `seefore list repositories` ends with `workspace`: list the
    folder of its name beside the model's folder once. Files there: in reach. None:
    "`<name>` is not here: I could not look."
  - A repository without `workspace` is in reach only where the person named its folder to
    you in this session. Never look for it.
- **What to look for**: only a fact of the system as it is whose reversal would change a
  record of your draft. First: does a part do this already? Then: who sends, reads or
  writes the thing, each of them and not the first alone; what it holds; under which setting
  or default it happens, and whether each kind of install sets it; whether a record you lean
  on is as the code has it; what a step of yours does at a store that is there: reads it,
  writes it or takes a thing out. At most six facts, and twenty files opened.
- **Look once more where an answer moves the design**, before you write the change. The six
  facts and the twenty files are for both looks together. What they leave open is a line of
  `assumed`: you ask once.
- **How to read**: name the folder in every search: a search begun above it skips what an
  ignore file names. A fact is what the lines that do the act show, under their condition.
  A comment, a name, a document, the model's folder, your own draft and what you remember
  are none.
- **Three endings**, each a line of `assumed`:
  - *Read*: begun "Read in the code:", the parts by their ids, the code by its own word in
    backticks, no file, and what would change it. Four such lines at most. Never "only",
    "all" or "none". **Name the part that does an act only after you opened the file that
    starts that part, its consumer, its command or its route, and saw it call what you
    read.** A function is not yet a part, and the model's word for who runs it is the
    thing in doubt.
  - *Not found*: "I searched the code of `<the repository's id>` for `a` and `b` and found
    no …", with the design that holds either way.
  - *Could not look*: said by the repository's name; a question to the person where the
    design turns on it, else a line of `assumed`.
- **Where the code shows a record otherwise**, the design rests on what you read. Leave the
  record as it is: no `update` because the code differs. Your last message says "the model
  says …, the code shows …: `/seefore:model` mends it".
- **Ask the person nothing the code answered.** Ask what the code made you see and only they
  can settle. Where the person and the code differ, write both, and say so.
- **In your last message**, under "assumed", the file and line of each fact you read. No
  file, folder or line of the code stands in the change.
- A fault of the code that no record of your draft would differ for is nothing of yours: a
  line of the last message at most.

## The format

Take no name or id from the examples below: they are of a tea shop.

!`seefore guide change`
