# JSON Schemas

One schema for each of the fourteen kinds of record (`apps.schema.json`, `people.schema.json`
and so on, with `features.schema.json`, `flows.schema.json`, `data.schema.json`,
`rules.schema.json`, the rules of a team's own, and `context.schema.json`, the lines of
context), one for the marker (`seefore.schema.json`) and
one for the input of a change (`changes.schema.json`), which no folder is read with yet. They
are written from the `zod` shapes in
`src/model/records.ts` by `npm run schema`; a test fails if they differ. Edit the shapes, not these.

A record holds no schema line, so an editor binds each schema to its folder. For VS Code with
the YAML extension, in `.vscode/settings.json` of the model:

    "yaml.schemas": {
      "<path>/schema/seefore.schema.json": "seefore.yaml",
      "<path>/schema/apps.schema.json": "apps/*.yaml",
      "<path>/schema/people.schema.json": "people/*.yaml"
    }

Add a line for each of the other eleven folders in the same way.
