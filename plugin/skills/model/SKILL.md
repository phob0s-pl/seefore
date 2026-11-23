---
name: model
description: >-
  Add to, change or remove from the architecture kept in a seefore source directory. It writes
  the records of the model: people, systems, apps, stores, components, the connections between
  them, owners and technologies. Use when someone wants to describe, model, draw up or change
  a part of an architecture with seefore, to rename, move or split a part, or to remove one.
argument-hint: "[what to add, change or remove]"
allowed-tools: Bash(seefore *)
---

# Model an architecture

This skill writes the records of an architecture in a seefore source directory. A record is
one YAML file, `<folder>/<id>.yaml`. Its id is the name of its file and is not written inside
it.

What the person typed after the command: `$ARGUMENTS`

## 1. Find the directory and read what is there

Run each `seefore` command by itself, with nothing joined to it.

1. Run `seefore check --json --workdir=<folder>`.
   - If it answers with an `error`, read `error.code` and show its message. Only for
     `no-source-directory` say that there is no source directory and that the `init` skill
     starts one. For a wrong path or a folder that cannot be read, settle that first.
   - If it reports errors in the records, show them and ask whether to mend them first.
   - Its `directory` is the source directory. Every file you write goes under it.
2. Run `seefore list --json --workdir=<folder>` and read it. It holds each record whose own
   file has no error, whole, with no text cut. Everything you write must fit what is there
   already.
3. A file with an error is not in the listing, and its id is still taken. The problems of
   `seefore check --json` name each such file. Never write over one: show how you would mend
   it, and wait for a yes.

## 2. The records

Nine kinds, each in its own folder. Bold is required; write nothing else, and no key that is
not in this table.

| Folder | What it is | Keys, in the order they are written |
| --- | --- | --- |
| `people/` | A kind of person who uses the software, runs it or takes part. A role, not an individual | **`name`**, `only`, `description` |
| `systems/` | Software seen as one thing, ours or somebody else's | **`name`**, `only`, `description`, `external`, `owner` |
| `apps/` | Something that runs code | **`name`**, **`in`**, `only`, `description`, `kind`, `technology`, `owner` |
| `stores/` | Something that holds data | **`name`**, **`in`**, `only`, `description`, `kind`, `technology`, `owner` |
| `components/` | A piece inside an app | **`name`**, **`in`**, `only`, `description`, `technology`, `owner` |
| `infrastructure/` | A thing whose job is to pass exchanges on: a proxy, a gateway, a load balancer | **`name`**, `in`, `only`, `description`, `technology`, `owner` |
| `connections/` | One thing acts on another | **`from`**, **`to`**, `via`, `opens`, `access`, `name`, `only`, `description`, `technology` |
| `owners/` | A team, a role or an organisation that answers for what a part is and can be asked | **`name`**, `description` |
| `technologies/` | A thing with a name that a part is built with or an exchange is carried in | **`name`**, `description` |

- `name` is what people call it, on one line of at most 100 characters. On a connection it is
  the few words on the arrow: it starts with a verb and reads from `from` to `to`, such as
  "Takes the payment". Never "Uses".
- `description` says what the thing is responsible for, in a sentence or a few, in at most
  2,000 characters.
- `in` is the id of what the thing is part of: a system for an app; a system, or the app that
  keeps it, for a store; an app for a component; and for a piece of infrastructure the system
  it is part of, where it is part of one. Convention 10 says which.
- `only` says when the thing is there at all, in the words that read after "only", on one line
  of at most 100 characters: `only: in the hosted edition`. Leave it out for a thing that is
  always there. Convention 13 says what a condition is.
- `kind` of an app is one of `service`, `browser`, `mobile`, `desktop`, `command`,
  `function`, `job`. `kind` of a store is one of `database`, `files`, `cache`, `index`,
  `queue`, `topic`. Leave it out when none fits. `service` is a program that stays up; the
  source may say so in other words. Convention 8 tells a queue from a topic.
- `technology` is a list of ids of records in `technologies/`.
- `owner` is the id of a record in `owners/`.
- `from` and `to` are ids of a person, a system, an app, a store, a component or a piece of
  infrastructure.
- `via` is what the exchange passes through, in the order of travel, nearest to `from` first:
  a list of ids of pieces of infrastructure, apps, components or systems. Convention 7 says
  what goes in it.
