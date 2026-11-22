# Basic modelling

What a model holds: the people, the systems, what runs and what holds data, the pieces inside,
and what acts on what. This is stage 4 of `plan.md`. It builds on `source-directory.md`.

## What it is

A model is the records of a source directory. Each record is one YAML file,
`<folder>/<id>.yaml`, and its id is the name of its file. This stage says which folders there
are, what a record of each holds, and what must be true across records.

The model follows C4. Two of its words are different here: what C4 calls a container is an
**app** when it runs code and a **store** when it holds data, and what C4 calls a relationship
is a **connection**.

## The records

Nine kinds, one folder each. The ninth, `infrastructure/`, came at stage 6a (`hard-cases.md`).

| Folder | What it is | C4's word |
| --- | --- | --- |
| `people/` | A kind of person who uses the software, runs it or takes part. A role, not an individual | Person |
| `systems/` | Software seen as one thing, ours or somebody else's | Software system |
| `apps/` | Something that runs code | Container |
| `stores/` | Something that holds data | Container |
| `components/` | A piece inside an app | Component |
| `infrastructure/` | A thing whose job is to pass exchanges on: a proxy, a gateway, a load balancer | none |
| `connections/` | One thing acts on another | Relationship |
| `owners/` | A team, a role or an organisation that answers for what a part is and can be asked | none |
| `technologies/` | A thing with a name that a part is built with or an exchange is carried in | none |

## The fields

Ten names. `via` and `external` came at stage 6a.

| Field | On | What it holds | Required |
| --- | --- | --- | --- |
| `name` | every record | What people call it. One line of 1 to 100 characters. On a connection, the few words on the arrow, starting with a verb | yes, but not on a connection |
| `description` | every record | What it is responsible for. Text of 1 to 2,000 characters | no |
| `in` | app, store | The id of the system it is part of | yes |
| `in` | component | The id of the app it is inside | yes |
| `kind` | app | `service`, `browser`, `mobile`, `desktop`, `command`, `function`, `job` | no |
| `kind` | store | `database`, `files`, `cache`, `index`, `queue`, `topic` | no |
| `external` | system | `true`: the people this model is kept for cannot change the system | no |
| `technology` | app, store, component, infrastructure, connection | A list of ids of technologies, none twice | no |
| `owner` | system, app, store, component, infrastructure | The id of an owner | no |
| `from`, `to` | connection | The id of a person, a system, an app, a store, a component or a piece of infrastructure | yes |
| `via` | connection | What the exchange passes through, in the order of travel: a list of ids of pieces of infrastructure, apps, components or systems | no |

- A key that is not in this table is an error.
- Only a name and what a thing is in are required, and on a connection only its two ends.
  "Unknown" is allowed while exploring: a missing description or technology is for the C4
  checks of stage 8.
- `service` is a program that stays up. The source may say so in other words.
- An owner may be left out everywhere, and a whole model may have none. Who answers for a part
  can be said later. Left out, the owner of a thing is that of what it is in. A person has no
  owner.

## How a record is written

`apps/order-api.yaml`:

```yaml
name: Order API
in: shop
description: Takes orders and says how far each has got.
kind: service
technology: [go]
owner: shop-team
```

`connections/checkout-takes-payment.yaml`:

```yaml
from: checkout
to: card-provider
name: Takes the payment
technology: [https]
```

- The keys are written in this order, and each key starts a line: `from`, `to`, `via`, `name`,
  `in`, `description`, `kind`, `external`, `technology`, `owner`. A record has only some of
  them.
- A list is a set: `[go, postgresql]` and `[postgresql, go]` say the same.
- A description too long for one line is a folded block. Each sentence starts a line, and
  nothing in the block needs quotes. The limit of 2,000 characters counts the text as it is
  read, not as it is laid out.
- A record holds no comments (`source-directory.md`).

```yaml
description: >-
  Takes orders and says how far each has got.
  Only in the hosted edition: see issue #5377.
```

## What must be true across records

Each of these is an error, reported at the value that is wrong.

