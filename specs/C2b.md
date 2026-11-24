# C2b: What data is

A stage beside C2 of `plan2.md`: one page that says what data is, and how a flow names it. It
defines, and builds nothing. The owner proposed it on 2026-11-24: a concept of data with an
id, a name and fields, named only in a flow, with no types, to give a feeling for what is
sent over a connection. Astra and the main session thought it through apart and reached the
same shape (`research/data/`, out of Git). The owner took their recommendations and approved
this page the same day.

## What data is

**Data is a thing with a name that one part passes to another: what is sent, what comes back,
what is put into a store or taken from it.** The record says what it is called and, if
wanted, what it holds. It is no schema: the schema has its home in the code.

## The record: `data/<id>.yaml`, the twelfth folder, flat

| Field | What it means | Needed |
| --- | --- | --- |
| `name` | What its users call it: "Account details" | yes |
| `description` | What it is, in a sentence | no |
| `fields` | A list of what it holds. New | no |

A field is a mapping with a `name`, which is needed, and a `description`, which is not. A
field's name is words, not an id, and stands once in its record.

```yaml
name: Account details
fields:
  - {name: id, description: The account's number}
  - {name: balance, description: What is owed}
  - {name: deadline, description: The day the balance is due}
```

## How a flow names it

One key on a step, `data`: a list of ids of data, none twice. It is the second new name.

```yaml
steps:
  - {id: asks, does: mobile-app-reads-account}
  - {id: gets, reply: asks, name: The account, data: [account-details]}
```

- **It stands where something travels**: on a step that names a connection, and on a reply.
  Not on a step inside one part, on one that runs another flow, or on one with no `does`.
- **The step says the direction.** On a connection, the data goes from its start to its end.
  On a reply it comes back. On a read of a store, it is what the reader takes.
- **Several ids** say that each passes there. Nothing says how they are packed.
- **Nothing else names data**: no connection, no store, no part and no feature. A connection
  through a gateway carries many kinds of data, and only a step can say which, and when.

## What is worked out, and never written

- **For a connection**: the data seen on it, by direction, each with the flow and the step
  that says so. A connection that no flow walks shows none.
- **For a store**: what is written to it and what is read from it, by `access`.
- **For a part**: what it sends and what it gets. What only passes through it, as through a
  gateway in `via`, is kept apart.
- **For a data record**: its fields, and every flow, step, connection and part it travels.

## The checks

| Rule | What must be true | Class |
| --- | --- | --- |
| Those of one file (B1) | A `name`. `fields`, where given, is a list of at least one field, each with a `name`, none twice | error |
| `id-twice`, `reference-unknown`, `reference-wrong-kind` | Its id is no other record's. A step's `data` names data | error |
| `step-shape` (C2) | `data` stands only on a step that names a connection, or on a reply | error |
| `record-unused` (B2) | Some step names each data record | count |

## What is out

| What | Why, or where it belongs |
| --- | --- |
| A type, required, a default, fields inside fields, the values of an enum, a table | For good. arch had them: 68 of 102 records of its sample were data models |
| Data on a connection, a store or a part | It is worked out from the flows |
| Data in a feature's `touches` | C1 stands. A feature shows the data of its flows |
| A batch, and one thing in two sizes | Words; or two records |
| A picture of data and how it relates | Not planned |

## What follows

Milestone 3 is then: C1 a feature, C2 a flow, C2b data, **C3 the three new folders read and
checked**, C4 all three on the page. The page shows data beside a step, a list of data and a
page for each, and the worked-out lists above, as far as C4 builds them.

## What is not known

- **Whether a person picks the same size of record**: one "order", or five kinds of it.
- **Whether it repays its upkeep.** A step's `data` is written by hand, and can rot.
- **An id that a part has already.** One id names one record in the whole model, so data
  often takes a second word: `ticket-scan`, where an app is `scan`.
