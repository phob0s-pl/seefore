# JSON Schemas

One schema for each of the seventeen kinds of record (`apps.schema.json`, `people.schema.json`
and so on, with `repositories.schema.json`, a repository other than the model's own,
`features.schema.json`, `flows.schema.json`, `data.schema.json`, `rules.schema.json`, the
rules of a team's own, `context.schema.json`, the lines of context, `changes.schema.json`, a
change, and `reviews.schema.json`, the review of a change), and one for the marker
(`seefore.schema.json`). The
schema of a change refers to the others by their file names, for the records under `add`;
under `update` it holds the keys and leaves their values to `seefore check`. They are
written from the `zod` shapes in `src/model/records.ts` by `npm run schema`; a test fails
if they differ. Edit the shapes, not these.

A record holds no schema line, so an editor binds each schema to its folder. For VS Code with
the YAML extension, in `.vscode/settings.json` of the model:

    "yaml.schemas": {
      "<path>/schema/seefore.schema.json": "seefore.yaml",
      "<path>/schema/apps.schema.json": "apps/*.yaml",
      "<path>/schema/people.schema.json": "people/*.yaml"
    }

Add a line for each of the other fifteen folders in the same way.
