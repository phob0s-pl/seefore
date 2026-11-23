# C4 checks

What a model lacks by the rules of C4's notation, counted on every run and never in the way
of one. This is stage 8 of `plan.md`. It builds on `modelling.md` and `source-directory.md`.

## What it is

The checks of stages 3 to 7 say whether a file may hold what it holds and whether the model
is sound. None asks for a field that may be left out. This stage adds one named set, **C4**,
of five checks that read what C4's own checklist asks of a diagram: that each thing says what
it is for, that each part names what it is built with, that each connection is named and its
name says more than "Uses", and that nothing stands alone.

It adds nothing to the format. A field that is left out is how a model says "not known yet".

Four of the five count what is missing and do not ask for it. On the eight trial models they
found 118 things. For 10 the model's own facts had the answer. For 70 nobody knows the answer
yet, and 27 lack nothing. The other 11 showed one rule wrong, and it was changed. The fifth
check is a warning.

## The set

"A thing" here is a person, a system, an app, a store, a component or a piece of
infrastructure.

| Check | It reads | It reports | Code | What it is |
| --- | --- | --- | --- | --- |
| A description | Every thing | One with no `description` | `description-missing` | A note |
| A technology | Every app, store and component | One with no `technology`. A component has its app's: it is counted only when its app names none either | `technology-missing` | A note |
| A name for a connection | Every connection | One with no `name` | `connection-unnamed` | A note |
| A name that is more than the word "Uses" | Every connection that has a name | One whose whole name is `Use` or `Uses`, in any case | `connection-vague` | A warning |
| A connection | Every thing, when the directory was read in full | One that no connection starts at, ends at or passes through, and nothing inside it either | `element-unconnected` | A note |

- **A note** counts something that is missing. It is no problem of the check: it is not among
  the errors and warnings, it does not change the exit code, and the page counts it apart.
  `seefore check` prints how many there are, and `--full` lists them.
- **The warning** is a problem as any other warning is, at the `name` it is about.
- **A field with a wrong value** has its error from the stages before, and is in no count
  here. Only a field that is left out is counted.
- **Not asked for:** a technology on a person, a system, a piece of infrastructure or a
  connection; a description on a connection, an owner or a technology; an owner on anything.
  The reasons are under "Decisions taken at this stage".

What each says, with `--full`:

```
people/fan.yaml:1:1: note: This person has no description. Say what it is for, when that is known.
apps/signing-server.yaml:1:1: note: This app names no technology. Name what it is built with, if the facts say: a language, a framework or a product. A protocol that it speaks belongs on its connections.
stores/tsh-profile.yaml:1:1: note: This store names no technology. Name the product that holds it or the format of its files, if the facts say. Files of no one format have none, and that is right.
components/health-page.yaml:1:1: note: Neither this component nor its app names a technology. Name what it is built with, if the facts say.
connections/shop-api-calls-inventory.yaml:1:1: note: This connection has no name. Say what the one that acts does, when that is known.
connections/orders-holds-seats.yaml:3:7: warning: This connection is named `Uses`, which says nothing of what is done. Say what the one that acts does. If nobody knows yet, leave `name` out.
apps/linux-desktop-service.yaml:1:1: note: No connection starts or ends at this app or at anything in it, and none passes through it. That may be right: add a connection, or name it in `via`, only for an exchange that the facts name.
```

A note stands at the start of its file, since what it is about is not there. The warning
quotes the name as it is written. The last note says of each kind only what can be so: a
person has nothing in it and cannot be passed through, so its note says "No connection
starts or ends at this person. That may be right: add one only for an exchange that the
facts name.".

## "Unknown"

**A field that is left out says "not known yet".** There is no word for it, no value, no key
and no list of things set aside. The count shows the gap on every run, and nothing a modeller
writes can make it go away but the fact itself.

- Where the facts say why something is not known, the description says so in ordinary words:
  "The sources do not name the product."
