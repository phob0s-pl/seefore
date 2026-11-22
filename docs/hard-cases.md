# Hard cases in a picture

Three facts of a real system that a description could only say in words: what a connection
passes through, a queue or a topic, and whose a system is. This is stage 6a of `plan.md`. It
builds on `modelling.md` and `diagrams.md`.

## What it is

The format gains one kind of record, two fields and two kinds of store. Each has a
convention, a check where a check can tell, a question the skill asks at the moment of
modelling, and a place in the picture.

| What | On | Form |
| --- | --- | --- |
| `infrastructure/` | a record of its own | A thing whose job is to pass exchanges on: a proxy, a gateway, a load balancer. `name`, and where known `description`, `technology`, `owner`. It is in no system |
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

## The conventions

Three more, after the six of `modelling.md`. The skill carries them word for word.

<!-- hard-cases:start -->
7. **What a connection passes through.** A connection keeps its two ends: the one that acts
   and the one it acts on. What stands between them and passes the exchange on is named in
   `via`, in the order of travel, nearest to `from` first.
   - **Passing on** is routing, choosing where to send, pooling, changing the protocol,
     limiting, checking the caller and ending TLS.
   - **A piece of infrastructure** is a thing whose whole job is passing on, whoever made it
     and whoever runs it. A thing that also has work of its own, such as serving files, is an
     app; `via` names it on what it passes on, and its own work has its own connection.
   - **`via` holds what is always on the way.** A thing that is there only in some installs,
     or only when another way fails, stays in the description. Leaving something out of
     `via` claims nothing. A second route with a reason of its own is a second connection.
   - **A connection may start or end at a piece of infrastructure**, for what that piece does
     on its own account: a deploy that reloads it, a check that it makes, a list that it
     fetches. What it passes on is never written as one connection to it and another from
     it: that is one connection, with the piece in `via`.
   - `via` names a piece of infrastructure, an app, a component or a system. Never a store,
     and never an end of the connection or what an end is in.
8. **Queues and topics.** A queue is a store that one reader takes each message from. A topic
   is a store whose every subscriber gets each message. The one that puts in and the one that
   takes out each act on the store, as convention 1 says, and no arrow runs from a writer to
   a reader. So a queue or a topic is never in `via`.
   - **The broker is a technology**, the `technology` of each queue and topic it carries. It
     has no record of its own. A broker that has work of its own, such as checking logins, is
     an app beside its topics.
   - A queue or a topic gets a store of its own when the facts say who writes it and who
     reads it. Those the facts do not tell apart may be one store, named for what it holds
     and never for the broker.
   - A queue kept as rows in a database is a store of its own, of kind `queue`, with the
     database's product as its technology and the database named in its description.
   - A queue or a topic is in the system that answers for it.
9. **An external system.** `external: true` says that the people this model is kept for cannot
   change the system: they use it as it is given.
   - It follows who makes the system, not who runs it. A product of ours that a customer runs
     is ours, and who runs a copy is said in the description.
   - It is not "outside this picture". That is worked out from the scope of a view, and
     nothing is stored for it.
   - It says nothing of a part inside the system. Code of ours that runs inside somebody
     else's software is an app of our system; their software is the external system.
   - A partner the team can ask is external and may still have an `owner`.
   - A system with no mark is not thereby ours: nobody has said.
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

Warnings. Both read what the model says and no words of a name or a description:

| Check | Problem code |
| --- | --- |
| A store of kind `queue`, `topic` or none has the name of a technology it names: a message broker drawn as one box | `broker-as-store` |
| An app or a system is named in `via` and is the end of no connection, nor is anything in it: it only passes on, so it is a piece of infrastructure | `passes-on-only` |

What they cannot find: a load balancer written as an app with one connection in, one out and
no `via` anywhere; a broker drawn as one box under a name of its own. Nothing in such a model
says what the thing is. There the skill's question is the guard.

## What the picture shows

- **A route is a line on the arrow**, under its names: `via Ingress, Workhorse`. When the
  connections of one arrow have different routes, or only some have one, it says on how many:
  `via on 2 of 5`. The panel gives each connection's route in order.
- **A piece of infrastructure has a box only where a connection starts or ends at it.** It has
  a shape of its own and stands outside the boundary, since it is in no system. One that is
  only passed through has no box: the view lists it under the legend, with how many of the
  view's connections pass through it, and a click there lights those arrows.
- A box that connections pass through carries a mark with their number.
- **A queue or a topic** has a shape of its own, the same for both, and its kind line says
  which: `[Store: topic · Kafka]`.
- **An external system** says so in its kind line, `[System: external]`, and has an outline of
  its own. A system with no mark stays `[System]`.
- Each of these is in the legend where the view draws it, and none is told by colour alone.

## The commands

- `seefore check` reads `infrastructure/` and reports the problems above.
- `seefore list` writes the route on a connection's line, lists the pieces of infrastructure
  under a heading of their own with how many connections pass through each, and says which
  systems are external. `--json` gains `infrastructure`, and `via` and `external` on the
  records that have them.
- `seefore uses <id>` puts a connection that names the thing in `via` under what must go or
  change, and a piece of infrastructure that only those connections name under what is left
  behind.

## The skill

Three questions more, at the moment of modelling:

| When | Ask |
| --- | --- |
| A proxy, a gateway, a load balancer, a CDN, a pooler, a relay | Is passing on its whole job? Yes: a piece of infrastructure, in `via`. No: an app with a connection for its own work, and in `via` for what it passes on |
| A broker, a bus, a queue, a topic, a stream | Which queues or topics do the facts name? Who puts into each and who takes out? Does one reader take a message, or does every subscriber get it? |
| A new system, or one with nothing in it and no owner | Can the people this model is kept for change it? |

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

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| The record for a thing that only passes on | `infrastructure/` (the owner) |
| May a connection start or end at one | Yes (the owner). For what the piece does on its own account; what it passes on is written with `via` |
| A mark for somebody else's system | Stored, as `external: true` on a system (the owner). The page says "external" too |
| What the checks read | The model's structure only, and no words of a name (the owner) |
| What makes a thing infrastructure | What it does: passing on is its whole job. Who made it does not count |
| A thing that is on the way only sometimes | Not in `via`. It stays in the description until stage 6b says how a condition is written |
| The broker | A technology, with no record of its own |
| What "ours" is | What the people the model is kept for can change. Who runs a copy does not count |
| A route in a picture | A line on the arrow. A box only for a piece that a connection starts or ends at |
| The format's number | Stays 1 |

## Names this stage adds

One folder, `infrastructure`. Two fields, `via` and `external`. Two kinds of store, `queue`
and `topic`. Three problem codes: `via-end`, `broker-as-store`, `passes-on-only`. The format
now has nine folders, ten field names and thirteen kinds. No command, no flag, no skill.

## Leaves out

A condition on a part or a connection, a call that does not wait, reads and writes, a store
that one app keeps, shared code, groups, several stores in one server, and who opens a
channel: stage 6b. A route as a view of its own, with every hop as a box: stage 9. Who runs a
copy, as a field: with deployment. A check for a system nobody has spoken for: stage 8.

## Against the research

Checked against `research/synthesis.md`. `research/stage-6a/` holds two plans, the research's
view of this stage, and the recommendation made from the three.

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
