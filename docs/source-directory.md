# The source directory

Where an architecture lives as files, how seefore finds it, and how a record in it is named.
This is stage 3 of `plan.md`.

## What it is

A source directory is a folder in a Git repository that holds one architecture. It is the
root of a repository of its own, or a folder inside a larger one. It holds a marker file and,
in folders, records. It is the only place where anything about the architecture is true: the
engine keeps no state of its own, and the viewer never writes.

Main is the approved design. A design that is accepted, one that is applied to main, one that
is built and one that is verified are four separate states; later stages record each.

## The marker file

`seefore.yaml`, at the top of the directory:

```yaml
format: 1
name: "Boxwick"
```

| Key | Required | What it holds |
| --- | --- | --- |
| `format` | yes | The version of the format the directory is written in. A whole number. This is format 1 |
| `name` | yes | The name of the architecture: one line of text, at most 100 characters, not blank |

There are no other keys. The marker never names a machine, a path or a remote, so the
directory can be moved or cloned anywhere.

The file is named exactly `seefore.yaml`, in lowercase, and is a file, not a link. A marker
under another spelling, such as `seefore.yml`, still marks the folder, and is reported. Where
there is no `seefore.yaml`, the misspelt one is read in its place.

The format is read first, before any other rule is applied. A directory written in a format
this seefore does not know is refused whole. When the marker cannot say which format the
directory is in, nothing else in it is read: when `format` is missing, is written twice, or
the marker is a link or cannot be read. Either way no record is read under the wrong rules.

A source directory cannot sit inside another one. That is reported whichever of the two the
check starts from, and under any spelling of the inner marker's name.

## Records

- A record is one YAML file, `<folder>/<id>.yaml`. The file's name is the record's id.
- Records sit in folders directly under the top, one folder for each family of records. A
  folder is flat: no folders inside it.
- Later stages name the families. As of this stage format 1 has none, so a source directory
  holds only its marker.

## Ids

- An id is lowercase letters and digits, in groups joined by single hyphens. It starts with a
  letter and has at most 80 characters: `order-events`.
- An id names one record in the whole directory, whatever folder it is in.
- An id is given once and never changed. It says nothing about the record's name, its kind or
  where it sits, so all of those can change while the id, and the file's name, stay.
- `true`, `false` and `null` are not ids, because YAML reads them as something else.
- `seefore` is not an id, because `seefore.yaml` is the name of the marker file. This was added
  at stage 4.
- The names Windows keeps for devices are not ids, because no file can have one: `con`,
  `prn`, `aux`, `nul`, and `com` or `lpt` followed by one digit.

## The YAML that is allowed

UTF-8 text, in YAML 1.2 with its core types, so `yes`, `no`, `on` and `off` are text. One
document in a file, with a mapping at the top, and text for every key. No directives (lines
that start with `%`), so a file cannot change what its own values mean. No anchors, aliases
or tags. No key twice in one mapping. A line may end in a line feed, a carriage return, or
both.

No comments. Nothing reads a comment, so what one says is lost to every tool. And in YAML a
`#` after a space starts one, which cuts a value short without a word: `port #9100` is read as
`port`. A comment is an error, wherever it stands. This rule was added at stage 4, whose trial
lost text that way.

A record's file ends in `.yaml`, in lowercase.

## Finding the directory

`--workdir=<directory>` says where to start; without it, the current directory. From there
seefore looks for `seefore.yaml` in that folder, then in each folder above it. The first
folder that has one is the source directory.

The starting path is resolved the way the system resolves it when a file is written there:
a link is followed before a `..` after it is applied. So "above" always means above on disk,
and a link into a source directory cannot make a folder look as if it stood alone.

A folder that seefore may not look into stops the search: it says so, since it cannot tell
whether that folder is a source directory.

seefore never picks a source directory below the starting folder. When it finds none above
and there is one within three folders below, it says where, with a command that works from
where the person stands.

## The command

```
seefore check [--workdir=<directory>] [--json]
seefore --help
seefore --version
```

`seefore check` reads the directory and reports problems.

- Every problem names a file, a line and a column, and says in plain words what is wrong.
- A broken file is reported and the rest is still read. A record's file that cannot be read,
  or is not UTF-8, is still a record for the others.
- A folder or a file that cannot be read is reported the same way.
- A YAML file that seefore does not read is reported as a warning, so a misspelt folder does
  not hide a record.
- It leaves alone: files that are not YAML, hidden files and folders, and `node_modules`.
- It does not follow links inside the directory. Each one is reported.
- It says how many records it read, so a check that looked at nothing says so.
- It exits with 0 when there are no errors, 1 when there are errors, and 2 when it could not
  start: a mistake in the options, a folder that is not there or cannot be looked into, or
  no source directory found.

### As data

With `--json` seefore prints one JSON object on the output and nothing else, whatever
happens. That holds for `--help` and `--version` too, which print `{"help": ...}` and
`{"version": ...}`.

When a source directory was read:

| Key | What it holds |
| --- | --- |
| `directory` | The source directory, as a full path with links followed |
| `name`, `format` | What the marker says, or `null` when it could not be read |
| `records` | How many records were read |
| `errors`, `warnings` | How many problems of each kind |
| `problems` | A list. Each has `file` (a path from the source directory, with forward slashes; `.` is the directory itself), `line`, `column`, `severity` (`error` or `warning`), `code` (a short, stable name) and `message` |

