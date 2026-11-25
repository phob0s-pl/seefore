# seefore: plan 3

Plan 2 built the tool: a model, a check, a page, changes and their reviews. Nothing writes
them yet but an assistant by hand. Plan 3 finishes the project: the process, the skills that
carry it, and experiments that say what each skill is worth. The owner set its six stages on
2026-11-25. Fable and Astra each planned them apart (`research/plan3/`, out of Git).

## What "final" is

Three things, true together:

1. **Somebody who is not the owner installs it**: the package, the plugin with the skills, a
   README of 100 lines, `--help`.
2. **The whole path runs in a fresh session on a repository nobody tuned on**: a model, its
   flows, its context, a change, a review, a yes, the change applied, a clean check.
3. **Every skill has its numbers** on a subject it was not tuned on, good or bad, in
   `results.md`, and the README says them.

## The limits

| What | Limit |
| --- | --- |
| A stage | As in plan 2: 60 minutes of agent work, cut at 45; a spec of 100 lines; about ten tests; a pull request of 20 lines |
| A skill | At most 120 lines. **No Git: no branch, commit, pull request or merge.** It holds the order of work and what it never does. The words of the format come from the tool (`seefore guide`), not from the skill's text |
| A loop | Try, tweak, review: at most twice. Between the rounds a skill changes in at most five places, each tied to a counted fault |
| An experiment | At most 16 runs, a page of 40 lines, its bar written before the first run |
| Plan 3, whole | About 40 agent hours, 120 runs, 200 US dollars of runs, three hours of the owner |

## What an experiment is

| Part | What it is |
| --- | --- |
| Question and bar | One question, and the numbers that are good enough, written before the first run |
| Fixed | The skill's text, the model that runs it, the subject at a commit, the key, the words typed |
| A run | One fresh headless session, in a copy that holds the subject and nothing else. A script makes the copy, runs, and keeps the output and the transcript |
| What is hidden | It never lies in the copy. A run has no free shell. Every hidden file bears one made-up word, and the script looks for it in the copy before the run and in the transcript after |
| Counted | By a script against the key: at most eight numbers, as "8 of 10" |
| Judged | A program first. A second model only matches, yes or no: "is this record that item?" It never says how good a thing is. The owner judges only what this plan names |
| Two rounds | Round 1 on the subjects to tune on. Round 2 adds a subject held back: its numbers are the result. One run without the skill on that subject says what the skill adds |
| Kept | `research/experiments/<id>/`, out of Git: one page and the outputs. One line in `results.md`, in Git: counts only, no private name |
| A bar missed after round 2 | Published as it is. There is no third round |

## Which model does what

| Job | Model |
| --- | --- |
| Specs, every skill's text, the keys, joining, reading the worst run | Fable, the main session |
| Builds, the runs, web research, the matcher for the private system | Opus 5.5. Every skill is measured on Opus |
| The played person | Sonnet 5.5 |
| A second view of the process and of each skill's text; the second organisation; the matcher for public subjects. Never private data | Astra |
| The bars, the private key, twenty review points (act or ignore), ten questions (would I want this asked?) | The owner |

## The process and the skills, in outline

Stage A fixes these. A skill is called by its name; five lines in `CLAUDE.md` point at the
model, since a pointer is always loaded and a skill is not.

| Skill | A person calls it when | Writes | Never |
| --- | --- | --- | --- |
| `model` | A repository has no model, or the code has moved | The parts, stores, connections; each running part with its `source` in the code | Reads all the code; invents a person or an owner; writes a flow or a change |
| `flows` | A model is there and a journey is named | Features, flows, data, one journey at a time | Adds a part without a yes; writes a step it did not find |
| `context` | After `model`, and when a review shows that something unwritten decided | Lines of context and rules, each the person's own, with its `why` | Writes a line nobody said |
| `change` | Somebody wants something changed | The change; after a review, its corrections | Edits a record of the model; decides; applies before the yes |
| `review` | A change is drafted, in a session that did not draft it | The review | Edits the change; approves; makes a point of wording |

