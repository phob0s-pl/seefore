---
name: flows
description: Writes one journey through the model, as a feature, its flow and its data, from the code along that journey; call it when a model is there and a journey is named.
disable-model-invocation: true
allowed-tools: Bash(seefore check *) Bash(seefore list *) Bash(seefore guide *)
---

You write **one journey** through the system in this repository as a flow of its seefore
model: what starts it, the steps in order, each on a connection or a part the model holds,
and what is true at the end. You write it **from the code along that journey**, at once, and
ask nothing first. The person reads the result as a diagram, not as files. The parts
themselves are the work of `/seefore:model`; context, a rule or a change is another skill's.

The journey the person typed: "$ARGUMENTS". One journey a call: of two, take the first and
say so. With none typed, run `seefore list flows`, say which journeys are written, ask which
one to write, and stop.

## The rules that matter most

1. **A step is what a file showed you in this session**: a file you opened, or a line a
   search showed you, where the code does it: a route or a handler that takes the thing, a
   consumer that reads it, a client or a producer that sends it on, a query, a write. A
   comment or a name says what the code is meant to do: a step, and each word of its `name`,
   rests on the lines that do it and on the condition they stand under. Follow the code from
   hop to hop, from where the journey starts. What you remember of this project, and what
   its documents say, may tell you where to look; neither is a step.
   - Code that several apps run is a step of the app that a file shows running it on this
     journey: the route, the consumer, the place where the task is registered.
   - Of a part with no code here, write only what its config here shows, or the code that
     takes what it sends. Where the outcome hangs on what such a part does next, search for
     what takes it, by the name its config here gives: a route, a topic, a queue.
   - Where no file shows the next hop, the flow ends there: `ends` says what is true at that
     point, and your last message says where the trail ended.
2. **A step stands on a record of the model.** `does` names the connection the thing travels
   on, or the part it happens in. So read the model before the code, and at each hop ask
   what the model holds:
   - a connection between the two parts for this purpose: the step is on it, whatever its
     name.
   - both parts, and no such connection: write the connection too, as
     `seefore guide connections` says.
   - one of the parts is not in the model: write **no part**. The step gets its `name`, and
     neither `does` nor `data`; your last message asks.

   Through a queue or a topic the thing takes two steps: one on the writer's connection to
   it, then one on the reader's connection to it. Never a connection from app to app there.
3. **A step is a hop between two parts, or an act inside one part that the outcome hangs
   on.** Every hop is a step of its own. What a part does by itself between two hops is one
   step at most, and often none. A step is not a function, a class or a line of a log. In a
   flow of more than fifteen steps, look for detail to drop without losing a hop.
4. **The main path**, as it runs when all goes well, in an installation with its defaults,
   unless the journey's words name another way. A step that happens only under a condition
   the code tests has `only`; a retry, a wait or a refusal is a sentence in a step's
   `description`. The flow starts at the first act the journey's words name and ends at the
   first step that makes them true: what the code does before or after is another flow.
5. **Change no part and no connection that is there.** One that the code shows otherwise
   stays as it is, and your last message names it.

## The steps

1. Run `seefore list`. If it says "is not a model" or "No records yet.", tell the person to run
   `/seefore:model` first, and stop. The records lie in `architecture/`, or here when this
   folder holds `seefore.yaml`.
   - Where the shell cuts the list off and saves it to a file, read that file; or name the
     folders after `list`, all but `connections`, and take a part's connections from
     `seefore list --near=<id>`.
   - Note the parts near the journey, and the features, flows and data that are there. A
     line shows no `access` and no `description`: open the record of each connection you
     put a step on.
   - A flow of this journey that is there is mended in place: keep its id, and the ids of
     the steps that are still true.
2. **Find where the journey starts**: who or what starts it, a person, a clock or a message,
   and at which part. Find that part's code by what it is: search for its entry point,
   its route or its command.
3. **Follow it hop by hop.** Read with the file tools: Glob lists, Grep searches, Read opens.
   The shell is for `seefore` alone, one command a call. At each part find where the thing
   arrives, what the part does with it that the outcome hangs on, and where it sends it on:
   search for the route, the topic, the queue, the client's name, and open the file that
   answers. Open at most 40 files. Keep, for each step, the file and line that shows it.
4. **Write the records** with the file tool, all in one message, in this order: the feature,
   the data, the connections the model lacked, the flow. Use a feature or a data record that
   is there before you write one. No record holds a path of the code, in any key.
   - **The feature** is what the software does for somebody, under the name its own people
     use; many flows may belong to one.
   - **The flow**: `name` in the words of the one who starts it. An answer that travels back
     on a connection is a step with `reply`; a store answers nothing. Two steps that both
     follow one earlier step each name it in `after`.
   - **Data**: the few things the journey is about, named in the words people use, with the
     code's own name in `description`, each in `data` of the steps on a connection that
     carry it. A field is one a file showed you in this session, written in words; with
     none seen, the record has no `fields`.
5. **Hold every step against rule 1 once more**, before the check, by what you kept. A step
   with no file and line that a Read or a search of this session showed you goes, with each
   `reply` and `after` that names it. So does a number, a default or a field that no such
   line shows.
6. Run `seefore check`. Mend what it says by its `Mend:` line, and check again; three rounds
   at most. Then say what is left.
7. End with a short message:
   - what you wrote: the feature, the flow and its steps, one line each with the file and
     line that shows it, the data, and each connection you added to the model;
   - **what the model lacks**, numbered: each part the journey passes and the model does
     not hold, also one whose act you wrote inside an app or left out: a person, a system,
     a store, a file that an app keeps on its own disk and a later step reads. With each:
     what it is, the step that waits for it or stands in its place, and the file that shows
     it. Then: "Shall I add them?";
   - what you did not find: a hop no file showed, and where the trail ended;
   - what in the model the code shows otherwise, at most five lines;
   - "Look at it with `seefore --server`. Next: another journey, or `/seefore:context`."
8. **When the person says yes**, write each part they agreed to, as `seefore guide <its
   folder>` says; write its connections; give the waiting steps their `does` and their
   `data`; and run `seefore check` again. Write no part they did not agree to.

## The format

Take no name or id from the examples below: they are of a tea shop.

!`seefore guide flows`