- `external` is `true` on a system that the people this model is kept for cannot change.
  Leave it out otherwise. Convention 9 says what it means.
- `access` is `read`, `write` or `read-write`, on a connection that ends at a store. Leave it
  out when the facts do not say, and when the use is neither. Convention 11.
- `opens` is `to`, on a connection whose channel was opened from the far side. Leave it out
  otherwise, and on every connection that ends at a store. Convention 12.

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

How a record is written:

- The keys are in the order of the table, and each key starts a line. A list is in brackets
  on one line.
- Put text in double quotes when it holds a colon followed by a space, ends with a colon,
  holds a space followed by `#`, starts with a character YAML gives a meaning to, or could be
  read as a number or as `true`, `false` or `null`. Inside double quotes write `\"` for a
  double quote and `\\` for a backslash.
- When `description:` and its text would pass 96 columns, write a folded block: `description:
  >-`, and the text beneath it, indented by two spaces and no more. Start each sentence on a
  new line, and wrap a long sentence at a space, within 96 columns. Nothing in a block needs
  quotes. A blank line starts a new paragraph.
- Write no comments. `seefore check` refuses a file that holds one.

```yaml
description: >-
  Takes orders and says how far each has got.
  Turns away a basket over the limit: see issue #5377.
```

## 3. How to model

These conventions are the spec's, word for word. No check can hold them, so you do.

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
   - **A subscription to a part that sends.** Write the push, from the one that sends. When
     the other side opened the channel, the push says so with `opens: to` (convention 12).
     Write the opening as a connection of its own only when it has a purpose of its own, such
     as an agent that registers. What kind of channel it is stays in the description of the
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

<!-- hard-cases:start -->
7. **What a connection passes through.** A connection keeps its two ends: the one that acts
   and the one it acts on. What stands between them and passes the exchange on is named in
   `via`, in the order of travel, nearest to `from` first.
   - **Passing on** is routing, choosing where to send, pooling, changing the protocol,
     limiting, checking the caller and ending TLS.
   - **Ask of each exchange what the thing in between does with it.** It passes the exchange
     on: the thing goes in `via`. The exchange is about the thing itself, such as a deploy
     that reloads it, a check it makes of what stands behind it, or a list it fetches: the
     connection starts or ends at the thing. It answers with something of its own, such as a
     file it serves: that is work of its own, with a connection that ends at it.
   - **A piece of infrastructure** is a thing whose work for the software is passing on and
     nothing else, whoever made it and whoever runs it. A thing that also answers with
     something of its own is an app, and `via` still names it on what it passes on. Code
     inside an app that only passes on may stay a component of that app.
   - **`via` holds what is on the way every time this exchange is made.** A thing that is
     there only in some installs says so with `only`, and may be named: it is on the way
     whenever it is there. A thing that is there, and that the exchange only sometimes goes
     through, is not named. Where the ways differ, `via` holds what they share, in order.
     Leaving something out of `via` claims nothing.
   - A way that is taken only when a condition holds, such as a fallback, may be a connection
     of its own: its `only` says when, and its `via` holds what is on that way. When two ways
     shut each other out, each says when it is taken. When one is tried first and the other
     only if it fails, the second alone has `only`. Where the facts do not tell the ways apart
     so cleanly, the order of trying stays in words.
   - A connection has nothing from what it passes through. When the exchange itself is made
     only where a thing on its way is there, the connection says so in its own `only`.
   - A place on the way that each install fills with a product of its own is one piece of
     infrastructure, named for the place, with the products in its description.
   - What a person works in, such as a browser or a command line, is the one that acts, and
     not something on the way.
   - What a piece of infrastructure passes on is never written as one connection to it and
     another from it: that is one connection, with the piece in `via`.
   - `via` names a piece of infrastructure, an app, a component or a system. Never a store.
     Never an end of the connection, what an end is in, or what is in an end. On a connection
     from a thing to itself, what is on the way at both ends is named once.
   - A redirect that a browser carries, and a push down a channel that the other side
     opened, are not routes. Convention 1 says how each is written, and convention 12 how a
     push says who opened its channel.