**The tool lacks, for this**: the commands `init`, `list`, `guide`, `apply` and `--help`; the
key `source` on a part and the key `decided` on a change; the rest of the review's check.

## The stages

A stage's parts are named when it starts, as in plan 2. Runs are counted against the limit.

### A The process and the skills

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| A1 | The process | One page: each step from a repository to a model and from a prompt to an applied change, who does it, where the person decides; the five skills, each with what it never does | Fable and Astra apart, then joined; the owner approves | 0 |
| A2 | What the skills need of the tool | `seefore init`, `list`, `guide`, `--help`; `source` on a part, with a warning when its path is gone; the plugin's frame | Opus | 0 |
| A3 | The runner | A script that makes a copy, runs a skill headless, resumes it with an answer, scores it against a key and writes the page. Tried with a dummy skill on Vellumoak | Opus | 4 |

### B A model from code

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| B0 | Research on skills | One page: the vendor's rules for a skill, what makes one open, how others measure skills, the public skills that write an architecture, what to copy | Opus, on the web | 0 |
| B1 | Repositories and keys | Shallow clones at the trial systems' tags in `research/repos/`, out of Git. A key for each: 20 to 40 things that run or hold data, each with the path that proves it; 10 to 20 connections; 5 to 10 traps, inner parts that must not become apps | Opus drafts, a script drops what has no path, Fable reads; the owner reads the private one | 0 |
| B2 | The skill `model` | Two rounds. Counted: items found, missed and made up; traps fallen into; connections; people and owners invented; what the check says; files read, minutes, dollars. Bar: 8 of 10 items, 6 of 10 connections, at most 1 in 10 made up, a check with no error | Fable writes, Opus runs, Astra reads the text | 15 |

| Repository | Its part | Why |
| --- | --- | --- |
| Syncthing 2.0, Sentry 26.11 | To tune on | One is small enough to read whole; the other has many services |
| Teleport 18.11, the private system | Held back | One binary of eleven services is the trap of level. The private one is the only system an assistant cannot know from its training; counts only |
| GitLab 19.6 | Once, in round 2 | It shows what the limit of files read costs |
| Home Assistant | Left out | A sixth clone and no new trap |

- **The key is not today's model**: the trial models were written from documents. A record that
  a run finds and the key lacks is judged once, and a true one joins the key.
- **Staying true is measured once**: a model of Syncthing made at an older tag, then `model`
  again at 2.0, counting the differences of the key that it finds.
- **Feedback on the modelling**: after a run its session is asked once what it could not say
  in the format, which message of the check did not help, and which convention it guessed.
  The script adds each rule that fired. All goes to one list; a line said by three runs on two
  systems is a candidate. The format stands still until C2.

### C Flows from code

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| C1 | The skill `flows` | As B2, on the same repositories. The key is three journeys a repository: the parts each passes, in order, with a path. A run starts from a fixed model, so that C does not count B's faults. Counted: parts passed in order, steps not known, steps made up, connections the journey needs and the model lacks | As B2 | 12 |
| C2 | The modelling's tweaks | The owner picks from the list of B and C; the format and the check change once, before D writes two models in them | The owner picks, Opus builds | 0 |

### D Two organisations, questions and context

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| D1 | Two organisations | A hospital group: about 35 apps, 20 of them bought, 9 teams; its own machines, nightly batches, bound by law and contracts. A grocery delivery firm: about 55 services, 14 topics, 12 teams; cloud, events, bound by cost and habit. Each with the parts below | Fable writes the first, Astra the second, which is held back; Opus the records | 0 |
| D2 | The skill `context`, and two experiments | **Questions**: hidden lines brought out, of 24; questions asked; questions the model answers already. Bar: 12 of 24 in at most 15 questions. **Context held**: the lines and rules it wrote are laid on the model; faulty seeds that `seefore check` now refuses, of 6; clean seeds refused, of 2; lines made up. Bar: 3 of 6, 0 of 2, none made up | Fable, Opus | 6 |

