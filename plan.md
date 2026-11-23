# seefore plan

seefore is a tool for designing software architecture on the C4 model. The architecture is
kept as files in a Git repository. Claude skills change the files, a TypeScript engine reads
and checks them, and a React viewer shows them.

This plan replaces stages 2 to 7 of `task.md`. Stage 1, the baseline research, is done; its
result is `research/synthesis.md`. The plan was merged on 2026-11-21 from two independent
proposals, one by Fable and one by Astra.

## Rules

1. The GUI only reads. It never changes the architecture.
2. Every change is made with Claude skills.
3. Everything is TypeScript. An engine reads and checks the files and gives the GUI what it
   shows. The GUI is React.
4. One concept or one task is one stage.
5. Every stage is tried on real data kept in `research/`.
6. seefore is to be installed by other people. Their architecture is a directory in a Git
   repository, their own or a subdirectory of a monorepo, and seefore is pointed at it.
7. The format starts from a clean sheet. Nothing is carried over from earlier tools as given.
8. Every stage is reviewed against `research/synthesis.md`.

## What gets built

| Part | What it is |
| --- | --- |
| Source directory | The architecture as files, in the user's repository. The only thing that is true |
| Core library | TypeScript. The format and its schema, the checks, the views and the comparison. It runs in Node and in the browser. The skills validate against it |
| Command | `seefore`, installed as one npm package. It runs the core library for skills and for people. `seefore --server --workdir=<directory>` serves the viewer |
| Skills | A Claude Code plugin. The only writer of the source directory |
| Viewer | A read-only React application, built into the command's package and served by it |

The core library and the command together are called the engine below.

## How to work this file

- One stage at a time, in order. Read "Every stage ends the same way", then only the stage in
  hand.
- A stage starts with its one-page spec. The spec is checked against
  `research/synthesis.md` and agreed with the owner before code is written.
- An accepted stage is not reopened quietly. When a later stage shows an earlier answer was
  wrong, write it under "Open questions" and ask the owner.
- When a stage is accepted, update "Status" and commit.

## Every stage ends the same way

1. A one-page spec of the concept in `docs/`.
2. The format and its check in the engine. Every error names a file and a line.
3. A skill can write it.
4. The viewer shows it.
5. `seefore diff` reports changes to it (from stage 13 on).
6. It was tried on the trial systems, and a short note in `research/trial/` says what did not
   fit. What did not fit is fixed, or accepted in writing.
7. It was reviewed against `research/synthesis.md`. The review is a short section at the end
   of the spec: where the stage follows the research, where it departs from it, and the
   reason for each departure.
8. The owner accepts it.

Not every stage has all eight; a stage says which it skips. No stage skips the review.

Each spec also lists the new names the stage adds: kinds, fields, commands. The running count
is the guard against a tool with too many names.

## Trial systems

seefore is tried on eight systems, six real and two imaginary. No stage is shaped around one
of them: a stage's trial runs on every trial system the concept applies to.

| System | Kind | Picked by |
| --- | --- | --- |
| Geena | real, private | the owner |
| Teleport | real | the owner |
| GitLab | real | Fable |
| Sentry | real | Fable |
| Syncthing | real | Astra |
| Home Assistant | real | Astra |
| Boxwick | imaginary | Fable |
| Vellumoak | imaginary | Astra |

`research/trial/README.md` says why these, what each one brings, and which of their past
changes can be replayed. Each system has a page in `research/trial/<system>/system.md`.

Each trial system is modelled anew with the skills, a slice at a time, in
`research/trial/<system>/`. What already exists about a system is a source of facts, not of
format.

## Decisions

Decided:

