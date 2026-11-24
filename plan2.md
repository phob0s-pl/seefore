# seefore: plan 2

We went too deep into making a "perfect" product from scratch. We start again, small. The old
work moves to `.old/` and is there to copy from.

## What went wrong, and the limit that answers it

| Problem | Limit for every stage |
| --- | --- |
| Too slow, agents work too long | 60 minutes of agent work; at 45 the stage is cut, not stretched. One builder, or two if the spec fixes what they share |
| Thousands of tests | About ten a stage, on what is seen from outside. The whole run takes under 30 seconds |
| Premature optimisation | None before milestone 7. Ideas go on its list |
| Too much to read | One spec of 100 lines at most and a pull request of 20. No other document |

Gone with the old plan: pass numbers, the trial on eight models with its note, and a plan from
outside for each stage.

## The loop of a stage

1. **Spec.** It says what you can do after the stage, what is in, what is out, an example, and
   the choices to approve.
2. **Approval** by the owner. Nothing is built before it. A stage that only defines something
   ends here.
3. **Build** on a branch, by one builder.
4. **Try** on the private model and one public one: the command runs and the page is read.
5. **Pull request.** The owner looks at the page, not at the code.

The spec of the next stage is written while this one is built, so nobody waits.

## Which model does what

| Job | Model |
| --- | --- |
| Specs, choices, reading the diff, joining the parts | Fable, the main session |
| A build that sets the structure or has hard logic; web research | Opus 5.5 |
| A build from a full spec: UI parts, checks, tests | Sonnet 5.5 |
| Work by rote: moving files, renames, many pictures | Haiku 5.5 |
| A second view on a choice that is costly to undo; never with private data | Astra |

- **The cheapest model that can do the job starts.** After one failed try the job goes one
  level up.
- **Work of under ten minutes is not handed out.** The main session does it.

## Milestones

The stages of a milestone are named when it starts, not before. Until milestone 8 there is no
skill: models are written by hand, or by Claude without one. The private paths that stages A4
and B3 use are in `research/paths.md`, out of Git.

### 1 Preparations

| # | Stage | Result | Who |
| --- | --- | --- | --- |
| A1 | Clear the ground | Everything but `research/` and this plan is in `.old/`, which Git ignores. Main is tagged first | Main session |
| A2 | Improve the research | A full synthesis and its essence in under 100 lines: how architecture is developed in 2026, what AI has shown there, what it changes here | Ten Opus agents, one question each |
| A3 | Code architecture | One page: the packages, what each may know of the others, the tools | Fable writes, Astra reviews |
| A4 | Minimal command | `seefore --server --workdir=<dir>` serves a page that says what it read | Opus |

### 2 Modelling

| # | Stage | Result | Who |
| --- | --- | --- | --- |
| B1 | Basic modelling | The records we had, taken from `.old` and cut to what is needed | Sonnet |
| B2 | Modelling rules | Every rule on one page, such as "no store in a store", each one a check | Fable defines, Sonnet builds |
| B3 | Basic UI | What we need of the owner's present UI, and its basic version | Fable defines, Opus builds |
| B4 | Architecture diagram | The model as one diagram | Opus |
| B4b | Layout of the diagram | Three zones at the Systems depth, people on the left below it, and a diagram small enough to read | Opus |
| B5 | Models | The records of the model, read on the page: five lists (software, actors, connections, technologies, owners) and a page for each record | Opus |
| B6 | A click on the diagram | A click on a box or a line opens a panel on the field that says what it is, with a button to its page | Opus |
| B7 | The highlight on the diagram | The mouse over a box or a line fades all but it and what it joins, and a pick holds the same | Opus |
| B8 | A focus on the diagram | At Containers one system, at Components one app, opened, with what it has a line with as closed boxes | Opus |
| B9 | The store rule of the layout | A queue or a topic stands between those who write it and those who read it | Main session builds, Opus reviews |

### 3 Flows and features

| # | Stage | Result | Who |
| --- | --- | --- | --- |
| C1 | What a feature is | One page | Fable |
| C2 | What a flow is | One page | Fable |
| C3 | Features and flows read | The two new folders are read and checked, with `seefore check` | Sonnet |
| C4 | Feature and flow UI | Both on the page | Opus |

**The MVP is the end of milestone 3**: the owner's own model as a diagram, with its flows and
features.

### After the MVP

- **4 Changes**: how a change is defined.
- **5 Additional architecture context**: what is needed.
- **6 Reviewers**: which reviewers we need.
- **7 Optimisations and UI tweaks**: the list the earlier stages filled.
- **8 Claude skills and process**.
