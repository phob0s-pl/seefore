---
name: init
description: Start a seefore source directory, the folder that holds an architecture as files. Use when someone wants to begin describing an architecture with seefore, or asks to set up, create or initialise a seefore directory.
argument-hint: "[directory] [name of the architecture] [--dry-run]"
allowed-tools: Bash(seefore *) Bash(git -C * rev-parse *)
---

# Start a seefore source directory

A source directory is the folder that holds one architecture as files. It lives in a Git
repository: as the root of a repository of its own, or as a folder inside a larger one.

This skill starts one by writing its marker file, `seefore.yaml`. It writes nothing else.

What the person typed after the command: `$ARGUMENTS`

## 1. Find out where, and what it is called

You need two things. Take each from what the person typed. Ask for whichever is missing; do
not guess it.

- **The folder** that will be the source directory. When asking, suggest `architecture/` in
  the current repository. Suggest the current folder only when it is empty.
- **The name of the architecture**, as people say it: "Boxwick", "Geena". It is one line of
  text, at most 100 characters, and not blank. If what you were given is not, say so and ask
  again. Do not shorten or change a name yourself.

## 2. Look before writing

Do these in order. Stop at the first that fails, and say why.

Only two shell commands are needed: `seefore`, and the one `git` command in step 4. Run each
as a command of its own, with nothing joined to it. To see whether a folder or a file is
there, use the file search tool, not `ls`.

1. Run `seefore --version`. If the command is not found, stop and say that seefore is not
   installed. Do not check anything by hand in its place.
2. Find out where the folder really is, and make sure no source directory is there already.
   Run `seefore check --json --workdir=<folder>` as a command of its own, with nothing after
   it, and read what it prints:
   - `error.code` is `not-a-directory`: the folder does not exist yet. Run the same command on
     the folder above it, and read again. Keep note of the parts of the path that do not
     exist yet.
   - `error.code` is `no-source-directory`: good. `error.start` is where that folder really is
     on disk, with every link followed. The folder to write in is `error.start`, followed by
     the parts that do not exist yet. Use that path from here on, not the one you were given:
     the two differ when a link is on the way.

     If `error.below` is there, a source directory already sits inside this folder. Stop.
   - Anything else: stop. A result that names a `directory` means the folder is a source
     directory, or sits inside one. `folder-unreadable` means seefore could not look, so there
     is no telling. A source directory cannot sit inside another, and this skill never
     changes a marker that exists.
3. If the folder exists, search it with the file search tool for a marker file further down,
   under any spelling of its name: `**/[sS][eE][eE][fF][oO][rR][eE].[yY]*[mM][lL]`. If there
   is one, stop: the new directory would have another inside it.
4. Run `git -C <the real folder, or the nearest folder above it that exists> rev-parse --show-toplevel`.
   - It prints a path: that is the repository the directory will be in.
   - It fails: the folder is in no Git repository. Say so. seefore keeps an architecture in
     Git, and its proposals will be branches. Offer to go on anyway. Do not run `git init`
     unless the person asks for it.

## 3. Show it, then wait

Show the person:

- the full path of the file you will write;
- its content;
- whether the folder exists or will be made;
- the Git repository it is in, or that it is in none.

Then ask whether to go ahead, and wait for a yes.

- If the person typed `--dry-run`, stop here and say that nothing was written.
- If the person has already said to go ahead without being asked, do not ask again.

## 4. Write the marker file

Write `seefore.yaml` in the folder as it really is, the path worked out in step 2, with
exactly this. Writing the file makes its folder when the folder is not there, so no `mkdir`
is needed:

```yaml
format: 1
name: "<the name>"
```

- `format` is `1`.
- Put the name in double quotes, always. Inside the quotes write `\"` for a double quote and
  `\\` for a backslash.
- Two keys and nothing more. No comment, no other key.

Write no other file: no README, no folder, no `.gitignore`.

## 5. Check it

Run `seefore check --workdir=<the real folder>`. It should end with
`0 records read. No problems.`

If it reports a problem in `seefore.yaml`, show the output, correct what you wrote, and run it
again. If it reports files it does not read, leave them alone and tell the person.

## 6. Say what happened

Tell the person:

- the file that was written;
- what the check said;
- that the directory holds no records yet;
- that nothing was committed.

Do not commit and do not stage. That is the person's step.

## Never

- Never change a `seefore.yaml` that exists.
- Never start a source directory inside another one.
- Never write a record, an id or a folder of records here.