| Decision | Outcome | When |
| --- | --- | --- |
| Starting point for the format | A clean sheet | 2026-11-21 |
| What seefore is tried on | A set of systems, not one | 2026-11-21 |
| The make-up of the set | Geena, Teleport, two real systems picked by Fable, two picked by Astra, and one imaginary system made up by each | 2026-11-21 |
| Research and Git | All of `research/` stays out of Git, the trial systems included | 2026-11-21 |
| Language | TypeScript throughout: the core library, the command with its server, and the viewer | 2026-11-21 |
| Viewer | React | 2026-11-21 |
| The eight trial systems | Accepted as picked | 2026-11-21 |
| Ids | Readable, given once and never changed. An id is its file's name | 2026-11-21 |
| File layout | One file for each record, in a flat folder for each family of records | 2026-11-21 |
| Where a proposal lives | A Git branch for each proposal, changed by the skills. A brief file merges with it and stays. Changes are worked out by comparing revisions; no folders of overriding records | 2026-11-21 |
| What main means | The approved design. Accepted, applied, implemented and verified are separate states | 2026-11-21 |
| Where the meaning lives | All in the core library, which touches neither disk nor network. The command reads files and prints. The viewer draws and never writes | 2026-11-21 |
| Packaging | One npm package, `seefore`, with the command built into one file; the server and the viewer join it at stage 5. The skills are a Claude Code plugin | 2026-11-21 |
| The command line | Verbs are subcommands, starting with `seefore check`. `--workdir` works with every one. The server keeps the form `seefore --server` | 2026-11-21 |
| The words for C4's "container" | "App" for what runs code and "store" for what holds data | 2026-11-22 |
| The word for C4's "relationship" | "Connection" | 2026-11-22 |
| The format of stage 4 | Eight kinds of record: person, system, app, store, component, connection, owner, technology. Eight field names: `name`, `description`, `in`, `kind`, `technology`, `owner`, `from`, `to` | 2026-11-22 |
| Owner | A record, named by id. It may be left out everywhere, so who answers for a part can be said later. A person has none | 2026-11-22 |
| Technology | A record, named by id: a thing with a name that a part is built with or an exchange is carried in. A library, a query language and a data format are one; a style such as REST, an algorithm, a setting of a protocol and a version are not | 2026-11-22 |
| Somebody else's system | No stored mark at stage 4. Its description says whose it is. Stage 6a stores one | 2026-11-22 |
| A connection one level up | A summary of the ones beneath it, written only when it says more than they do | 2026-11-22 |
| Comments in a file | None. A comment in any file seefore reads is an error. This adds one refusal to the YAML rules of stage 3, after the trial of stage 4 lost text at a space and `#` | 2026-11-22 |
| Where an arrow starts | At the one that acts, also where no packet starts there: at the software that chooses where a browser is sent, and at the reader of a queue or a topic | 2026-11-22 |
| What a connection is | One exchange with one purpose. It keeps its id and its file when another part takes the exchange over | 2026-11-22 |
| What sits in between, and a condition | Ordinary words in a description, in no fixed form, until stage 6a for what sits in between and stage 6b for a condition. Each lift is proposed to a person; no script lifts them unread | 2026-11-22 |
| Showing a large change | For more than twenty files the skill shows the count for each folder, a line for each record and three files in full | 2026-11-22 |
| What draws and what lays out | React Flow draws. ELK lays out, in the engine, so that a picture can be tested without a browser | 2026-11-22 |
| The page's sidebar | The views by system, a listing of the whole model, and the problems of the check | 2026-11-22 |
| Stage 6 in two | 6a: the hard cases that change a picture. 6b: the others. As one stage it held five concepts and would have taken the format from eight field names to fourteen | 2026-11-22 |
| A thing that only passes exchanges on | A record in `infrastructure/`, named in `via` on the connections that pass through it. A connection may also start or end at one, for what it does on its own account | 2026-11-22 |
| A mark for somebody else's system | Stored, as `external: true` on a system, and the page says "external". It follows who makes a system, not who runs it. "Outside this picture" is still worked out from a view | 2026-11-22 |
| What the checks of stage 6a read | The model's structure only, with no list of words. One check compares a store's name with the name of its technology | 2026-11-22 |
| Stage 6b as one stage | One stage, as the plan had it. Its three planners asked for three; the owner kept one. The rest goes as `research/stage-6b/recommendation.md` has it | 2026-11-22 |
| What a store is in | A system, or the app that keeps it: then it is drawn at that app. Never a store. Several stores in one server stay words | 2026-11-22 |
| Infrastructure in a system | A piece of infrastructure may be in a system, and may be in none | 2026-11-22 |
| Reads and writes | `access` on a connection that ends at a store. It may always be left out: no check reports one that is missing at this stage | 2026-11-22 |
| Who opens a channel | `opens: to` on a connection: the far side opened the channel. The arrow still starts at the one that sends | 2026-11-22 |
| A condition | `only`, in free words, on every record but an owner and a technology. A thing has those of what it is in, and a connection those of its ends | 2026-11-22 |
| A condition and `via` | A thing that has `only` may be named in `via`: it is on the way whenever it is there. This changes the answer of stage 6a, which kept such a thing in words because nothing could say when it was there | 2026-11-22 |
| Code that several apps share | Never a component in several apps: on the trial models that states calls that do not happen. No app kind `library` | 2026-11-22 |
| A steady order, or the fewest crossings | A steady order. The order of each column is the engine's own and holds after an edit, at a third more crossings on the trial models. "Recognisably in place" means the order, not the place | 2026-11-23 |
| What counts as a rename | Every name: of a box, a thing on a route, a connection and a technology. None may move a box or a line | 2026-11-23 |
| A crowded view | More than 40 boxes. `seefore check` warns of it, and the page draws it as a map with a note. It is never replaced by a list | 2026-11-23 |
| Layout hints | None at stage 7, where the plan had direction, grouping and order: nothing measured asked for one. If a trial asks, a hint lives on the view record of stage 9 | 2026-11-23 |
| The dashed outline for a thing that has `only` | Taken out. A line of the legend lights every thing that has a condition | 2026-11-23 |
| Which order a column has | The walk, as built. Two others were measured: every start first, and by id alone. They hold better when a box that the walk passes early goes, at 28 and 44 % more crossings than the walk on every picture | 2026-11-23 |
| The floor for the worst edit at stage 7 | 75 % of the order within a column, for an edit that adds something. An edit that takes out or moves has no floor: under the walk the worst keeps 48 %. Set again after the measurement | 2026-11-23 |
| The split column of a context view | From 16 boxes, as stage 5 built it. Split at every size, the small context views held worse | 2026-11-23 |
| Where finding things stands | Among the last stages: stage 25, before sharing. It was stage 10. Stages 11 to 25 became 10 to 24. Notes in `research/` written before this date name those stages by their old numbers | 2026-11-23 |

