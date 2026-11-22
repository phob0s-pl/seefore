# Hard cases

Facts of a real system that a description could only say in words. Stage 6a of `plan.md` gave
three of them a field: what a connection passes through, a queue or a topic, and whose a system
is. Stage 6b gives five more: what an app keeps, what a piece of infrastructure is part of,
what a connection does to a store, who opened the channel it travels down, and when a thing is
there at all. This page builds on `modelling.md` and `diagrams.md`.

## What it is

Stage 6a adds one kind of record, two fields and two kinds of store. Stage 6b adds three fields
and lets `in` name two things more. Each has a convention, a check where a check can tell, a
question the skill asks at the moment of modelling, and a place in the picture.

Stage 6a:

| What | On | Form |
| --- | --- | --- |
| `infrastructure/` | a record of its own | A thing whose job is to pass exchanges on: a proxy, a gateway, a load balancer. `name`, and where known `description`, `technology`, `owner` |
| `via` | a connection | A list of ids, in the order of travel, nearest to `from` first. Written after `to`. The one list whose order means something |
| `kind: queue`, `kind: topic` | a store | A queue: one reader takes each message. A topic: every subscriber gets each |
| `external: true` | a system | `true` is its only value. Written after `description` |

`infrastructure/proxy.yaml`:

```yaml
name: HTTPS proxy
description: Ends HTTPS on Desk's host and passes requests on.
technology: [nginx]
```

`connections/staff-browser-asks-desk.yaml`:

```yaml
from: staff-browser
to: desk
via: [proxy]
name: Asks for pages and sends edits
technology: [https]
```

`systems/card-provider.yaml`:

```yaml
name: Card provider
description: Takes card payments.
external: true
```

Stage 6b:

| What | On | Form |
| --- | --- | --- |
| `in`, naming an app | a store | The app that keeps the store. A store is in a system, or in the app that keeps it |
| `in` | a piece of infrastructure | The system the piece is part of. It may be left out: a piece may be in no system |
| `access` | a connection that ends at a store | `read`, `write` or `read-write`. Written before `name` |
| `opens` | a connection that does not end at a store | `to` is its only value: the channel was opened from the far side. Written before `name` |
| `only` | every record but an owner and a technology | When the thing is there at all. One line of 1 to 100 characters: the words that read after "only". Written before `description` |

`stores/drafts.yaml`:

```yaml
name: Drafts
in: desk
description: Edits that are not yet saved, in a file beside Desk.
kind: files
```

`connections/desk-keeps-drafts.yaml`:

```yaml
from: desk
to: drafts
access: read-write
name: Keeps edits that are not yet saved
```

`infrastructure/office-proxy.yaml`:

```yaml
name: Office proxy
in: archive
only: in the head office
description: Stands before the HTTPS proxy for staff in the head office.
```

`connections/desk-tells-staff-browser.yaml`:

```yaml
from: desk
to: staff-browser
via: [proxy, office-proxy]
opens: to
name: Says when a job is done
technology: [https]
```

The last says two things more than its ends. The staff browser opened the channel, and Desk
sends down it. And the office proxy, which is there only in the head office, is on the way
whenever it is there.

A directory that uses any of these needs a seefore of that stage or later. An older one reports
each as an error and leaves those records out, so its listing and its pictures are of another
model.

## The conventions

Seven more, after the six of `modelling.md`: 7 to 9 came at stage 6a, 10 to 13 at stage 6b. The
skill carries them word for word.

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
     of its own: its `only` says when, and its `via` holds what is on that way.
   - A place on the way that each install fills with a product of its own is one piece of
     infrastructure, named for the place, with the products in its description.
   - What a person works in, such as a browser or a command line, is the one that acts, and
     not something on the way.
   - What a piece of infrastructure passes on is never written as one connection to it and
     another from it: that is one connection, with the piece in `via`.
   - `via` names a piece of infrastructure, an app, a component or a system. Never a store.
     Never an end of the connection, what an end is in, or what is in an end.
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
     It stays in the app's description.
   - A queue kept as rows in a database is a store of its own, of kind `queue`, with the
     database's product as its technology and the database named in its description.
   - A queue or a topic is in the system that answers for it.
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
    - A store that anything outside the app reaches is in the system.
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
    - A write that gets an answer back is still a write. One act that takes what is there and
      puts something new in its place is `read-write`.
    - A use that is neither, such as signing with a key that never leaves its store, has no
      `access`. Nor has one that nobody has said: leaving it out claims nothing.
    - **The verb stays in the name.** The name is what a person reads on the arrow, and
      "Reads" by itself says as little as "Uses".