- Where a field cannot apply, the check does not ask: a person has no technology.
- Where a field could apply and never will, it stays left out, and stays in the count: files
  of no one format have no technology. The count says what is written. It cannot say whether
  an answer will ever come.
- **What is no answer to "what is it built with?"**: a protocol that a part speaks, which
  belongs on its connections. A store of files of one format has that format for its
  technology, as convention 5 of `modelling.md` counts a data format.
- **The skill never writes a word in place of a fact**: no "Unknown", no "N/A", no technology
  made up to stand for none.

## A name that is more than the word "Uses"

Whether a name explains an exchange takes a reader. The check tells one case that needs none:
a name that is the bare word `Use` or `Uses`, whatever its case, with nothing else in it.

- "Uses TLS to sign in" passes. So do "Holds seats", a name of one word that is not that
  word, and a name in another language.
- Passing says only that the name is not that one word. "Uses.", with a full stop, passes.
- **This is a list of words, of one word in two forms**, and the checks of stage 6a read no
  list of words. It is let in here on purpose: C4's checklist names the bare "Uses", and the
  trial of stage 4 had to mend it throughout. No other word joins it at this stage.
- Tried and dropped: a name of two words or fewer, which is sound 24 times in 25 on the trial
  models; a name that is the name of one of its ends, which never occurs.

## Connected to nothing

A thing is connected when a connection starts at it, ends at it or names it in `via`, or
when that is so of anything inside it: a system through its apps, stores, components and
pieces of infrastructure, an app through its components and the stores it keeps.

- A connection from a thing to itself counts. So does one under a condition, and one that the
  far side opened.
- A connection of a system says nothing of each part in it: a part with no connection of its
  own is counted, though its system has many.
- What does not connect: being in something, having the same owner, being named in a
  description, standing in a view.
- **Only when the directory was read in full.** A record whose file has an error is left out
  of the model, and its connections with it. What it touched would then look alone. So with
  any error, any file not read or any link not followed, this check is not run, and says so.

On the trial models 34 things were connected to nothing. For 6 the facts named an exchange
that nobody had written. 14 lack nothing: a person who runs or answers for a thing and does
nothing in it, a part that is planned. For 14 the facts do not say.

- **Who runs a copy, or answers for a part, has no connection for that.** It is said in a
  description or by an owner (convention 6 of `modelling.md`).
- **A thing that only passes exchanges on is named in `via`**, and gets no connection of its
  own for that (convention 7 of `hard-cases.md`).

## The exit code, and what a pipeline can ask

`seefore check` ends as before: 0 with no errors, 1 with errors, 2 when it could not start.
Notes and warnings never change that, so a model that is being explored is never stopped.

A pipeline that publishes pictures may ask for names:

```
seefore check --require-names [--workdir=<directory>] [--json]
```

It ends with 1 unless all of these hold: there is no error; the directory was read in full;
there is at least one connection; every connection has a name; and no name is the bare
"Uses". On every run it says how that went, between the counts and the last line:

```
Names are required: every connection has one, and none is only "Uses".
Names are required: 1 connection has no name, and 2 are named only "Uses". This run fails. `seefore check --full` lists them.
Names are required, and there is no connection to check. This run fails.
Names are required, and part of the directory was left out, as the problems above say. This run fails.
Names are required, and the records were not read, as the problems above say. This run fails.
```

- The fourth is followed by what was counted among the connections that were read, when any
  lacks a name: "Of the connections read, 1 has no name." The second names the directory
  when the command was given one, and leaves `--full` out when the run has it already.
- **A model with an honest gap does not pass.** Where nobody knows what a connection is for,
  the name stays out, and the pipeline fails until somebody finds out or the option is left
  off. Two of the eight trial models pass only so. The skill makes up no name to pass it.
- It asks for nothing else. A run cannot be made to fail on the other three counts: what
  they find is too often right as it stands. A team's own rules are stage 24.