To settle in the stage named, with the recommendation the two proposals reached:

| Decision | Stage | Recommendation |
| --- | --- | --- |
| A call that does not wait | 10 | No field at stage 6b: a queue or a topic says it, and else the connection's name. Flows have asynchronous sends; ask again there |
| Groups, code that several apps share, one program that runs as several apps | A stage of its own, before 9 | Moved out of stage 6b, and still to be planned. Tools differ on whether a thing is in one group or in several |
| A condition as a record | When free words prove too loose | Open. At stage 6b nothing ties two records with one condition together but their spelling |
| Callers on the left and callees on the right in a context view | When a context view does not hold in the owner's reading | Not at stage 7. A first arrow back from a neighbour is the weak edit of a context view; sides by rule lift it and cost two views 9 to 22 % of their fit |
| A split of a context view's long column whose sides do not depend on a box's place | 9, or when a context view does not hold | Open. Today a neighbour added or taken out sends the boxes after it to the other side, and crossing 16 boxes redraws the view |

## Status

| # | Stage | Status |
| --- | --- | --- |
| 1 | Baseline research | done |
| 2 | Trial systems | done, accepted 2026-11-21 |
| 3 | Source directory | done, accepted 2026-11-21 |
| 4 | Basic modelling | built and tried; the ten changes of the trial made 2026-11-22; awaits acceptance |
| 5 | Automatic diagrams | built 2026-11-22; the trial with the owner is still to do |
| 6a | Hard cases in a picture | built 2026-11-22; the trial with the owner is still to do |
| 6b | Hard cases in a record | built 2026-11-22; the trial with the owner is still to do |
| 7 | Layout stability (gate) | built 2026-11-23; it passes its pass numbers, one of them set again after it was measured; the owner's judging of the pictures, which is the gate, is still to do, and stage 8 waits for it |
| 8 | C4 checks | |
| 9 | Focused views | |
| 10 | Flows | |
| 11 | Flow walkthrough | |
| 12 | Features | |
| 13 | Comparison | |
| 14 | Proposal | |
| 15 | Proposal in the viewer | |
| 16 | Proposal drift | |
| 17 | Review | |
| 18 | Checks on the change | |
| 19 | Decision record | |
| 20 | Applying | |
| 21 | Implementation status | |
| 22 | Goals and quality scenarios | |
| 23 | Constraints, assumptions, risks | |
| 24 | Team rules | |
| 25 | Finding things | |
| 26 | Sharing | |
| 27 | Installation | |

