# JSON Schemas

One schema for each kind of record (`apps.schema.json`, `people.schema.json` and so on, with
`features.schema.json`, `flows.schema.json` and `data.schema.json`) and one for the marker
(`seefore.schema.json`). They are written from the `zod` shapes in
`src/model/records.ts` by `npm run schema`; a test fails if they differ. Edit the shapes, not these.

A record holds no schema line, so an editor binds each schema to its folder. For VS Code with
the YAML extension, in `.vscode/settings.json` of the model:

    "yaml.schemas": {
      "<path>/schema/seefore.schema.json": "seefore.yaml",
      "<path>/schema/apps.schema.json": "apps/*.yaml",
      "<path>/schema/people.schema.json": "people/*.yaml"
    }

Add a line for each of the other ten folders in the same way.
