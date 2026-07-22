# Examples

## YAML (the hero example)

```bash
confdiff examples/before.yaml examples/after.yaml
```

```
~ env.LOG_LEVEL  "info" => "debug"
+ env.NEW_FLAG   = true
~ image          "nginx:1.25" => "nginx:1.26"
~ ports[1]       443 => 8443
~ replicas       3 => 5

5 changes: 1 added, 4 changed
```

Note that `image` and `replicas` were reordered and a comment was added in
`after.yaml`, but neither shows up as a change — only real data differences do.

## `.env`

```bash
confdiff examples/before.env examples/after.env
```

```
~ DEBUG      "false" => "true"
+ FEATURE_X  = "on"
~ PORT       "8080" => "9090"

3 changes: 1 added, 2 changed
```

Key order in the files is irrelevant; output lines are sorted by path.

## Cross-format equivalence

`confdiff` can compare a file against its migration to another format and
confirm nothing changed semantically:

```bash
confdiff config.json config.yaml   # -> "no semantic differences", exit 0
```