## Before building

### 2. Trial systems

- **Adds:** no concept. A task: the owner picks the few systems seefore is tried on.
- **Ends with:** a short list of systems in `research/trial/`. For each: a page in plain words
  on what it is, who uses it and how large it is; where the facts about it come from; what it
  will test, such as messaging, many services, one large application, outside services or
  more than one team; and whether it is private, and so kept out of Git or committed.
- **Picking:** the owner set the make-up of the set: Geena, Teleport, two real systems picked
  by Fable, two picked by Astra, and one imaginary system made up by each. The picks were
  made to differ in size and shape. A real system's facts are read from its public sources
  at a stated version. An imaginary system's page is the only truth about it.
- **Leaves out:** modelling any of them, which starts at stage 4. Scoring and benchmarks.
- **Skips:** parts 2 to 5 of "Every stage ends the same way". Its review against the research
  is the section "Why these" of `research/trial/README.md`.

## A. A reader worth using

### 3. Source directory

- **Adds:** what a seefore directory is. A marker file with the format version, the layout of
  the files, how a record is identified, and how the tool finds the directory.
- **Ends with:** the `seefore` command, installed from this repository and run from anywhere.
  `seefore check` loads a directory and reports problems. A broken file is reported and the
  rest still loads. A skill starts a new directory. The decisions marked for stage 3 are
  written down.
- **Trial:** start a directory for each trial system from outside the tool's checkout, at
  least one as a repository of its own and one as a subdirectory of another repository.
- **Leaves out:** element kinds, diagrams, importers.

### 4. Basic modelling

- **Adds:** person, software system, app, store, component, and connections between them,
  with the owner and the technology as records of their own. An app is what runs code and a
  store is what holds data; C4 calls both a container, and calls a connection a relationship.
  Each element has a name and, where it is known, a description, a technology and an owner. A
  person has no owner, and who answers for a part may be said later. One convention says what
  an arrow's direction means.
- **Ends with:** checks that ids are unique, parents exist and are of the right kind, nothing
  contains itself, every reference resolves, and a connection is not written again higher up
  in the same words. A modelling skill that adds, changes, renames, moves, splits and removes,
  and shows what a removal would break and leave behind. A plain listing of the model to read
  before the viewer exists.
- **Trial:** a first slice of each trial system: its people, the systems around it, its apps
  and stores, and the components of one app.
- **Leaves out:** custom kinds, queues and the other hard cases, views, deployment, any
  required depth.

### 5. Automatic diagrams

- **Adds:** the viewer. The engine serves the model on a local address, and the viewer draws
  it with automatic layout.
- **Ends with:** `seefore --server` opens a page with a context diagram for each system and a
  container diagram for each system that has something inside. Each has a title naming its
  type and scope, a legend made from what is drawn, boundaries, labelled arrows, and a panel
  with an element's details. The page follows the files as they change. A broken file shows
  as an error with its place, and the rest still draws.