| Rule | Problem code |
| --- | --- |
| An id names one record in the whole directory, whatever the folder (stage 3) | `id-twice` |
| `in`, `from`, `to`, `owner` and each id in `technology` name a record that exists | `reference-unknown` |
| `in` of an app or a store names a system, and `in` of a component an app | `reference-wrong-kind` |
| `from` and `to` name a person, a system, an app, a store or a component | `reference-wrong-kind` |
| `owner` names an owner, and each id in `technology` a technology | `reference-wrong-kind` |
| A connection that starts at a store ends at a store | `store-acts` |

A record whose own file is broken still exists for the others, so one broken file does not
make every reference to it an error. Nothing can be inside itself at this stage: an app and a
store are in a system, and a component is in an app.

Two more are warnings. The model can be read, and says something the conventions call
doubtful.

| Check | Problem code |
| --- | --- |
| Two connections have the same ends and the same name | `connection-twice` |
| A connection says higher up, in the same words, what another says beneath it | `connection-repeated-above` |

## The conventions

Six. No check can hold them, so the writer does. The skill carries them word for word: the
text between the marks below is copied into it by `scripts/sync-skill.mjs`, and the check of
this repository fails when the two differ.

<!-- conventions:start -->
1. **The arrow.** A connection goes from the one that acts to the one it acts on: the one
   that makes the call, sends the message, or reads or writes the store. A reply is not a
   connection. What the other end later sends in a call of its own, such as a call back, is
   its own act and a connection from it.
   - **A store** acts on nothing but another store. A queue, a topic and a store's feed of
     changes are stores here: the one that puts a message in and the one that takes it out
     both act on the store, even when the platform wakes the taker. This comes before the
     rule for a subscription. Topics that the facts do not tell apart are one store. When
     one store copies itself to another or hands on to it, the connection goes from the
     store it starts at.
   - **A subscription to a part that sends.** Write the push, from the one that sends. Say
     who opens the channel when the arrow could be read as the sender dialling. Write the
     opening as a connection of its own only when it has a purpose of its own, such as an
     agent that registers. Opening it only to receive is said in the description of the
     push.
   - **A redirect.** When software sends a person's browser on to another place, write it
     from the software that sends the browser on, whoever supplied the address, and say that
     the browser carries it. A call that fetched the address is a connection of its own.
     Write the way back only when it is stated. What the person does there, such as signing
     in or paying, is the person's own act.
   - **Two parts that meet only in a store or a file** do not act on each other. Each has
     its connection to the store, and there is none between them. When the facts name the
     store or the file and it has no record, write one.
   - **A connection from a thing to itself** says that one copy acts on another: two
     instances of one part, or two people of one role. Say which acts on which.
2. **Ours and somebody else's.** Somebody else's software that the team calls is a system
   like any other. Usually nothing is written inside it; something may be, when the team uses
   it directly, such as another team's database that it reads. Whose a system is goes in its
   description, in `external` when the team cannot change it (convention 9), and in `owner`
   when it is somebody the team can ask. A system with nothing in
   it is drawn as one box: it may be somebody else's, or ours and not described yet. A cloud
   service the team controls is an app or a store of its own system, with the product as its
   technology; one it only calls is a system of its own. What is outside a picture is worked
   out from the scope of the view, and nothing is stored for it.
3. **One record or several.** Copies and variants are one record until their connections
   differ: separate them when a stated connection belongs to one and not to the others.
   Where the difference is one of condition, such as an edition, an environment or a
   setting, keep one record and say the condition on the connection. How many of them run is
   a fact for the description. One record may stand for many of a kind, with a name in the
   plural and the number in the description. A connection stands for one exchange with one
   purpose: write one for each purpose, and leave its `name` out when nobody said what it is
   for. Two acts are one purpose when the facts state them as one step. They are two when
   one can happen without the other.
4. **The level.** A connection is written at the lowest level known at each end: the lowest
   part that the facts name and the model has a record for, down to a component. It counts
   for what its ends are in. One written higher up between the same two things is a
   summary. Write it only when its sentence says more than the ones beneath it.