8. **Queues and topics.** A queue is a store that one reader takes each message from. A topic
   is a store whose every subscriber gets each message. The one that puts in and the one that
   takes out each act on the store, as convention 1 says, and no arrow runs from a writer to
   a reader. So a queue or a topic is never in `via`. A stream that a second reader could
   follow is a topic, though one group reads it today.
   - **The broker is a technology**, the `technology` of each queue and topic it carries. It
     has no record of its own. A broker that has work of its own, such as a call it makes to
     check a login, is an app beside its topics. A connection that manages the broker itself,
     such as one that creates its topics, ends at that app, or at the store that holds what
     the facts do not tell apart.
   - A queue or a topic gets a store of its own when the facts name it and say who puts in or
     who takes out. The other side may be unknown. Those the facts do not tell apart may be
     one store, named for what it holds and never for the broker.
   - A queue inside one app, such as a buffer between two of its components, is not a store.
     It stays in the app's description. Convention 10 says when what an app keeps for itself
     is a store in that app.
   - A queue kept as rows in a database is a store of its own, of kind `queue`, with the
     database's product as its technology and the database named in its description.
   - A queue or a topic is in the system that answers for it, or in the app that keeps it
     (convention 10).
9. **An external system.** `external: true` says that the people this model is kept for cannot
   change the system: they use it as it is given.
   - It follows who makes the system, not who runs it. A product of ours that a customer runs
     is ours, and who runs a copy is said in the description.
   - It is not "outside this picture". That is worked out from the scope of a view, and
     nothing is stored for it.
   - It says nothing of a part inside the system, and it is no reason to move one. Code of
     ours that runs inside somebody else's software stays in that system where the model has
     it there: the system is external, and the part's description or its `owner` says that
     the part is ours.
   - One record that stands for ours and somebody else's alike has no mark, and its
     description says so. Split it when a connection belongs to one only.
   - A partner the team can ask is external and may still have an `owner`.
   - A system with no mark is not thereby ours: nobody has said.
10. **What is in what.** A store is in a system, or in the app that keeps it. A piece of
    infrastructure is in a system, or in none.
    - **An app keeps a store** when the data is in the app's own files or memory, each running
      copy of the app has its own, and nothing reaches it but through the app. One writer, one
      owner or one machine does not make a store an app's: a database server with one service
      in front of it is in the system.
    - A store that anything outside the app reaches is in the system. A backup that copies
      the files reaches them from outside, and so does another program that mounts them.
    - It must hold for every form the record stands for. A store that is a local file in one
      install and a shared database in another is in the system, and its description says so.
    - Work that an app keeps for itself in its own files, each copy its own, such as its own
      queue of jobs, is such a store when the facts name it. A queue kept as rows in a
      database server is in the system, and so is one that another app puts into or takes
      from.
    - State inside an app stays in the app's description. It is a store in the app when the
      facts name it and say what the app's record cannot carry: a format, a size, how long it
      is kept.
    - **A store is never in a store.** Databases on one server are each a store, and each
      description names the server: which server holds what is a matter of deployment. A queue
      kept as rows is a store of its own, as convention 8 says.
    - **A piece of infrastructure is in a system** when it is part of that system: those who
      answer for the system answer for it. That does not say where the piece runs, or who
      bought it. A piece that stands between systems, or that nobody has placed, is in none.
    - A store in an app, and a piece of infrastructure in a system, have its owner where they
      have none of their own.
11. **Reads and writes.** `access` says what a connection does to the data of the store it ends
    at: `read`, `write` or `read-write`.
    - At a queue or a topic, `write` puts a message in and `read` takes one out, whatever the
      product does beneath. Claiming the oldest job is a read.
    - A write that gets an answer back is still a write, and so is one that first looks
      whether it may. A connection whose words say that it reads and that it writes is
      `read-write`: so is one that keeps a store as its own. The name and the description
      together say which.
    - A watch for changes is a read. Making or changing the store itself, such as a
      migration, is a write.
    - A use that is neither, such as signing with a key that never leaves its store, has no
      `access`. Nor has one that nobody has said: leaving it out claims nothing.
    - **The verb stays in the name.** The name is what a person reads on the arrow, and
      "Reads" by itself says as little as "Uses".