12. **Who opened the channel, and what does not wait.** The arrow starts at the one that sends,
    as convention 1 says, whoever opened the channel.
    - `opens: to` says that the channel this exchange travels down was opened from the far
      side: by `to`, or by something in `via` on its behalf. A browser opens a stream and the
      server sends down it. An agent dials out and the service sends it work.
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
      runs? An edition, a kind of install, a setting, a licence, a consent, another way
      failing.
    - **Not a condition:** when in a run an exchange happens, such as every night or on a
      refund, which the name says. That a thing is planned, or on its way out. The bare word
      "optional": say who chooses, or when.
    - "In production" may be written: it says when a part is there. It is no model of an
      environment.
    - It goes on the narrowest record it is true of as a whole.
    - **What a thing has from another.** A part in a thing with `only` has it too. A connection
      has those of its two ends, and of what they are in. None is said again. A connection has
      nothing from what it passes through.
    - One condition is written in the same words everywhere. `seefore list` shows the wordings
      a directory has.
<!-- hard-cases:end -->

## What must be true

Errors, each at the value that is wrong:

| Rule | Problem code |
| --- | --- |
| Each id in `via` names a record that exists | `reference-unknown` |
| Each id in `via` names a piece of infrastructure, an app, a component or a system | `reference-wrong-kind` |
| `via` names neither end of the connection, nor what an end is in, nor what is in an end | `via-end` |
| `via` is not empty and names no id twice | `value-too-small`, `value-invalid` |
| `external` is `true`, and only a system has it | `value-not-allowed`, `key-unknown` |

Warnings. Both read the model and use no list of words. The first compares two names that
the model itself holds:

| Check | Problem code |
| --- | --- |
| A store of kind `queue`, `topic` or none has the name of a technology it names: a message broker drawn as one box | `broker-as-store` |
| An app or a system is named in `via` and is the end of no connection, nor is anything in it: it only passes on, so it is a piece of infrastructure | `passes-on-only` |

What they cannot find: a load balancer written as an app with one connection in, one out and
no `via` anywhere; a broker drawn as one box under a name of its own. Nothing in such a model
says what the thing is. There the skill's question is the guard.

Stage 6b adds these errors:

| Rule | Problem code |
| --- | --- |
| `in` of a store names a system or an app, and `in` of a piece of infrastructure a system | `reference-wrong-kind` |
| `access` is `read`, `write` or `read-write`, and `opens` is `to` | `value-not-allowed` |
| `access` is written only on a connection that ends at a store | `access-not-store` |
| `opens` is written only on a connection that does not end at a store | `opens-at-store` |
| `only` is one line of 1 to 100 characters, with no space at either end | The codes of a name's form |

And two warnings, which read the model and no word:

| Check | Problem code |
| --- | --- |
| A connection between a store that an app keeps and anything outside that app: the store is not the app's alone, or the connection is to the app | `kept-store-reached` |
| A record's `only` is, letter for letter, that of a thing it is in; or, on a connection, that of an end or of a thing an end is in | `only-said-again` |

Three checks that were there change. `passes-on-only` no longer says that a piece of
infrastructure is in nothing: the app may keep its `in` when it moves. `connection-twice` and
`connection-repeated-above` take two connections for one only when their `via` and their `only`
are the same too, so two ways of one exchange are two connections.

What these cannot find: a wrong `access`, a missing `opens`, two wordings of one condition, a
store that one app keeps written in its system. No check asks for `access`: a third of all
connections end at a store, and a missing one is "not said", as a missing technology is. And
no check reads who may reach whose store. That is a team's rule, for stage 25; `access` and
`in` give it what it needs.

## What the picture shows

- **A route is a line on the arrow**, under its names: `via Ingress, Workhorse`. When the
  connections of one arrow have different routes, or only some have one, it says on how many:
  `via on 2 of 5`. A route too long for its line says how many more it holds: `via Ingress,
  + 2 more`. A hop that is drawn as the box at either end of the arrow is left out at that
  level. The panel gives each connection's whole route in order.
- **A piece of infrastructure has a box only where a connection starts or ends at it.** It has
  a shape of its own. It stands inside the boundary of the system it is in, and outside every
  boundary when it is in none. In the view of another system it is drawn at its own system, as
  an app is. One that is only passed through has no box: the view lists it under the legend,
  with how many of the view's connections pass through it, and a click there lights those
  arrows. The list says which pieces are the system's own.