- **Trial:** open each trial system and follow real dependencies with the owner. Note where a
  picture misleads.
- **Leaves out:** editing, dragging, stored coordinates, styling controls, search.

### 6a. Hard cases in a picture

- **Adds:** what a connection passes through ("via"), with a record of its own for a thing
  that only passes exchanges on; queues and topics as kinds of store; and a mark for somebody
  else's system. For each: one convention, one check, and guidance from the skill at the
  moment of modelling. These are the hard cases that change what a picture shows.
- **Ends with:** a spec page with the conventions and their reasons. Checks that flag a
  message broker drawn as one box, and infrastructure such as a load balancer drawn as an
  app. The viewer shows what a connection passes through, tells a queue or a topic from
  another store, and tells somebody else's system from ours. The skill proposes each lift
  from a description to a person; no script lifts one unread.
- **Trial:** the real proxies, gateways, brokers and third-party services of the trial
  systems, read in the pictures.
- **Leaves out:** what stage 6b adds. Deployment views, data models.

### 6b. Hard cases in a record

- **Adds:** a store that one app keeps, a piece of infrastructure in a system, reads and
  writes of a store, who opened the channel a connection travels down, and a condition on a
  part or a connection. For each: one convention, a check where a check can tell, and guidance
  from the skill at the moment of modelling.
- **Ends with:** the spec page of stage 6a, with these conventions and their reasons. The
  viewer shows each where a picture has room for it. The skill proposes each lift from a
  description to a person.
- **Trial:** the real stores, pushes, conditions and routes of the trial systems.
- **Leaves out:** a field for a call that does not wait, which waits for flows. Groups, code
  that several apps share, and one program that runs as several apps: a stage of their own,
  still to be planned. Deployment views, data models, typed shapes of deployment.

### 7. Layout stability (gate)

- **Adds:** no concept. A task: the pictures must hold when nobody can drag a box.
- **Ends with:** the same input gives the same picture. A new name moves nothing but its
  words. Adding, removing or moving one element leaves the rest in the same order: the place
  may shift, the order holds. A view of more than 40 boxes is reported and drawn as a map;
  the limit is chosen on the real data. Whatever is pointed at says its words at any zoom.
- **Trial:** make those edits on the trial models with `scripts/steady.mjs` and compare the
  pictures before and after. The owner judges the densest real view by a task: find a box
  again, follow an exchange.
- **Gate:** if this fails, work stops here until the layout is fixed or the approach is
  changed. Nothing is built on a layout that does not hold.
- **Leaves out:** stored coordinates, manual positions, a promise that nothing moves after a
  structural change. Layout hints, which wait for the view record of stage 9.

### 8. C4 checks

- **Adds:** the C4 notation rules as one named set, each with a severity.
- **Ends with:** checks for a missing description, a missing technology, an unlabelled or
  vague connection, and an element connected to nothing. "Unknown" is allowed while
  exploring. Each check says how much it looked at, so a check that looked at nothing says so.
  An exit code for CI.
- **Trial:** run on every trial system. Every finding is fixed in the model, or shows that
  the rule is wrong.
- **Leaves out:** the team's own rules, and any judgment of whether a description is right.

### 9. Focused views

- **Adds:** a view as a record: a name, a purpose, a scope, and a rule for what it includes.
  Component views, a landscape, "this element and its neighbours".
- **Ends with:** the default views stay. Named views live in files. Connections are rolled
  up to the level shown and still lead to the real ones beneath. A view cannot state anything
  the model does not. A crowded view has its remedy: a picture of one box with its
  neighbours. If a trial asks for a layout hint, it lives on the view record and never on a
  part.
- **Trial:** on the trial systems: a component view of a real app, a "this service and
  its neighbours" view, and a landscape with the systems around it.
- **Leaves out:** a query language, a view for every element, deployment views.

## B. Behaviour

### 10. Flows

- **Adds:** a flow: a named scenario with a trigger, an outcome and ordered steps. A step has
  its own id. A message step uses a declared connection. A step can also be an internal
  action or a note. Sends can be asynchronous, and a reply can travel against the arrow.
