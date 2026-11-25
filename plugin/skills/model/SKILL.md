---
name: model
description: Writes the parts, stores and connections of a system into its seefore model, each running part with its source in the code; call it when a repository has no model, or its code has moved.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *) Bash(seefore rename *)
---

You write the seefore model of the system in this repository **from its code**: what runs, what
holds data, and what acts on what. You write at once and ask nothing first. The person reads
the result as a diagram, not as files.

What the person typed after the skill's name: "$ARGUMENTS". When it names a folder, model only
what lies in it, and leave every other record as it is. When it holds `--parallel-agents=<n>`,
work as "With several agents" says below.

## The rules that matter most

1. **An app is code that runs apart.** Something starts it: a main function, a binary, an
   image, a unit, a scheduled job, a command, a page in a browser. Ask of each candidate:
   *which file starts it?* No such file, no app.
   - One code that a deploy file or config starts under different commands or roles is an
     app for each. Subcommands a person types at a program are that program, and a tool of
     the build is no app. Copies that differ only in a number, a topic or a queue are one app.
   - A part of this system that is built elsewhere and started or pinned here, by an image
     in a deploy file or by a version file, is an app, and that file is its `source`. It is
     not a system of its own.
   - Code that runs only inside an app is a component. Write one only where a connection
     begins or ends at it.
2. **A store is data that others read or write by an address**: a database, files, a cache,
   an index, a queue, a topic. A table or a key inside one is not a store. Of a broker, write
   each topic or queue that one app writes and another reads, not the broker.
3. **A connection needs evidence from this session**: a file you opened, or a line a search
   showed you, where this app's code or config names the far end: a client, an address, a
   queue or topic name, a route, a query. Write that file's path in the connection's
   `source`. With none, leave the connection out and name it in your last message. A name
   that sounds related is no evidence, and neither is what such projects usually do.
4. **Write what the files show.** Not what you remember of this project, and not what its
   documents say it will be. A document may tell you where to look; a file you opened is what
   you write from.
5. **Every app, store, component and piece of infrastructure names its `source`**: one to
   three paths, exactly as they stand in the tree, of what starts or defines it.

## The steps

1. Run `seefore list`. If it says "is not a model", tell the person to run
   `seefore init --name=<the system's name>` and stop. "No records yet." is a new model. If
   records are there, this is a mend: keep every record that is still true, with its id, and
   change only what the code shows otherwise. An id changes only by `seefore rename`.
2. **Find what runs.** Read with the file tools: Glob lists, Grep searches, Read opens. The
   shell is for `seefore` alone, one command a call: anything else may be refused. List the
   tree first, with Glob; search freely, a search opens no file. Open at most 120, in this order:
   - build and package files, which name the programs: a module's commands, a workspace's
     packages, the scripts and entry points of a package;
   - deploy files, which name what is started and what it needs: image and compose files,
     charts and manifests, process files, units;
   - the entry point of each program, far enough to see what it starts and listens on;
   - config that names stores and other services: settings, defaults, connection strings.
3. **Find what each app talks to**: search its code and config for clients, addresses, queue
   and topic names, the stores it opens and the hosts it calls outside the system. Each one
   you can show is a connection, and each service outside is a system of its own.
4. **Write the records** with the file tool, many files in one message: a script or a shell
   command that writes them is refused. Write in this order, so that each names only what is
   already there: systems, technologies, owners, people, apps, stores, components,
   infrastructure, connections.
   - The system is what its users see as one. A system outside it that the code calls is a
     system of its own with `external: true`.
   - An id is the word of its folder and the name in lower case with hyphens. A connection's
     id is `connection-`, who acts, what it does, on what.
   - `description`: one or two sentences of what the thing is responsible for.
   - A person is a kind of user that an entry point shows: who opens the pages, runs the
     command or calls the API. Write the few there are. An owner is written only when a
     file names a team; otherwise leave `owner` out.
5. Run `seefore check`. Mend what it says by its `Mend:` line, and check again; three rounds at
   most. Where it says that no connection names a part, search that part once more, and
   write only what a file shows. Then say what is left.
6. **Hold every app against rule 1 once more.** Name the file that starts each. An app with
   none becomes a component of the app that runs it, or goes.
7. End with a short message:
   - what you wrote, as counts by folder;
   - what you took where the code left a choice, at most five lines;
   - what you did not find, such as who owns a part or who uses the system;
   - **which folders you did not open**;
   - "Look at the diagram with `seefore --server`. Next: `/seefore:flows <a journey>`."

## With several agents

Only when the person typed `--parallel-agents=<n>`. An agent you start sees neither this text
nor the conversation: it knows only what you tell it.
1. **The frame.** Do steps 1, 2 and 4, and write every record but connections.
2. **The parts.** Cut the apps whose `source` is code in this tree into at most <n> groups,
   neighbours together; cut a very large app by the folders under its `source`. Start one
   agent a group, all in one message, each told this, filled in and whole:
   > Add connections to the seefore model in `<folder>`. Your apps: `<id>` in `<source>`, …
   > `seefore list` prints every record, `seefore guide connections` the format. Search each
   > app's code, and the deploy and config files that name it, for what it reaches: clients,
   > addresses, queue and topic names, stores it opens, hosts outside the system. Write one
   > file a connection, many in one message, in `<folder>/connections/`: `from` one of your
   > apps, `to` a record of the list, the id `connection-`, the app, what it does, on what.
   > Each needs a file you opened, or a line a search showed you, where this app's code or
   > config names the far end: its path goes in the connection's `source`. With none, write
   > none: what you remember of the project is no evidence. Write no other record, change
   > none, write no connection that starts elsewhere, and run no check.
   > End with these lines alone: `MISSING <store or system>: <what it is>; <app id> <what it
   > does with it>; <file>` for what your apps reach and the list lacks; `INTO <app id> from
   > <who>: <what>; <file>`; `NO APP <id>: <why>`; `UNREAD: <folders>`.
   Agents that share one app write no file: each ends with its connections as lines too.
3. **The join.** Write each missing store and system once, though agents named it in two
   ways; then the connections to them, those into apps, those the agents sent as lines, once
   each, and those of people and of apps with no code here. Then steps 5 to 7.

## What this skill never does

- It does not read all the code. It reads what starts things and what joins them, and says
  what it left unread.
- It does not write a feature, a flow, data, context, a rule or a change. Other skills do.
- It does not take a name, an id or a path from the examples below: they are of a tea shop.

## The format

!`seefore guide model`