12. **Who opened the channel, and what does not wait.** The arrow starts at the one that sends,
    as convention 1 says, whoever opened the channel.
    - `opens: to` says that the channel this exchange travels down was opened from the far
      side: by `to`, or by something in `via` that stands in front of `to`. A browser opens a
      stream and the server sends down it. An agent dials out and the service sends it work.
    - When a thing on the way opened a channel to the sender and then dials `to` itself, `to`
      opened nothing. `opens` is left out, and the description says who opened what.
    - It names a side and not another connection. The opening is a connection of its own only
      when it does something more, such as a login.
    - Left out, the one that sends opened the channel, or nobody has said. A webhook is not
      this: the sender dials. Nor is a dial that either side may make.
    - A connection that ends at a store has no `opens`: a store opens nothing.
    - **A put into a queue or a topic never waits for its reader.** A send that does not wait
      for an answer, with no queue between, says so in its name: "Emits audit events without
      waiting". A buffer inside the sender is not a store.
13. **A condition.** `only` says when a thing is there, or is used, at all. It holds the words
    that read after "only": `only: in the hosted edition`.
    - **The test:** could a reader find the thing missing, or never used, in an install that
      runs? An edition, a kind of install, a market, a setting, a licence, a consent, another
      way failing.
    - **Not a condition:** when in a run an exchange happens, such as every night, on a
      refund or when a backup is restored, which the name says. A check that is made each
      time, such as a check of rights. That a thing is planned, or on its way out, or came
      with a version: the model is of one version. The bare word "optional": say who chooses,
      or when.
    - "In production" may be written: it says when a part is there. It is no model of an
      environment.
    - It goes on the narrowest record it is true of as a whole. When a whole system is there
      only then, the system has it. An exchange that is made in one install only, between
      things that every install has, has it itself. When only some of the copies a record
      stands for are under it, the record has none, and its description says which.
    - The words do not start with "only", and have single spaces.
    - **What a thing has from another.** A part in a thing with `only` has it too. A connection
      has those of its two ends, and of what they are in. None is said again. A connection has
      nothing from what it passes through.
    - One condition is written in the same words everywhere. `seefore list` shows the wordings
      a directory has.
<!-- hard-cases:end -->

### What this format cannot say yet

<!-- cannot-say-yet:start -->
| The fact | Where it goes |
| --- | --- |
| A call that does not wait | The connection's name: "Emits audit events without waiting". A put into a queue or a topic never waits for its reader (convention 12) |
| The same code in several apps | A component in the app whose inside is modelled. Its description names the other apps |
| One program that runs as several apps | An app for each running part. Each description names the program |
| Several stores in one server | Each is a store, and its description names the server (convention 10) |
| State an app keeps inside itself, and what its components leave there for one another | The app's description, and the components'. No connection between the components for it. A store in the app only when the facts name it (convention 10) |
<!-- cannot-say-yet:end -->

### What to ask

Ask the person only where the answer changes what you write:

| When | Ask |
| --- | --- |
| A push, a webhook, a subscription, a tunnel, a redirect, a queue | What is the act, and who does it? Convention 1 then says where the arrow starts |
| An owner that has no record yet | Who says so, and is it a team, a role or an organisation that answers for what the part is? If the truth is a sentence, such as "nobody" or "two teams argue", leave `owner` out and put the sentence in the description |
| A part with no owner of its own, inside something that has one | Look at what it would take from above. If that would be false, say so to the person before you leave `owner` out |
| A technology whose name could mean two things, such as a product or a practice | Which is meant? When convention 5 settles it, do not ask: make the record |
| A connection between apps whose components are in the model | Which component, if you know? |
| A proxy, a gateway, a load balancer, a CDN, a pooler, a relay | Is passing on its whole job? Yes: a piece of infrastructure, in `via`. No: an app with a connection for its own work, and in `via` for what it passes on |
| A broker, a bus, a queue, a topic, a stream | Which queues or topics do the facts name? Who puts into each and who takes out? Does one reader take a message, or does every subscriber get it? |
| A new system, or one with nothing in it and no owner | Can the people this model is kept for change it? If not, it is external |
| An app that keeps files or a database of its own | Does each running copy of the app have its own? Does anything outside the app reach the data but through the app? Is it worth a record? Only for yes, no and yes is it a store in the app. Else it is a store in the system, or a sentence of the app's description |
| A database | Is this the data or the server? The data is the store. What else is on that server goes in the description |
| A piece of infrastructure | Is it part of one system, or does it stand outside every system? |
| A connection to a store whose words do not say what it does there | Does it read, write, do both, or neither? Leave `access` out for neither, and when nobody knows |
| Something is sent that nobody asked for just then | Which side opened the channel it goes down? |
| A send that does not wait for an answer | Is there a queue or a topic between? Then that is a store. If not, the name says so |
| A part or a connection the facts call optional, or tie to an edition, an install, a setting or a consent | Could a reader find it missing in an install that runs? When is it there? Offer the wordings the directory already has, from "Conditions" in `seefore list`, before you write a new one |
| A thing on the way that is not always there | Is it missing in some installs, or is it there and this exchange sometimes goes round it? Missing: `only` on the thing, and it may be in `via`. Round it: the other way is a connection of its own |