- `--require-names` is an option of `seefore check` alone. With any other command it is a
  mistake in the options, and ends with 2.

## How much each check looked at

Every run of `seefore check` says, for each check, how many records it looked at and how many
it found, after the problems and before the last line:

```
Teleport
format 1, /home/sam/work/teleport/architecture

C4 checks, which count what the model lacks:
- A description: 96 things checked, 0 without.
- A technology: 60 apps, stores and components checked, 1 without.
- A name for a connection: 145 connections checked, 0 without.
- A name that is more than the word "Uses": 145 names checked, 0 that are only that word.
- A connection: 96 things checked, 4 with none.
`seefore check --full` lists each.

301 records read. No problems.
```

Until stage 9 this run also had one warning, for a view of more than 40 boxes. Stage 9 took
that check out.

- **A check that looked at nothing says so**: "0 connections checked, 0 without".
- **A check that was not run says so, and why**: "- A connection: not checked: part of the
  directory was left out, as the problems above say." When the marker cannot be read, none
  of the five is run, and each says "not checked, since the records were not read."
- **One is said as one**: "1 thing checked", "1 app, store or component", "1 that is only
  that word".
- **With `--full`** each line that found something is followed by the notes it found, one to
  a line, as a problem is written. A warning is not written a second time: it stands among
  the problems above. The line that sends the reader to `--full` is then left out. It is
  also left out when no note was found. It names the directory when the command was given
  one: "`seefore check --full --workdir=architecture` lists each.".
- The last line counts errors and warnings, as before. Notes are not in it.

As data, `--json` gains one key, `c4`:

| Key | What it holds |
| --- | --- |
| `complete` | Whether the directory was read in full |
| One key for each code | `severity` (`note` or `warning`), `checked` (how many records the check looked at, or `null` when it was not run) and `findings`: a list, each with `file`, `line`, `column` and `message`, in order of file |

With `--require-names` there is one more key, `requireNames`: `met` (true or false),
`complete`, `connections`, `unnamed` and `vague`. The three counts are 0 when the records
were not read.

The warning `connection-vague` is in `problems` as well, and in the count of warnings. The
notes are in `c4` alone.

## The skill

The `model` skill reads `seefore check --json` before a change and after it, and sets the two
beside each other.

- **A finding that its change made** is said to the person, once, with a question:

  | Finding | The skill asks | It may propose |
  | --- | --- | --- |
  | No description | What is this for? | A sentence that the answer or the facts bear out |
  | No technology | What is it built with? Do the facts say? | A technology record that exists, or a new one that the facts name |
  | No name, or the bare "Uses" | What does the one that acts do here? | A short name in the direction of the arrow. If nobody knows, the name goes out |
  | Connected to nothing | Is an exchange missing, is it passed through, or is it here for another reason? | The connection or the route that the facts name |

- **A finding that was there before** is left alone. An edit to one record is no order to
  clean the directory. The skill says how many there are, in one sentence, when the person
  asks or when a count rose.
- **When the person asks to go through the findings that are there**, the skill takes one
  check at a time, with the same questions and the same rules. Most findings stay. It says
  how many were mended, how many nobody knows, and how many lack nothing.
- **It never writes to make a finding go away**: no caller made up, no protocol put where a
  part's technology goes, no technology taken from the app a component is in, no purpose read
  out of a port's number, no connection for who runs a copy, no record taken out because it
  stands alone, no word such as "Unknown" in a field, and no name made up to pass
  `--require-names`.

## The page

Under "Problems", after the errors and warnings, the page shows the five lines of the set
with their counts, in the words of `seefore check`: both are written from one place. A line
that found something opens to what it found, each with its file and its words, and is closed
until the reader opens it. Above the lines the page says what a note is. Notes are not in
the number beside "Problems" in the sidebar: that counts errors and warnings, as before. The
warning for a bare "Uses" stands twice on the page, among the problems and under its line,
where `seefore check --full` writes it once.

