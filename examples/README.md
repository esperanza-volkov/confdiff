# Examples

Try this from the repo root:

```bash
confdiff examples/before.env examples/after.env
```

Expected output:

```
~ DEBUG      "false" => "true"
+ FEATURE_X  = "on"
~ PORT       "8080" => "9090"

3 changes: 1 added, 2 changed
```

Note that key order in the files is irrelevant, and the added/removed/changed
lines are sorted by path.