- **Ends with:** checks that every step resolves. A flow skill. A sequence view.
- **Trial:** one real path from end to end in each trial system.
- **Leaves out:** branches, loops and parallel steps; a failure path is a flow of its own for
  now. Features.

### 11. Flow walkthrough

- **Adds:** reading a flow on the structure.
- **Ends with:** the steps highlighted one by one on the diagram. A way from an element or a
  connection to the flows that use it. Each flow is marked exploratory or kept, and a kept
  flow has an owner.
- **Trial:** walk the same paths with the owner.
- **Leaves out:** runtime tracing, and any claim that a valid flow is how the system behaves.

### 12. Features

- **Adds:** what a flow belongs to.
- **Ends with:** a decision made on the data: a feature is a record of its own, or only a
  label on flows. Either way the viewer lists features and leads from a feature to its flows
  and the elements they touch.
- **Trial:** group the real flows of the trial systems by feature and see whether a label is
  enough.
- **Leaves out:** tracing requirements to components, a hierarchy of features.

## C. Change

### 13. Comparison

- **Adds:** the difference between two revisions of a source directory, by id.
- **Ends with:** `seefore diff` between two Git revisions or two directories: added, removed,
  changed, moved, changed in kind. It covers elements, connections, views and flows, as text
  and as data. Changes that only affect presentation are kept apart.
- **Trial:** two real states of a trial model from the stages so far.
- **Leaves out:** any workflow, merging.

From here on, every new concept also teaches the comparison.

### 14. Proposal

- **Adds:** a proposal: a Git branch on which the skill changes the model, and a brief that
  names its baseline.
- **Ends with:** the brief: the need, goals and non-goals, the change in words, alternatives,
  risks, open questions. A skill that opens a proposal, writes the brief, makes the change and
  runs the checks on the proposed state. The engine lists open proposals and loads a proposed
  state.
- **Trial:** re-do one real past change of a trial system from its original need.
- **Leaves out:** review, decision, applying, proposals that depend on other proposals.

### 15. Proposal in the viewer

- **Adds:** reading a proposal.
- **Ends with:** a list of proposals. For each: as-is, changes and to-be on one layout, so
  nothing jumps. Added, changed and removed are marked with a legend and a cue beyond colour.
  A list of the changes in words. The flows affected. A direct change is told apart from what
  is only reachable through dependencies.
- **Trial:** read that proposal as a reviewer would, without its author.
- **Leaves out:** comments, a roadmap of several future states.

### 16. Proposal drift

- **Adds:** what happens when main moves, and when two proposals meet.
- **Ends with:** a stale baseline is detected. Two open proposals that touch the same record
  are reported on both. A skill brings a proposal up to date and runs the checks again.
  Nothing is overwritten silently.
- **Trial:** change main under two open proposals of a trial system, once in conflict and
  once not.
- **Leaves out:** automatic resolution of conflicts, a merge engine of our own.

## D. Decision

### 17. Review

- **Adds:** the review of a proposal: who is accountable, who decides, who can block and on
  what concern, who is consulted, and by when. Findings.
- **Ends with:** a finding is pinned to an element, a connection, a flow step or a passage
  of the brief, and to the revision reviewed. It is blocking or advisory. It ends as
  addressed, declined with a reason, or deferred to an action with an owner. A review skill
  runs a few reviewers, each with one lens. The viewer shows findings on the diagram and in a
  list. "Review is done" is computed from the record.
- **Trial:** review the proposal from stage 14. Decline one finding with a reason and defer
  one.
- **Leaves out:** chat, notifications, boards, votes, sign-off by an AI.

### 18. Checks on the change

- **Adds:** checks that compare the proposed state with its baseline.
- **Ends with:** the checks run on the proposed state and report what the proposal makes
  worse and what it fixes. Existing debt stays visible and does not block.
- **Trial:** the same proposal on a model that already has open findings.
- **Leaves out:** the team's own rules.

