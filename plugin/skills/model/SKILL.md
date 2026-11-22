---
name: model
description: Add to, change or remove from the architecture kept in a seefore source directory. It writes the records of the model: people, systems, apps, stores, components, the connections between them, owners and technologies. Use when someone wants to describe, model, draw up or change a part of an architecture with seefore, to rename or move a part, or to remove one.
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

1. Run `seefore check --json --workdir=<folder>`. If it names no `directory`, stop and say
   that there is no source directory; the `init` skill starts one. If it reports errors, show
   them and ask whether to mend them first.
2. Run `seefore list --workdir=<folder>` and read it. Everything you write must fit what is
   there already.

## 2. The records

Eight kinds, each in its own folder. Bold is required; write nothing else, and no key that is
not in this table.

| Folder | What it is | Keys, in the order they are written |
| --- | --- | --- |
| `people/` | A kind of person who uses the software, runs it or takes part. A role, not an individual | **`name`**, `description` |
| `systems/` | Software seen as one thing, ours or somebody else's | **`name`**, `description`, `owner` |
| `apps/` | Something that runs code | **`name`**, **`in`**, `description`, `kind`, `technology`, `owner` |
| `stores/` | Something that holds data | **`name`**, **`in`**, `description`, `kind`, `technology`, `owner` |
| `components/` | A piece inside an app | **`name`**, **`in`**, `description`, `technology`, `owner` |
| `connections/` | One thing acts on another | **`from`**, **`to`**, `name`, `description`, `technology` |
| `owners/` | A team, a role or an organisation that answers for a part and can be asked | **`name`**, `description` |
| `technologies/` | A language, a framework, a product or a protocol with a name | **`name`**, `description` |

- `name` is what people call it, on one line. On a connection it is the few words on the
  arrow: it starts with a verb and reads from `from` to `to`, such as "Takes the payment".
  Never "Uses".
- `description` says what the thing is responsible for, in a sentence or a few.
- `in` is the id of what the thing is part of: a system for an app and for a store, an app
  for a component.
- `kind` of an app is one of `service`, `browser`, `mobile`, `desktop`, `command`,
  `function`, `job`. `kind` of a store is one of `database`, `files`, `cache`, `index`. Leave
  it out when none fits.
- `technology` is a list of ids of records in `technologies/`.
- `owner` is the id of a record in `owners/`.
- `from` and `to` are ids of a person, a system, an app, a store or a component.

```yaml
# apps/order-api.yaml
name: Order API
in: shop
description: Takes orders and says how far each has got.
kind: service
technology: [go]
owner: shop-team
```

```yaml
# connections/checkout-takes-payment.yaml
from: checkout
to: card-provider
name: Takes the payment
technology: [https]
```

Write the keys in the order of the table, one key on a line. Write a list in brackets on one
line. Put text in double quotes when it holds a colon followed by a space, starts with a
character YAML gives a meaning to, or could be read as a number or as `true`, `false` or
`null`.

## 3. How to model

**The arrow.** A connection goes from the one that acts to the one it acts on: the one that
makes the call, sends the message, or reads or writes the store. A store acts on nothing; a
connection never starts at a store. A reply is not a connection. What the other end later
sends of its own accord, such as a call back, is a connection of its own, from that end.

**The level.** Write a connection at the lowest level you know: from a component, when you
know which one. Do not write it again one level up. Write one a level up only when its
sentence says more than the ones beneath it.

**One record or several.** Copies of the same thing are one record. Many of a kind may be one
record with a name in the plural and the number in its description.

**Ours and somebody else's.** Somebody else's software that the team calls is a system like
any other, usually with nothing in it. Say whose it is in its description.

**What this format cannot say yet.** A queue or a topic is a store with no `kind`; say what it
is in its description. Whether a connection reads or writes goes in the verb of its name.
What sits in between, such as a proxy, goes in the description of the connection. That a part
is not always there goes in its description.

Ask the person only where the answer changes what you write:

| When the person says | Ask |
| --- | --- |
| A push, a webhook, a subscription, a tunnel | Who sends each message? The arrow starts there |
| An owner that has no record yet | Is this a team, a role or an organisation that can be asked? If the truth is a sentence, such as "nobody" or "two teams argue", leave `owner` out and put the sentence in the description |
| A technology that has no record yet | Is it a language, a framework, a product or a protocol with a name? A phrase such as "by hand" goes in the description of the connection |
| A connection between apps whose components are in the model | Which component, if you know? |

Never fill in what nobody said. No owner, technology, kind or description from your own
guess. A record with only its required keys is a good record.

## 4. Ids

- Lowercase letters and digits in groups joined by single hyphens, starting with a letter:
  `order-events`.
- An id is used once in the whole directory, whatever the folder.
- An id is given once and never changed. Renaming a thing changes its `name`.
- Give an app or a store an id that says what it is for: `session-cache`, not `redis`. Then
  the technology can have the product's own name as its id, `redis`.
- Give a connection an id that reads as its sentence: `checkout-takes-payment`.
- Before making a record, look in the listing for one that is the same thing under another
  name. Ask when you are not sure. Use the owner and the technology records that exist.

## 5. Show it, then wait

Before writing, show the person every file you will write, change or remove, with its path
and its content. Then wait for a yes. If the person has already said to go ahead, do not ask
again.

## 6. Change, move and remove

- **Rename.** Change `name`. The id and the file's name stay.
- **Move.** Change `in`. What is inside the thing follows it.
- **Change an end of a connection.** When the new end is a part of the old one, or the old
  one is a part of the new, change `from` or `to` and keep the file. When it is a different
  thing, remove the connection and write a new one with a new id.
- **Remove.** First run `seefore uses <id> --workdir=<folder>`. It lists what is inside the
  thing and every record that names it. Show that list. Say for each record what you will do:
  remove it with the thing, or change it. Wait for a yes, then make all of those changes
  together.

## 7. Check it

Run `seefore check --workdir=<folder>`. Mend every error it reports in a file you wrote, and
run it again. For a warning, say what it is and ask. Do not change a file you did not mean to
change.

## 8. Say what happened

Tell the person which files were written, changed and removed, in words: what was added,
renamed, moved or removed, by name. Say what the check said. Say that nothing was committed.

Do not commit and do not stage. That is the person's step.

## Never

- Never change an id or the name of a record's file.
- Never write a key that is not in the table of section 2.
- Never write a fact that nobody stated.
- Never write outside the source directory.