No box and no arrow carries a mark for a finding. An arrow may stand for several connections,
and a mark on it for one of them would say too much.

## The commands

- **`seefore check`** prints the block above on every run, takes `--full` to list what was
  found, and takes `--require-names`. `--full` with `--json` prints the same data as `--json`
  alone.
- **`seefore list`** and **`seefore uses`**: no change in what they print or how they end.
  The number of warnings they give is that of `seefore check`, so a connection named "Uses"
  adds one.
- **`seefore --server`** serves the same counts with each reading, and the page follows the
  files as before.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| How "unknown" is said | By leaving the field out. No value, key or list stands for it |
| What a missing field is | A note: counted on every run, listed on request, never a problem. Of 118 found on the trial models, 10 could be mended from the facts, and a check that mostly cannot be answered teaches people to pass over every check |
| A technology, of what | Apps, stores and components. A component with none has its app's, and is counted only when the app names none: the trial showed that counting it always asked for an answer the skill forbids. Of the 12 pieces of infrastructure without one that were read, none could be given one from the facts. A person and a system have none |
| A technology on a connection | Not asked for. 348 of 997 connections name none, and of those read two in three are a file that is read or a process that is started, where there is no protocol to name |
| A vague name | The bare `Use` or `Uses` alone. One word in two forms, let in against the rule of stage 6a |
| Connected to nothing | A note, and only when the directory was read in full |
| What a pipeline can ask | Names, with `--require-names`. Nothing makes a run fail on the other counts. A model with an honest gap does not pass, and that is meant |
| The warnings of stages 3 to 7 | As they were. None fails a run. `view-crowded` least of all: a model made smaller to end it would be a worse model. Stage 9 took `view-crowded` out |
| A mark on a box or an arrow | None |

## Names this stage adds

One set, C4. Five codes: `description-missing`, `technology-missing`, `connection-unnamed`,
`connection-vague`, `element-unconnected`. One kind of finding, a note. One option of
`seefore check`, `--require-names`, and `--full`, which `seefore list` had. Two keys in what
`seefore check --json` prints: `c4` and `requireNames`. Nothing in the format.

## Skips

Of "Every stage ends the same way": part 5.

## Leaves out

A team's own rules, their severities and their exceptions: stage 24. A check of what changed
only: stage 17. Whether a description or a name is right. A score. A mend made by the tool.
A list of words. A way to set a finding aside.

## Against the research

Checked against `research/synthesis.md`.

Follows it:

- **"Allow 'unknown' while exploring; apply the stricter checks at review or publication"**
  (section 4). A field left out is allowed everywhere, and names can be asked for where
  pictures are published.
- **"'Not run' differs from 'ran and matched nothing'"** (section 4). Each check says how many
  records it looked at, and one that was not run says so.
- **"Whether a description or a label says the right thing still takes a reader"** (2.8). The
  checks read whether a field is there, and one literal word.
- **Hiding something in a view never narrows what is checked.** The checks read the model and
  no view.
- **Use stopped when enforcement stopped, and tools that nag are switched off** (2.2). Nothing
  here blocks by default, and four of five checks only count.

Departs from it, with the reason:

- **"Lines between containers name the protocol"** (2.8). No check asks a connection for a
  technology: on the trial models most connections without one have no protocol to name.
- **Severities that a team can set.** Left to stage 24, with the team's own rules.

Risks it takes on:

- **The warning has never fired on a model that was not mended first.** The trial models had
  their names mended at stage 4, so how often the bare "Uses" is right is not known.
- **A count nobody opens.** A note asks for nothing, and a gap that matters can wait in it.
- **What the checks cannot see.** Reading records the checks passed, the trial found, in
  every model, a description that only says its name again, a name as empty as "Uses" in
  other words, or a part that one connection touches and that is cut off all the same. A
  protocol written as a part's technology ends the note and leaves the gap.
- **Agents read the findings**, with nobody to ask. Where they needed a person's answer they
  left the record as it was.