### 19. Decision record

- **Adds:** the decision on a proposal.
- **Ends with:** the outcome: accepted, accepted with conditions, rejected, deferred or
  withdrawn. Who decided, when, and on which revision. The reasons, the alternatives weighed,
  and the conditions with their owners. The record is kept on main for accepted and rejected
  alike. It is never edited, only superseded. The viewer shows the decisions about an element.
- **Trial:** decide between two real alternatives for a trial system, delete the branches,
  and find the reasons again from main.
- **Leaves out:** a decision made by an AI, a record for a trivial edit.

### 20. Applying

- **Adds:** applying an accepted proposal to main.
- **Ends with:** a skill that merges only when the decision is to accept, the review holds for
  the current revision, and the full checks pass on the result. A receipt in the record.
  Never half-applied. Undo goes through Git.
- **Trial:** apply a change to a trial model, force a conflict, and restore the model as it
  was.
- **Leaves out:** applying in parts, migration steps.

### 21. Implementation status

- **Adds:** what happened after acceptance.
- **Ends with:** dated entries on the decision: implemented, verified, by whom, and where the
  evidence is. Parts of the model that are approved and not yet built are shown as planned.
  Missing evidence is shown as missing.
- **Trial:** follow one real change from accepted to working, on a trial system whose code is
  at hand.
- **Leaves out:** detection from code, a badge that says "up to date".

## E. What a design is judged against

### 22. Goals and quality scenarios

- **Adds:** a few goals in order of priority, and measurable scenarios: the source of the
  stimulus, the stimulus, the conditions, the affected part, the response and its measure.
- **Ends with:** links from a scenario to elements and flows, and from a decision to the goals
  it serves. The viewer shows them on an element and on a proposal.
- **Trial:** the real design criteria of the trial systems.
- **Leaves out:** a questionnaire, a goal on every element, targets filled in by default.

### 23. Constraints, assumptions, risks

- **Adds:** where these live.
- **Ends with:** sections of prose in the brief and the decision first. A record of its own
  only for one that a real operation needs, such as a constraint a check refers to, or an
  assumption several proposals share.
- **Trial:** take them from real past changes of the trial systems and see which, if any,
  must be records.
- **Leaves out:** a schema per kind by default, registers nobody reads.

### 24. Team rules

- **Adds:** the team's own rules, checked over the model.
- **Ends with:** a rule has a reason, a scope and a severity, and is switched on per source
  directory. A result is pass, fail, exempt or unknown; "not run" and "looked at nothing" are
  told apart. A baseline for existing debt. Exceptions with an owner and an end date. The
  rules also run in "Checks on the change".
- **Trial:** on a trial system, two rules, "every element has an owner" and "every call to an
  external system names its protocol", and one rule whose scope is empty.
- **Leaves out:** a rule language, scores.

## F. For other people

### 25. Finding things

- **Adds:** search and navigation in the viewer.
- **Ends with:** search over names, ids, descriptions, owners and technologies. A stable link
  to every element and view. Drill-down from landscape to system to app. The element
  panel shows what goes in and out, the owner, and the views it appears in.
- **Trial:** someone who does not know a trial system finds a service, its owner and what
  depends on it, without help.
- **Leaves out:** a page per kind of record, a team directory.

### 26. Sharing

- **Adds:** reading without installing.
- **Ends with:** `seefore build` writes a static, read-only site from one revision, with the
  proposals, their comparisons and their decisions. A view can be saved as SVG. The site says
  which revision it shows.
- **Trial:** give an offline export of a trial system to a reviewer, who follows its links
  without help.
- **Leaves out:** hosting, accounts, permissions, export to other diagram languages.

### 27. Installation

- **Adds:** other people.
- **Ends with:** a released package and plugin. A check that their versions fit each other
  and the directory's format. Migration between format versions. A short guide to getting
  started, and a command for troubleshooting.
- **Trial:** a person new to seefore installs both, opens a real directory from any path,
  makes an edit with the skill and takes a proposal to a decision, without help.