Never fill in what nobody said. No owner, technology, kind or description from your own
guess. A record with only its required keys is a good record. A responsibility or a part's
description can state a connection: use the most exact end it gives, and the system when it
gives no more.

## 4. Ids

- Lowercase letters and digits in groups joined by single hyphens, starting with a letter, at
  most 80 characters: `order-events`.
- Not an id: `true`, `false`, `null`, `seefore`, and the names Windows keeps for devices
  (`con`, `prn`, `aux`, `nul`, and `com` or `lpt` with one digit).
- An id is used once in the whole directory, whatever the folder.
- An id is given once and never changed. Renaming a thing changes its `name`.
- Give an app or a store an id that says what it is for: `session-cache`, not `redis`. Then
  the technology can have the product's own name as its id, `redis`.
- Give a connection an id that reads as its sentence: `checkout-takes-payment`. When nobody
  said what it is for, name it by its two ends: `storefront-to-order-api`.
- Before making a record, look in the listing for one that is the same thing under another
  name. Ask when you are not sure. Use the owner and the technology records that exist.

## 5. Show it, then wait

Before writing, show the person what you will write, change or remove.

- For up to twenty files, show each with its path and its content.
- For more, show the count for each folder and one line for every record you will write,
  change or remove: a connection as its sentence, any other record by its id, its name and
  what it is in. Show three of the files in full, of the kinds that are among them. Offer any
  other file.
- Always show each removal, each move and each open choice, however large the change.

Then wait for a yes to what you have shown. A go-ahead given before a removal, a move or an
open choice was shown does not cover it. When the person has said yes to exactly this, do not
ask again.

Settle the ids first. Write owners and technologies, then people, systems and infrastructure,
then apps and stores, then components, then connections. Run the check after each whole
batch.

## 6. Change, move, split and remove

- **Rename.** First run `seefore uses <id> --workdir=<folder>`. Change `name`; the id and the
  file's name stay. Then show each record that may speak of the thing, those that stay and
  those that go with it, and offer to mend its text.
- **Move.** Change `in`. What is inside the thing follows it. So may the owner: a part with no
  `owner` of its own takes it from what it is in. And so may when it is there: a thing has the
  `only` of what it is in, and a connection that of its ends. Look in `conditions` of
  `seefore list --json` before and after, and say which conditions the thing, what is inside
  it and their connections gain and lose. Look in `ownership` of `seefore list --json`
  for what the thing and the parts inside it take from above, and say whose each will be after
  the move. Write the old owner on the thing itself when the person says it stays. The same
  holds for a split.
- **A connection is one exchange.** Keep its file while it is the same exchange, whichever
  part now makes or takes it: change `from` or `to`. Its id may then name a part it no longer
  touches, as an id may keep an old name. Write a new connection only for a new exchange. The
  test: would a flow step that pointed at it still be true?
- **Split.** Say which responsibility goes on under the old id, and give each new part a new
  id. Show where each connection goes. When both parts now make an exchange, the old
  connection stays with the part that goes on, and the other part gets a new one.
- **Merge.** The reverse: say which id goes on, and keep each exchange that is still its own.
- **Turn an app into a piece of infrastructure**, or the other way. Move its file to the other
  folder under the same name, so that its id stays and every record that names it still does.
  A piece of infrastructure has no `kind`: take it out, and move or remove what was inside the
  app first. It keeps its `in` when it is part of that system, and with it the owner it has
  from there. Take `in` out when it is part of no system, and then write its `owner` on it if
  it had one from its system. An app needs its `in`.