When seefore could not start, with exit code 2:

| Key | What it holds |
| --- | --- |
| `error.code` | `usage`, `not-a-directory`, `folder-unreadable`, `no-source-directory`, or `unexpected` for a fault in seefore itself |
| `error.message` | The same words a person would get |
| `error.start` | With `no-source-directory`: the starting folder as it really is on disk, as a full path |
| `error.below` | With `no-source-directory`: the source directories found below, as full paths. Absent when there are none |

Without `--json`, a result goes to the output and a reason for not starting goes to the
error output.

### Problem codes

Every problem has a code. A code keeps its meaning from one version to the next.

| About | Codes |
| --- | --- |
| The marker | `marker-missing`, `marker-name`, `marker-link`, `marker-nested`, `format-not-readable`, `format-unknown` |
| What a file may hold | `key-missing`, `key-unknown`, `value-wrong-kind`, `value-too-small`, `value-too-big`, `value-not-allowed`, `value-invalid` |
| YAML | `yaml-empty`, `yaml-syntax`, `yaml-key-twice`, `yaml-many-documents`, `yaml-not-mapping`, `yaml-key-not-text`, `yaml-directive`, `yaml-anchor`, `yaml-alias`, `yaml-tag`, `yaml-comment` |
| Records | `id-invalid`, `id-twice`, `record-nested`, `record-extension` |
| Reading the disk | `not-read`, `link-not-followed`, `not-utf8`, `file-unreadable`, `folder-unreadable` |

The command only reads. `seefore --server --workdir=<directory>` serves the viewer; it is
described in `diagrams.md`.

## The skill

The skills are a Claude Code plugin named `seefore`. This stage adds one skill, `init`, which
starts a source directory. It shows what it will write and where, waits for a yes, writes
`seefore.yaml` and nothing else, and runs `seefore check`. With `--dry-run` it stops before
writing. It never changes a marker that exists, and never starts a source directory inside
another.

## Decisions taken at this stage

| Decision | Outcome |
| --- | --- |
| Where a proposal lives | On a Git branch of its own, changed by the skills. A brief file in the source directory merges with it and stays. What changed is worked out by comparing revisions, so the format has no folders of overriding records |
| What main means | The approved design |
| Where the meaning lives | In the core library. It takes the text of the files and returns records and problems, and touches neither disk nor network, so it runs in Node and in the browser. The command reads files and prints. The viewer draws |
| Packaging | One npm package, `seefore`, with the command bundled into one file. The server and the built viewer join it at stage 5. The skills are a Claude Code plugin |
| The command line | Verbs are subcommands, starting with `check`. `--workdir` works with every one. The server keeps the owner's form, `seefore --server` |
| Ids | Readable, as above (the owner) |
| File layout | One file for each record (the owner) |

## Names this stage adds

A source directory. The marker file `seefore.yaml` with two keys, `format` and `name`. A
record and its id. One command, `seefore check`, with two options, `--workdir` and `--json`.
One skill, `init`.

## Leaves out

The families of records and what a record holds. Diagrams and the server. Reading Git. Any
command that writes.

## Against the research

Checked against `research/synthesis.md`.

Follows it:

- **Identity that never changes, apart from name and parent** (section 4, stage 2). The id is
  the file's name and nothing else, so renaming and moving a record leave it alone.
- **An open format in Git, so the model survives its tool** (1.17, and the risk "a tool is
  retired"). Plain YAML files, a format version, nothing about a machine in the marker.
- **A check that looked at nothing says so** (risk "a green check that checked nothing").
  The result counts the records it read, and names the YAML files it did not read.
- **One representation is authoritative** (risk "GUI and files become rival authorities").
  The files are; nothing else can write.
- **What main represents is stated** (1.11, stage 4 open decision 1): the approved design.
- **Fitting the work people already do** (2.1.3): files, Git, a command that prints
  `file:line:column`.
- **AI output is a candidate, and a person accepts** (1.16): the skill shows what it will
  write and waits.

Not from the research, but from the plan: **a broken file is reported and the rest still
loads**. The synthesis does not ask for it. It is a lesson of the earlier tool, written into
stages 3 and 5 of `plan.md`. Each file is read by itself, and a problem carries its file,
line and column.

Departs from it, with the reason:

- **"Two editing surfaces over one model"** (1.7) recommends a GUI that edits. Here the GUI
  only reads, by the owner's first rule. The cost the research names, having to learn a
  format, is met another way: people ask a skill, and the skill writes the files.
- **Readable ids, not opaque ones.** The research asks only that identity never changes. A
  readable id invites a rename when the name changes, and a rename looks like one record
  removed and another added. The guard is the rule "given once", which the skills follow, and
  the comparison at stage 13, which must report a suspected rename.
- **Room to federate** (stage 2) is not built. An id is unique within one source directory,
  which leaves room: a later catalog can name a record by directory and id.

Risks it takes on:

- **A proposal as a Git branch** (stage 4, open decision 2). The research found branches with
  no comparison a dead end, and one user for whom plain branches did not fit publishing
  alternatives. So stage 13 must compare by id, and stage 15 must show a proposal without the
  reader checking out a branch.
- **Many small files.** One record a file gives small, reviewable changes, and it makes a
  directory hard to read by eye. That is accepted, since people read through the viewer.