- A box that connections pass through carries a mark with their number, counting every
  connection the view holds, also those between two parts that are drawn as one box.
- **A queue or a topic** has a shape of its own, the same for both, and its kind line says
  which: `[Store: topic · Kafka]`.
- **An external system** says so in its kind line, `[System: external]`, and has a tab at its
  corner, on the shape every system has. A system with no mark stays the plain system.
- **A store that an app keeps is drawn at its app**, as a component is, and has no box on the
  container view. The app's box carries a mark with the number of stores it keeps, and the
  app's panel lists them. A connection to such a store is drawn at the app. One from the app to
  its own store is inside the box, and the panel has it.
- **`access` is on the store's panel:** who writes the store, who reads it, who does both, and
  whose connection does not say. Nothing is added to the arrow: its name has the verb. A read
  and a write on one arrow stay two lines of its label.
- **`opens: to` is a small ring on the arrow**, before its head, when every connection of the
  arrow has it. When only some have it, a line of the label says on how many: `opened from the
  far side: 2 of 5`. The panel says it for each connection.
- **`only` is a line.** On a box it stands under the kind line: `only in the hosted edition`.
  On an arrow it is a line of the label: the words, when the arrow's connections share them,
  and else on how many: `only sometimes: 2 of 5`. Only a thing's own `only` is drawn. The panel
  gives it, and then what the thing has from others, each with the record it comes from.
- **A thing on a route that has `only` stands in brackets:** `via (Office proxy), HTTPS proxy`,
  and so in the list under the legend.
- Each of these is in the legend where the view draws it, and none is told by colour alone.
- **A view is about a system.** A connection between two things that are in no system, such as
  a person and a piece of infrastructure, or two pieces of infrastructure, is in no picture.
  The listing of the model says how many such connections there are, and marks each.

## The commands

- `seefore check` reads `infrastructure/` and reports the problems above.
- `seefore list` writes the route on a connection's line, lists the pieces of infrastructure
  under a heading of their own with how many connections pass through each, and says which
  systems are external. `--json` gains `infrastructure`, and `via` and `external` on the
  records that have them.
- `seefore uses <id>` puts a connection that names the thing in `via` under what must go or
  change, and a piece of infrastructure that only those connections name under what is left
  behind.

Since stage 6b:

- `seefore check` reports the problems of stage 6b above.
- `seefore list` puts a store under the app that keeps it, with the app's components, and a
  piece of infrastructure under the system it is in. A piece in no system stays under the
  heading it had. It writes `[read]`, `[write]` or `[read-write]` before a connection's name,
  `[opened by the far side]` likewise, and `(only in the hosted edition)` after the name of a
  thing that has `only`. A heading "Conditions" lists each wording with how many records hold
  it, so two wordings of one condition stand side by side. `--json` gains the three fields.
- `seefore uses <id>`: a store goes with the app that keeps it, and a piece of infrastructure
  with the system it is in. A thing whose `only` others have from it says how many they are.

## The skill

Three questions more, at the moment of modelling:

| When | Ask |
| --- | --- |
| A proxy, a gateway, a load balancer, a CDN, a pooler, a relay | Is passing on its whole job? Yes: a piece of infrastructure, in `via`. No: an app with a connection for its own work, and in `via` for what it passes on |
| A broker, a bus, a queue, a topic, a stream | Which queues or topics do the facts name? Who puts into each and who takes out? Does one reader take a message, or does every subscriber get it? |
| A new system, or one with nothing in it and no owner | Can the people this model is kept for change it? |

Stage 6b adds eight:

| When | Ask |
| --- | --- |
| An app that keeps files or a database of its own | Does anything reach them but through the app? Is it worth a record? Yes and yes: a store in the app |
| A database | Is this the data or the server? The data is the store. What else is on that server goes in the description |
| A piece of infrastructure | Is it part of one system, or does it stand outside every system? |
| A connection to a store whose words do not say | Does it read, write or both? |
| Something is sent that nobody asked for just then | Which side opened the channel it goes down? |
| A send that does not wait for an answer | Is there a queue or a topic between? Then that is a store. If not, the name says so |
| A part or a connection the facts call optional, or tie to an edition, an install, a setting or a consent | Could a reader find it missing in an install that runs? When is it there? Offer the wordings the directory already has before writing a new one |
| A thing on the way that is not always there | Is it missing in some installs, or is it there and this exchange sometimes goes round it? Missing: `only` on the thing, and it may be in `via`. Round it: the other way is a connection of its own |