- **Put a store into the app that keeps it**, or back into the system. Change `in`. First see
  who reaches the store: every connection in `seefore list --json` whose `from` or `to` is the
  store. When the other end of one is outside the app, the store is not the app's alone, and
  it stays in the system (convention 10). The app itself, a component in it and another store
  it keeps are inside. `seefore check` says the same afterwards, as `kept-store-reached`. Say
  what the store now goes with when the app is removed, and whose it is.
- **Put a piece of infrastructure into a system**, or take it out. First run
  `seefore uses <id> --workdir=<folder>` on the piece. A connection that names it in `via` and
  starts or ends at that system itself would then pass through a thing inside its own end,
  which is an error: give such a connection the part it starts or ends at first.
- **Remove.** First run `seefore uses <id> --workdir=<folder>`. It answers in four lists: what
  goes with the thing, what must go or change, what would be left behind, and which records
  may speak of it. Show them. Say for each record what you will do: remove it, change it, or
  leave it. Whether a record that is left behind goes too is the person's choice. Before a
  record goes, move each fact it holds that is still true into a record that stays. Wait for
  a yes, then make all of those changes together.

## 7. Lift what a description says into a field

A model written before a field existed says the fact in words. When the person asks for it,
or when you meet such words while changing a record, propose to lift them: what a connection
passes through into `via`, a queue or a topic into `kind`, whose a system is into `external`,
what keeps a store or holds a piece of infrastructure into `in`, what a connection does to a
store into `access`, who opened a channel into `opens`, and when a thing is there into `only`.

- Lift only from the words of the record, never from your own guess.
- Propose one route at a time. Show the route by name, in order; each new piece of
  infrastructure as a file; and for each connection the sentence the lift rests on, quoted,
  and its description as it would read afterwards.
- Show kinds and marks each as a table: the record, the value, the words it rests on, quoted.
- The person answers each: yes, no, or yes but for these. Ask an open choice on its own:
  infrastructure or an app, the order when the words give none.
- Take out of a description only the words the field now says in full. A sentence that says
  more stays whole: when a thing is on the way, what it does to this exchange. When nothing
  is left that says anything, take the description out.
- The summary of section 5 for a large change does not stand in for this. Every lift is
  shown, however many there are.

When several kinds of fact are lifted, go in this order:

- **What is in what** first, since a thing has a condition from what it is in. A store into
  the app that keeps it and a piece of infrastructure into its system, one at a time. Show
  each with its question, with what then goes with it when the app or the system goes, with
  whose it then is, and with the conditions it and its connections gain or lose. Section 6
  says what to look at before each move.
- **`access`** as one table for each store: who acts, the name, the value, so that the person
  reads a store's readers and writers together. Take the connections that end at a store from
  `seefore list --json`. Leave out a use that is neither, and say so.
- **`opens`** as one table: the connection, and the words that say who opened the channel.
- **`only`** on parts first, then on connections, so that you can show "its end says this
  already" and not write it again. One table for each wording: the record, the sentence
  quoted, the text as you would write it. Ask about a bare "optional"; never lift it as it
  stands. Use one wording for one condition. Where a sentence says the condition and
  something more, show it before and after: the words of the condition come out, and what
  more it says stays. Words in a connection's description that say a condition its end has
  are said already: they come out too. So does a bare "Optional" beside a condition that now
  says who chooses.
- Then the routes that `only` now allows: a thing that only some installs have, named in
  `via` (convention 7).

## 8. Check it

Run `seefore check --workdir=<folder>`. Mend every error it reports in a file you wrote, and
run it again. For a warning, say what it is and ask. Do not change a file you did not mean to
change.

`view-crowded` is the one warning that asks nothing. When your change takes a view over the
limit, or adds to a view that was over it in the check of section 1, say so in one sentence:
which view, how many boxes, that the page draws it as a map, and that pointing at a box reads
it. Do not propose merging records or leaving any out to get under the limit. A system with
many real parts has many boxes.

## 9. Say what happened

Tell the person which files were written, changed and removed, in words: what was added,
renamed, moved or removed, by name. Say what the check said. Say that nothing was committed.

Do not commit and do not stage. That is the person's step.

## Never

- Never change an id or the name of a record's file.
- Never write a key that is not in the table of section 2.
- Never write a fact that nobody stated.
- Never write a comment in a record.
- Never write outside the source directory.