| Part of an organisation | Holds | A run sees | The played person sees |
| --- | --- | --- | --- |
| `public/` | Its facts and its model, 400 to 600 records, with the few lines of context it has written | All | All |
| `future.md` | Eight features to come, each as a person types it | One, as its prompt | All |
| `hidden/facts.md` | 24 lines: 10 facts, 6 assumptions of which 2 are false, 8 preferences. Each says who knows it and which features it bears on | Never | The lines of its own role |
| `hidden/seeds/` | Eight changes written by hand: six break one hidden line each, two are clean | Never | Never |

**The played person is a script.** When a skill's turn ends in questions, a call gets its
role's lines and the questions, and answers by fixed rules: only what is asked, in two
sentences, "I do not know" beyond its role, an assumption as "I believe", nothing offered.
Boxwick and Vellumoak stay beside: Boxwick's seven changes tune E, Vellumoak is the README's
example.

### E Changes

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| E1 | Deciding and applying | The key `decided` on a change; the person's word on a declined or reopened point; `seefore apply`, which lays an accepted change onto the files. A test, no experiment: Boxwick's seven apply and check clean | The main session defines, Opus builds | 0 |
| E2 | The skill `change` | Boxwick's seven prompts to tune on. Then three features of each organisation, the person played, in three arms: no context, the context D's skill wrote, the key's context. Counted: a clean check; hidden lines broken; questions that changed the draft; lines of `given` nobody said. **The arms' difference is the worth of context, as a number** | Fable, Opus | 25 |

### F Reviewers

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| F0 | The search | One page from the web: reviewers whose text is public, what large teams describe, the lists a design is reviewed by, public skills that review architecture. From each: what it looks for, what it is told not to flag, the shape of a finding | Opus | 0 |
| F1 | The review's check | What D4b left: the mark of what a review read, a review behind its change, an address that names nothing | Opus | 0 |
| F2 | The skill `review` | Two readers are tried and no more. Round 1: both on the first organisation's eight seeds. Round 2: the better one on the eight held back, then again after `change` corrects four. Bar: 4 of 6 seeded faults found as a block, no block on a clean seed, 14 of 20 points that the owner would act on | Fable, Opus; the owner marks 20 points | 32 |

### G The release

Added to the owner's six: without it nothing shows that somebody else can use it.

| # | Stage | Result | Who | Runs |
| --- | --- | --- | --- | --- |
| G1 | The release | A README, the package and the plugin, published | Opus, the owner | 0 |
| G2 | The whole path | From the README alone, on a repository never used: model, flows, context, a change, a review, a yes, applied | Opus runs, the owner reads | 6 |

## What is out

- **Later**: the diagram of a change (D8); the page's tweaks; a reviewer on another vendor's
  model; a check of drift in CI; skills for other assistants; a trial with several real people.
- **Never**: Git in a skill; approval by an AI; a panel or a debate of reviewers; a model made
  anew from code at each change; a third round.

## For the owner to decide

| # | The choice | Proposed | The other way |
| --- | --- | --- | --- |
| 1 | The skills | Five, and `init` as a command | One skill with modes: a shorter list, one long text opened whole |
| 2 | A `source` on a part | Yes: it alone ties a record to code, and lets a program score B | No new key: a second model matches everything |
| 3 | The private system, held back in B and C | Yes, on this machine, counts only | Public only: a result may then be memory, not reading |
| 4 | The organisations | Two new ones, a hospital group and a grocery delivery firm | A railway and a payer of music royalties, as Astra proposed; or grow Boxwick, which saves about five hours and hides nothing |
| 5 | Stage G | Kept | Dropped: plan 3 ends with the reviewers, as the owner listed |

## What is not known

- **Whether a headless session can be resumed with a played person's answer.** D and E rest
  on it, and A3 proves it first.
- **How much of a well-known repository an assistant knows without reading it.** The private
  system is the only guard.
- **Whether 120 lines hold `model`, and whether two rounds are enough.**
- **Every number will be small**: two to four subjects, two runs each. They give a direction,
  not a rate. The played person never tires or misreads, which flatters `context` and
  `change`. Seeded faults are the faults we thought of.