5. **A technology** is a thing with a name that a part is built with or an exchange is
   carried in: a language, a framework, a library, a product, a protocol, a query language
   or a data format. The test: another maker would have to use it, read it or speak it. A
   style such as REST, an algorithm, a setting of a protocol and a version of a product are
   not: they go in the description. A protocol with a number in its name, such as HTTP/2, is
   one. A phrase that says how an exchange travels, such as "by hand" or "a link in the
   browser", is not one. It goes in the description of the connection.
6. **An owner** is the team, the role or the organisation that answers for what a part is,
   and that the team keeping the model can ask. Who runs a copy goes in the description. A
   role that both acts and answers is two records: a person and an owner. An owner needs a
   source, like any other fact.
<!-- conventions:end -->

## What it cannot say yet

Stage 6a gave three of the hard cases a field: what a connection passes through, a queue or a
topic, and an external system (`hard-cases.md`). Stage 6b adds the others. Until then:

<!-- cannot-say-yet:start -->
| The fact | Where it goes |
| --- | --- |
| Reads or writes | The verb of the connection's name: "Reads the orders" |
| A part or a connection that is not always there | Its description says when, in ordinary words, on the narrowest record it is true of, and not again on that record's connections. In the first sentence when the part or the arrow would be misread without it |
| A call that does not wait | The connection's description |
| The same code in several apps | A component in the app whose inside is modelled |
| State an app keeps inside itself, and what its components leave there for one another | The app's description, and the components'. No connection between the components for it |
<!-- cannot-say-yet:end -->

## The commands

`seefore check` now reads the eight folders and reports the problems above, each with its
file, line and column. Nothing about how it is called has changed.

```
seefore list [--workdir=<directory>] [--full] [--json]
```

prints the model in words, to read before the viewer exists.

- The people; the systems that have an app or a store in them, each with its apps and stores
  beneath it and the components beneath each app; the other systems; the connections; the
  owners; the technologies. Each heading says how many.
- A connection stands under the person, the system, the app or the store it starts from, and
  a component's under its app. A component at the far end is shown with its app: "Order API /
  Checkout".
- A description shows its whole first sentence. `--full` shows all of it, beneath the record.
- Lines wrap at 96 columns, or at the width of the terminal when that is less. A word, an id
  or a link longer than that is not broken, and the two lines at the top, with the name and
  the directory, are not wrapped.
- An owner is shown on the record that names it. It holds for what is beneath, until a part
  names its own.
- A part whose `in` names a record with an error is listed last, under a heading that says
  so. A record with an error in its own file is left out, and the last line says how many
  were read and how many are listed.
- With `--json` it prints the model as data, with no text cut, and `ownership`: for each part
  that has an owner, the owner and the record it comes from.

```
seefore uses <id> [--workdir=<directory>] [--json]
```

is run before a removal and before a rename. Let "the thing" be the record with that id and
all that is inside it. It answers in four lists, and counts records:

| List | What is in it |
| --- | --- |
| Goes with it | What is inside the thing, and each connection with both ends in it |
| Must go or change | Each connection with one end in the thing. For an owner or a technology, each record that names it |
| Left behind | A part that has a connection now and would have none if those connections went. An owner or a technology that only those records name |
| May speak of it | Another record whose `name` or `description` holds the thing's name, its id, or its id with spaces for hyphens |

- The last two are suggestions. What is left behind may well stay, and a mention is a place
  to read, not to replace. Each heading says what it assumes: "If they go, 1 record is left
  with no connection".
- For an owner it also says how many parts take it from what they are in, since their files
  hold no `owner` to change.
- A mention points at the key, `name` or `description`, and gives the words found. A name of
  one or two characters is looked for as it is written, capitals and all, and an id that
  short is not looked for.
- Records that go with the thing and speak of it are listed apart: a rename leaves them, so
  they are to be read then.
- When the directory has errors it prints what is known, says that other uses may exist, and
  names nothing as left behind.
- With `--json` it prints the same as data: `goes`, `changes`, `left`, `inherited`, `mentions`,
  each mention saying whether its record goes, and `complete`, which is false when not every
  file could be read.
- A path is given from where the command was run, and in full when that would start with
  `..`. The same holds for `seefore check`.