**The lift.** A model written before this stage says these facts in descriptions. The skill
proposes to lift each into its field, and a person answers each; no script lifts one unread.

- It lifts only from the words of the record, never from its own guess.
- It proposes one route at a time: the route by name in order, each new piece of
  infrastructure as a file, and for each connection the sentence the lift rests on, quoted,
  and the description as it would read afterwards. Kinds and marks are each a table: the
  record, the value, the words quoted.
- The person answers each: yes, no, or yes but for these.
- It takes out of a description only the words the field now says in full.
- The summary for a large change does not stand in for this: every lift is shown.

For the fields of stage 6b the lift goes the same way, in this order:

- **What is in what** first, since a condition is had from what a thing is in. A store into the
  app that keeps it, and a piece of infrastructure into its system, one at a time, each with its
  question and with what then goes with it when the app or the system goes.
- **`access`** as one table for each store: who acts, the name, the value, so that a person
  reads a store's readers and writers together. A use that is neither is left out, and said.
- **`opens`** as one table: the connection, the words that say who opened the channel.
- **`only`** on parts first, then on connections, so that "its end says this already" can be
  shown. One table for each wording: the record, the sentence quoted, the text as it would be
  written. A bare "optional" is asked about and never lifted as it stands.
- Then the routes that `only` now allows: a thing that only some installs have, named in `via`.

## Decisions taken at these stages

Stage 6a:

| Decision | Outcome |
| --- | --- |
| The record for a thing that only passes on | `infrastructure/` (the owner) |
| May a connection start or end at one | Yes (the owner). For what the piece does on its own account; what it passes on is written with `via` |
| A mark for somebody else's system | Stored, as `external: true` on a system (the owner). The page says "external" too |
| What the checks read | The model's structure only, with no list of words (the owner). One compares a store's name with the name of its technology |
| What makes a thing infrastructure | What it does: passing on is its whole job. Who made it does not count |
| A thing that is on the way only sometimes | Not in `via`. It stays in the description until stage 6b says how a condition is written |
| The broker | A technology, with no record of its own |
| What "ours" is | What the people the model is kept for can change. Who runs a copy does not count |
| A route in a picture | A line on the arrow. A box only for a piece that a connection starts or ends at |
| The format's number | Stays 1 |

Stage 6b. Three contributors planned it apart (`research/stage-6b/`), and the owner took their
one recommendation, but as one stage where it asked for three:

| Decision | Outcome |
| --- | --- |
| One stage or several | One (the owner) |
| A store that an app keeps | `in` names the app, and the store is drawn at the app. A warning asks when anything else reaches it |
| Several stores in one server | Words, in each store's description. A store is never in a store |
| May a piece of infrastructure be in a system | Yes, and `in` may be left out |
| Reads and writes | `access`, on a connection that ends at a store. Never asked for |
| Who opens a channel | `opens: to`. It names a side, not a record |
| A call that does not wait | No field. A queue or a topic says it, and else the name. Asked again with flows, at stage 11 |
| A condition | `only`, in free words. It may name an environment |
| A condition and `via` | A thing that has `only` may be named in `via`. This changes stage 6a's "a thing that is on the way only sometimes is not in `via`": then nothing could say when a thing was there |
| What a connection has from what it passes through | Nothing |
| Code that several apps share | Never a component in several apps: tried on the trial models, it states calls that do not happen. It waits for groups |
| Groups, and one program that runs as several apps | Not at this stage. A stage of their own, before focused views |
| An app kind `library` | No |
| The format's number | Stays 1 |

## Names these stages add

**Stage 6a.** One folder, `infrastructure`. Two fields, `via` and `external`. Two kinds of
store, `queue` and `topic`. Three problem codes: `via-end`, `broker-as-store`,
`passes-on-only`. No command, no flag, no skill.

**Stage 6b.** Three fields, `only`, `access` and `opens`, with three values of `access` and one
of `opens`. Four problem codes: `access-not-store`, `opens-at-store`, `kept-store-reached`,
`only-said-again`. No folder, no kind, no command, no flag, no skill.

The format now has nine folders, thirteen field names and thirteen kinds.

## Leaves out

