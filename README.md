# seefore

seefore keeps the architecture of a software system as YAML files, one record a file, in a
folder `architecture/` of the repository it describes: the parts, their connections, the
journeys through them, what a design must respect, and the changes proposed to all of it. A
command holds the files and shows them as a page. Skills for Claude Code write them.

**Its state**: a trial, for work on your own machine from a clone. The six skills are
written. The numbers below are small and say what was not reached.

## Set it up

You need Node 24 or later, npm and Claude Code.

    git clone <this repository> seefore && cd seefore
    npm install
    npm run build       # the page
    npm link            # puts the command `seefore` on your path, run from this clone

The skills lie in the clone's `plugin/` folder. In a terminal, start Claude Code with them:

    claude --plugin-dir <clone>/plugin

For the desktop app or an editor, register the clone once, as Claude Code's documentation has
it for a local folder, and start a new session:

    claude plugin marketplace add <clone>
    claude plugin install seefore@seefore

## Start in a project

In the root of the project's repository:

    seefore init --name="Name of the system"

It writes `architecture/seefore.yaml` and five lines into `CLAUDE.md` that say where the model
is. Then open the project in Claude Code. A skill runs only when you type its name. Where code
lies in other repositories too, the model holds a record of each in `repositories/`, and a
system or an app names the one its code is in: `seefore guide repositories`. Where the code
is in reach, `change` and one reader of `review` read it for the facts a design leans on.
In reach is the repository that the model's folder lies in, and one whose record says
`workspace: true` and whose folder is there. No place of the code is written into a record,
a change or a review: a file and its line are said in a skill's last message alone.

| You type | It does | It never |
| --- | --- | --- |
| `/seefore:model` | Reads the code and writes the parts, the stores and the connections | Invents a person or an owner |
| `/seefore:flows <a journey>` | Writes one journey as a feature, a flow and its data | Writes a step it did not find in the code |
| `/seefore:context <what is about to change>` | Asks you up to fifteen questions, three at a time, and writes what you say | Writes a line you did not say |
| `/seefore:change <what you want changed>` | Looks at the code in reach, asks at most three questions, then drafts one change in `changes/` | Edits a record of the model, or decides |
| `/seefore:review <change>` | Four readers, each with a lens of its own, read the change apart from your session, one of them with the code in reach; their points become one review of at most ten | Edits the change, approves, or raises a fault of the code alone |
| `/seefore:answer <change>` | Asks you what the review asks, corrects the change, and says of each point what was done; `review` then reads what was fixed | Applies before your yes |

A change holds what you asked, what you answered, what the skill chose without you
(`assumed`), and the records it adds, updates and removes. A review is a list of points, each
a block or a note; the page shows it beside the change. You decide, at any time:

    /seefore:answer <change> yes            # runs `seefore apply`: the records, and `status: applied`
    /seefore:answer <change> no <reason>    # writes `status: rejected`, and why
    seefore apply <change> --dry-run        # in a terminal: what a yes would write

## Look at it

    seefore check        # holds every file, and says how to mend each fault
    seefore list         # one line a record; `list changes` for the changes
    seefore guide apps   # the words of the format, for a folder or a skill
    seefore --server     # the model as a page, at http://127.0.0.1:4400
    seefore --help       # every verb; `seefore <verb> --help` says its options

## Update

    cd <clone> && git pull && npm install && npm run build

The command and the skills come from the clone, so both follow at once; an open session keeps
the skills it started with. Then `seefore check` in your project names each file that no
longer fits, with its mend.

## When something goes wrong

| You see | Do |
| --- | --- |
| `is not a model: it has no seefore.yaml` | Go to the project's root, or run `seefore init` |
| A skill stops as it loads | The session does not find `seefore`: run `npm link` in the clone again |
| An error of the check | Its `Mend:` line says what to change; Claude can act on it |

## What was measured

Each skill was run headless by Opus 5.5, on subjects it was not tuned on. One or two runs a
cell: a direction, not a rate. The specs in `specs/plan3/` hold the numbers whole.

- **`model`**, on five open-source systems: no app of 86 wrong, nothing made up, and 41 of
  469 connections with one end only.
- **`flows`**, on four journeys held back: 54 of 55 steps shown in the code. With the two keys
  of a step at a store, on three journeys in two rounds: 21 of 22 `access` right, and no
  `removes` that the code does not show; 6 of 20 takes written, 13 of the rest after the
  flow's end; on one journey 23 of 61 steps with no file that shows them.
- **`context`**, with a played person: 15 of 38 hidden lines found, and none written that the
  person did not say. It finds facts and misses preferences.
- **`change`**, on an organisation held back: no error of the check in 29 drafts. With a
  person and written context a draft broke 4 hidden lines, where the prompt alone broke 9.
  With the code in reach, its text tried before this release on four prompts of one system:
  the drafts rested on 1 of 10 known false premises about the system as it is, where the
  drafts without the code rested on 5.
- **`review`**, on the same organisation: 6 of 13 known faults raised as a block, where a plain
  reader raised 4; seven points in ten worth acting on, for about 1.70 US dollars a review.
  A plain reader with the code in reach, its text tried alone before this release on four
  changes of one system: 8 of 12 known faults raised as a block, and none of four planted
  faults of the code alone raised as a point.
- **`answer`**, on the same: of 7 faults that a review had raised, 6 were mended once its
  questions were answered. What a review missed mostly stayed.

## What is not there yet

- **A real person**: `context`, `change` and `answer` were tried with a played one only.
- **A count of false alarms for a reader with the code**, and the review with that reader
  inside it on more than one change.
- **An install without a clone**, a version, and a list of what each update changes.