- An id that names no record ends with exit code 2, and with `error.code` `no-such-record`
  under `--json`. So does an id that two records share, with `id-twice`: one of them must get
  another id before a removal or a rename can be looked at.
- Where a message names another `seefore` command to run, it gives the `--workdir` that makes
  the command work from where the person stands.

## The skill

The plugin gains one skill, `model`. It adds, changes, renames, moves, splits and removes
records.

- It runs `seefore check --json` and then reads `seefore list --json`, and asks only where an
  answer changes what it writes. A file with an error is not in the listing; its id is still
  taken, and the skill does not write over it.
- It shows every file it will write, change or remove and waits for a yes to what it has
  shown. For more than twenty files it shows the count for each folder, a line for each record
  and three files in full.
- Before a removal and before a rename it runs `seefore uses`, and shows what would break,
  what would be left behind, and which text may go stale.
- It keeps a connection's file while the exchange is the same, whichever part now makes or
  takes it.
- It runs `seefore check` afterwards. It never changes an id, and never writes a fact that
  nobody stated.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| The words for C4's "container" | "App" and "store" (the owner). The folder says which, so `kind` can be left out while exploring |
| The word for C4's "relationship" | "Connection" (the owner) |
| What a thing is part of | One field, `in`, on an app, a store and a component |
| What a connection holds | Two ends, a name for the arrow and a description, with an id of its own |
| What a connection is | One exchange with one purpose, so that a later flow step can point at it. It keeps its id when another part takes the exchange over |
| What an arrow means | Who acts, not which way the data moves. That holds where no packet starts: at the software that chooses where a browser is sent, and at the reader of a queue or a topic |
| Owner | A record, named by id (the owner). Optional everywhere; a person has none |
| Technology | A record, named by id (the owner): a thing with a name. A library, a query language and a data format are; a style, an algorithm, a setting and a version are not |
| Somebody else's system | No stored mark. Whether one is stored is settled at stage 6a |
| A connection higher up | A summary, written only when it says more than the ones beneath it |
| What sits in between, and a condition | Ordinary words in a description, in no fixed form, until stages 6a and 6b. Those stages propose each lift to a person |
| Kinds | Short fixed lists, not required. `service` for a program that stays up |
| Comments | None in any file seefore reads. A rule of stage 3, added at this stage |
| A large change | The skill shows a summary and three files, not every file |

## What the trial changed

Eight modellers wrote the first slice of the eight trial systems as files: 1,919 records, all
of which pass the check. The note is `research/trial/stage-04.md`. The shape of the records
held: no folder, field or kind changed. One rule of YAML was added, no comments, and nine more
things around the format changed.

| What did not fit | What was done |
| --- | --- |
| Text after a space and `#` was lost with no message | A comment is an error |
| The skill retold the conventions and got two of them wrong | The skill carries the spec's text, and a check holds the two together |
| `seefore uses` named 29 of the 66 files that eight removals touched | Four lists: what goes, what must change, what is left behind, what may speak of it |
| Five cases of the arrow were written in different ways | Convention 1 settles them |
| A thing in between was written four ways | One connection end to end; a record only for work of its own |
| The listing cut 915 of 1,429 descriptions and had one flat list of connections | Whole first sentences, connections under what they start from, wrapped lines, `--full` |
| A description was one long line | A folded block |
| The skill had no word on a first model, a split or a moved connection | It has |
| Some messages spoke the parser's words | They say what to do |
| The line for a technology and for an owner was drawn in different places | Conventions 5 and 6 |

Accepted as it is, for stages 6a and 6b: what a connection passes through and a condition are
words in a description; a queue or a topic is a store with no kind; a store cannot be in an app;
code cannot be in several apps. New for those stages, from this trial: several stores in one
server; who opens a channel as against who sends down it; who makes a part as against who runs
it.

## Names this stage adds