- **A field for a call that does not wait:** with flows, at stage 11, which has asynchronous
  sends.
- **Groups, code that several apps share, and one program that runs as several apps:** a stage
  of their own, before focused views.
- **Which server holds which stores, and who runs a copy:** with deployment.
- **A condition as a record,** with a form a check can read: when free words prove too loose.
- **A route as a view of its own,** with every hop as a box: stage 9.
- **A check for a system nobody has spoken for,** and one for a store connection that does not
  say `access`: stage 8. **The team's rule on who may reach whose store:** stage 25.

## Against the research

Checked against `research/synthesis.md`. `research/stage-6a/` and `research/stage-6b/` each
hold two plans, the research's view of the stage, and the recommendation made from the three.

### Stage 6a

Follows it:

- **Each queue or topic is a store, and the broker as one box is wrong** (2.8).
- **A load balancer is not a container** (2.7, 2.8). It has a record of its own, and no box
  unless something acts on it.
- **A typed "via"** on a connection (section 4).
- **Guidance at the moment of modelling**, and **a person accepts what a model proposes**,
  with its source (1.16).
- **Every mark in the key, and never colour alone** (2.8).

Departs from it, with the reason:

- **A stored mark for an external system.** The research says to work "external" out from the
  scope of a view and to store nothing. Outside a view is still worked out. Whose a system is
  cannot be: in the trial models 100 of 113 systems have no owner.
- **"External" is C4's word for outside a view.** Here it is the owner's word for somebody
  else's system, and the page says what it means.
- **The test for infrastructure leaves out who built it.** C4's author asks three things of a
  gateway before it is a container. Here what it does decides alone.
- **A queue is never named on an arrow.** C4 allows that as a second form. An arrow from each
  writer to each reader states hand-overs nobody wrote.
- **Infrastructure is named on a container view**, on the arrow, where C4 keeps it for
  deployment views. In the trial models one connection in six passes through something.

Risks it takes on:

- **A route written as words is not seen at first sight.** The largest views open below the
  zoom where the page shows words on arrows.
- **Two careful readers lifted the same seven models and differed** by about a seventh on
  routes and a quarter on marks. A person has to answer each lift.
- **The two warnings find a fault only where the model gives it away.**

### Stage 6b

Follows it:

- **Reads and writes as a typed fact of a connection** (section 4). The verb stays in the name,
  since a one-word label is the fault C4 warns of, and a missing value is allowed.
- **The data is the store and the server is deployment** (2.8). Several stores in one server
  stay words, and a server is never a store that holds stores.
- **A shared library is no container, and its code is not one record in two apps** (2.8).
- **The rule on reading another service's database is a team's** (section 4): no check here.
- **A field is kept only when somebody decides something with it** (1.13), **a person accepts
  what a model proposes** (1.16), and **every mark is in the key** (2.8).

Departs from it, with the reason:

- **No typed "asynchronous".** The research lists it beside read and write. Here a queue or a
  topic is a store and says it for one connection in seven. The records of the trial models
  say "without waiting" about ten times in two thousand, and its first sure reader is a step
  of a flow.
- **A store in an app, drawn at the app.** C4 puts no container in a container, and draws a
  service's store beside it. Ten of one trial model's fourteen stores are files of one
  process. A warning keeps a shared store from being hidden: what anything else reaches is in
  the system.
- **Infrastructure in a system.** C4 keeps it for deployment views, and no source does this.
  But by C4's own meaning of "external", a piece of ours drawn outside our boundary reads as
  somebody else's, and so the trial of stage 6a read it.
- **A condition on a part or a connection.** C4's structure has none. The research gives
  environments to deployment and branches to flows, and is silent on editions and settings. In
  the trial models between one record in thirteen and one in eight says when it is there.
- **Who opened a channel is stored.** The research says only that a message may travel against
  the arrow. Here the arrow is who sends, so the dial is the fact a picture gets wrong.
- **Groups come later** than the research places them, which is with the first model.

Risks it takes on:

- **Nothing ties two records with one condition together but their spelling.** If one
  condition gets several wordings in one model, a condition needs a record.
- **`access` may contradict the verb beside it,** and no check can tell.
- **A route may now name things that are never there together.** Nothing checks that two
  conditions on one route can both hold.
- **No mark of this stage has been tried on readers.**
- **Two careful readers counted the conditions of the trial models, and one found little more
  than half of what the other found.** A person has to answer each lift.
