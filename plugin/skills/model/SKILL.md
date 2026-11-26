---
name: model
description: Writes the parts, stores and connections of a system into its seefore model, from its code; call it when a repository has no model, or the parts of its code have changed.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *) Bash(seefore rename *) Bash(seefore remove *)
---

You write the seefore model of the system in this repository **from its code**: what runs, what
holds data, and what acts on what. You write at once and ask nothing first. The person reads
the result as a diagram, not as files. A feature, a flow, data, context, a rule or a change
is another skill's work.

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
   - A part of this system that is built elsewhere and started or pinned here is an app, not
     a system of its own: the deploy file with its image, or its version file, starts it.
   - Code that runs only inside an app is a component. Write one only where a connection
     begins or ends at it.
2. **A store is data that others read or write by an address**: a database, files, a cache,
   an index, a queue, a topic. A table or a key inside one is not a store. Of a broker, write
   each topic or queue that one app writes and another reads, not the broker.
3. **A connection needs evidence from this session**: a file you opened, or a line a search
   showed you, where this app's code or config names the far end: a client, an address, a
   queue or topic name, a route, a query. Code that several apps run counts only with a file
   that says this app runs it; for an app with no code here, its config, or the far side's
   code that takes its call, reads what it writes or writes what it reads. With none, leave
   the connection out and name it in your last message. A name that sounds related is none.
4. **Write what the files show.** Not what you remember of this project, nor what its
   documents say it will be: a document may tell you where to look, and no more.

## The steps

1. Run `seefore list`. If it says "is not a model", tell the person to run
   `seefore init --name=<the system's name>` and stop. "No records yet." is a new model. If
   records are there, this is a mend: keep every record that is still true, with its id, and
   change only what the code shows otherwise. An id changes by `seefore rename <old> <new>`,
   and a record that is no longer true goes by `seefore remove <id>`, never by another way.
2. **Find what runs.** Read with the file tools: Glob lists, Grep searches, Read opens. The
   shell is for `seefore` alone, one command a call: anything else may be refused. List the tree
   first, with Glob; search freely, a search opens no file. Where it holds several repositories,
   read each in its own folder and name that folder in a search. Keep, for each app, the file
   that starts it and the folders of its code. Open at most 120 files, in this order:
   - build and package files, which name the programs: a module's commands, a workspace's
     packages, the scripts and entry points of a package;
   - deploy files, which name what is started and what it needs: image and compose files,
     charts and manifests, process files, units;
   - the entry point of each program, far enough to see what it starts and listens on;
   - config that names stores and other services: settings, defaults, connection strings.
3. **Find what each app talks to**: search its code and config for clients, addresses, queue and
   topic names, the stores it opens and the hosts it calls outside the system. Each one you can
   show is a connection: keep its file. A service outside is a system of its own.
4. **Write the records** with the file tool, many files in one message: a script or a shell
   command that writes them is refused. Write in this order, so that each names only what is
   already there: repositories, systems, technologies, owners, people, apps, stores, components,
   infrastructure, connections. No record holds a path of the code, in any key.
   - A repository beyond the model's own is a record, named by each system or app it holds.
   - The system is what its users see as one; only another maker's system is `external: true`.
   - A connection's id is `connection-`, who acts, what it does, on what.
   - A person is a kind of user that an entry point shows: who opens the pages, runs the
     command or calls the API. Write the few there are. An owner is written only when a
     file names a team; otherwise leave `owner` out.
5. **Hold every connection against rule 3**: say in a message, before the check, one line each,
   its id and the file you kept. One with none goes. Then run `seefore check`, mend what it says
   by its `Mend:` line, and check again; three rounds at most. Where it says that no connection
   names a part, search it once more, and write only what a file shows; a component you wrote
   that still has none goes.
6. **Hold every app against rule 1 once more.** Name the file that starts each. An app with
   none becomes a component of the app that runs it, or goes; then check again.
7. End with a short message:
   - what you wrote, as counts by folder, and each app with the file that starts it;
   - what you took where the code left a choice, at most five lines;
   - what you did not find, such as who owns a part; each line of an agent you left out, and why;
   - **which folders you did not open**; where they are many and the tree holds thousands
     of files, that `--parallel-agents=4` reads more of it, for two to three times the cost;
   - "Look at the diagram with `seefore --server`. Next: `/seefore:flows <a journey>`."

## With several agents

Only when the person typed `--parallel-agents=<n>`. An agent you start sees neither this text
nor the conversation: it knows only what you tell it.
1. **The frame.** Do steps 1, 2 and 4, and write every record but connections. Then run
   `seefore check` and mend it: a record that does not parse is in no agent's list.
2. **The parts.** Cut the apps whose code is in this tree into at most <n> groups,
   neighbours together; cut a very large app by its folders. Start one agent a group, all in
   one message, each told this, filled in, with no target or cap added:
   > Add connections to the seefore model in `<folder>`. The code lies in `<root>`. Your apps:
   > `<id>` in `<its folders>`, … Read with Glob, Grep and Read; the shell is for `seefore`
   > alone, one command a call: `seefore list` prints every record, `seefore guide connections`
   > the format. Search each app's code, and the deploy and config files that name it, for what
   > it reaches: clients, addresses, queue and topic names, stores, hosts outside the system.
   > Write one file a connection, many in one message, in `<folder>/connections/`: `from` one of
   > your apps, `to` a record of the list, the id `connection-`, the app, what it does, on what.
   > Each needs a file you opened, or a line a search showed you, where this app's code or
   > config names the far end. With none, write none: what you remember of the project is no
   > evidence. What your app sends down a channel the far app dialled is yours, with
   > `opens: to`; where yours only dials, write none. Write no other record, change none, and
   > run no check.
   > End with these lines alone: `<id>: <file>` for each connection you wrote; `MISSING
   > <store or system>: <what it is>; <app id> <what it does with it>; <file>` for what your
   > apps reach and the list lacks; `INTO <your app, or a store it reads> from <who>: <what>;
   > <file>`; `UNREAD: <folders>`.
   Agents that share one app write no file: say so; each ends with its connections as lines too.
3. **The join**, when all have ended. Write under no id that `connections/` holds. Write each
   missing store and system once, though named in two ways; then, once each, the connections to
   them, of the `INTO` lines, of the lines sent, of people and of apps with no code here. Where
   two agents wrote one thing, or one channel from both its ends, remove one. Then steps 5 to 7.

## The format
Take no name or id from the examples below: they are of a tea shop.
!`seefore guide model`