Eight folders of records: `people`, `systems`, `apps`, `stores`, `components`, `connections`,
`owners`, `technologies`. Eight fields on a record: `name`, which the marker has had since
stage 3, and seven new ones, `description`, `in`, `kind`, `technology`, `owner`, `from`, `to`.
Eleven kinds: seven of an app and four of a store. Two commands, `seefore list` and
`seefore uses`, and one flag, `--full`. One skill, `model`. One problem code more in stage 3's
list, `yaml-comment`, and six of this stage: `reference-unknown`, `reference-wrong-kind`,
`store-acts`, `connection-twice`, `connection-repeated-above`, and `no-such-record` for a
command that could not start. `id-twice`, a problem code of stage 3, is now also a reason for
`seefore uses` not to start.

## Leaves out

Queues and topics, what sits in between, reads and writes, calls that do not wait, conditions,
shared code, groups and infrastructure: stages 6a and 6b. Views: stages 5 and 9. Kinds of the
user's own. Deployment. Any required depth.

## Against the research

Checked against `research/synthesis.md`.

Follows it:

- **A typed model apart from its views** (1.1; section 4, stage 2): person, software system,
  container and component, with one-way relationships. A container is in a system and a
  component in a container.
- **A small typed core** (1.5): eight folders, eight fields, fixed kinds. App and store are
  typed names for the two sorts of container, which the research calls typed aliases.
- **Identity that never changes, apart from name and parent** (section 4, stage 2). What a
  thing is in is a field, so a move keeps the id. A connection keeps its id when another part
  takes the exchange over.
- **Element content: name, kind, responsibility, technology, owner** (section 4, stage 2).
- **Relationship content: two ends, a phrase that reads in the arrow's direction, a
  protocol** (2.8, notation). The name is the phrase; the technology is the protocol.
- **One direction convention** (section 4, stage 2), written down and checked where a store
  starts.
- **Stored once at the lowest level, and summarised above** (2.8, pro tips): "Where several
  exist between a pair, summarise them, and keep the underlying ones reachable."
- **No internal or external flag** (2.7; section 4, stage 2): what is outside a picture is
  worked out from the scope of the view.
- **"Unknown" allowed while exploring** (section 4, stage 2): little is required.
- **A model lives when it has an owner** (1.15), without a copied team directory (2.7): an
  owner record has a name and a description and no members.
- **Keep a field only when somebody decides something with it** (1.13): the stage has the
  eight fields a listing and a picture read, and no more.

Departs from it, with the reason:

- **The arrow is "who acts".** The research says to choose between dependency and the
  movement of data. This is neither: it is the caller for a call and the sender for a push.
  The trial of the drafts turned against both pure forms.
- **An owner and a technology are records.** The research asks for an owner "or a reference
  to one", and says nothing of technology as a record. Both are the owner's decisions: a slip
  in a name is then an error, and a rename is one file. The cost is a record before a name can
  be used.
- **A relationship higher up is allowed, as a summary.** The plan first said "written once,
  at the lowest level known". A picture needs words for an arrow that stands for several, and
  the research says to summarise.
- **No tags and no links** (section 4, stage 2 lists both). A free tag is a kind of the user's
  own by another door. Links come with decisions and evidence, at stages 20 and 22.
- **An unknown key is an error**, where the research prefers "a few typed records and open
  properties" (section 4, stage 6). Every later change to the format is then a known one.
- **No comments in a record.** The research does not speak of them. A comment is read by no
  tool, and a `#` after a space cut values short in the trial.

Risks it takes on:

- **Nobody outside the project has drawn an arrow by this convention.** It is the one choice
  here that no script can change later. The trial settled about 790 of 918 arrows by it at
  once; the cases it left open are now in convention 1.
- **Many one-line files.** An owner and a technology are each a file that holds a name: 372
  technology records in the trial, 331 of them a name alone.
- **Ids that meet, and ids that drift.** An id is used once in the whole directory, so an app
  called `redis` and the technology Redis cannot both have that id. The skill names an app or
  a store for what it is for. After a rename or a split an id may say an old name.
- **Nothing typed tells ours from somebody else's.** Until stage 6a that is in descriptions.
- **A route and a condition are words until stages 6a and 6b.** In the trial about one
  connection in seven passes through something, and one in four holds only under a condition.
