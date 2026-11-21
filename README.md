# seefore

Design software architecture on the C4 model, kept as files in Git. Claude skills write the
files, the `seefore` command reads and checks them, and a viewer will show them.

It is being built in small stages. `plan.md` has the stages and their status, and `docs/` has
one page for each concept built so far, starting with
[the source directory](docs/source-directory.md).

## What is here

| Path | What it is |
| --- | --- |
| `packages/core/` | The core library: the format and its checks. No disk, no network |
| `packages/cli/` | The `seefore` command, built into one file |
| `plugin/` | The Claude Code plugin with the skills |
| `docs/` | One page for each concept |
| `plan.md` | The stages, the rules and the decisions |

## Working on it

Needs Node 22 or newer.

```sh
npm install
npm run check          # type check, build, and every test
npm run install:local  # install the built command on this machine, as `seefore`
```

To use the skills while working on them, start Claude Code with the plugin:

```sh
claude --plugin-dir /path/to/seefore/plugin
```

Then `/seefore:init` starts a source directory, and `seefore check` reads one.