- **Leaves out:** migration from earlier tools, shipping private trial data.

## Why this order

- The trial systems are picked first, so no format is shaped around one system.
- Layout is the largest risk. Nobody can drag a box, so automatic layout carries everything.
  It meets real, nested diagrams at stage 5 and must pass the gate at stage 7.
- Running from outside the checkout from stage 3 keeps rule 6 honest every day.
- The viewer is not a last stage. It grows a slice per stage, because "does it fit" needs
  something to look at.
- Comparison comes before the proposal, and the proposal before review. Each is tried on real
  data before the next is built on it.
- Extra data comes last. A working path to a decision shows which of it is needed.
- Finding things stands among the last stages, before sharing: search, links and drill-down
  are for a reader who does not know the system.

## Not building

Editing in the GUI. Element kinds of the user's own. Code-level diagrams. A health score.
Sign-off by an AI. A rule language. An enterprise architecture suite or a second service
catalog.

## Deferred past this list

Deployment views. Several repositories joined by a catalog. Import from code or
infrastructure. An MCP server. Branches and parallel steps in flows. Proposals that depend on
other proposals. Hosted collaboration.

## Open questions

Stage 6b changed three answers of earlier stages. Each is in the spec of its stage. None of
those stages was accepted when it was changed.

| What changed | The earlier answer | Now | Decided |
| --- | --- | --- | --- |
| What `via` may name (stage 6a) | A thing that is on the way only sometimes stays in words | A thing that has `only` may be named: it is on the way whenever it is there | By the owner, 2026-11-22 |
| Who opens a channel (stage 4, convention 1) | The description of the push says who opened it | `opens: to` says it | By the owner, 2026-11-22, with the format of stage 6b |
| Which systems have a container view (stage 5) | A system that has an app or a store | Also one that holds a piece of infrastructure with a box of its own | In the build of stage 6b, after its review. For the owner to confirm |

Open after the trial of stage 6b, for the owner:

- **A hop that an exchange cannot go round.** A connection has no condition from what it passes
  through, so such a connection says the hop's condition again, and in the trial it did so in
  other words.
- **One condition in several wordings.** Nothing but the listing's "Conditions" guards against
  it. If it keeps happening, a condition needs a record.

Stage 7 changed two answers that stood before it, took back one of its own, and set one of
its pass numbers again:

| What changed | The earlier answer | Now | Decided |
| --- | --- | --- | --- |
| The dashed outline for a thing that has `only` (stage 6b) | Built and switched off, for the owner to decide | Taken out | By the owner, 2026-11-23 |
| Layout hints (this plan, stage 7) | The skill can write direction, grouping and order | None. On the view record of stage 9, if a trial asks | By the owner, 2026-11-23 |
| The split column of a context view (stage 5) | From 16 boxes | From 16 boxes still. The owner decided on 2026-11-23 to split at every size; built and measured, the small context views held worse, and the build took it back | In the build of stage 7; confirmed by the owner, 2026-11-23 |
| The floor for the worst edit (stage 7, pass number 3) | 75 % of the order within a column in the worst edit of any kind | 75 % in the worst edit that adds something. Six of 316 edits that take out or move keep less, the worst 48 % | By the owner, 2026-11-23, after the measurement |

Open after the trial of stage 7, for the owner:

- **The gate waits for the owner's reading.** The stage passes its numbers, one of them set
  again. Nobody but a program has judged a picture of it. Before stage 8 starts, the owner
  does two tasks of `research/trial/stage-07.md`: Syncthing's container view as it was and as
  it is, for the price in crossings; and Sentry's with its web app taken out, the worst edit
  there is. If the second leaves the reader lost, the order of a column becomes "every start
  first".
- **More crossings where lines are followed.** A third more over the main views; a view with
  one hub and many spokes goes from 5 to 49.
- **The long column of a context view.** Crossing 16 boxes redraws the view, and in a split
  column a neighbour added or taken out sends the boxes after it to the other side.
