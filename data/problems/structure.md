

# Problem Data Structure Guide

This guide explains how competitive programming problems are stored in the `data/` directory using structured YAML files, and how to convert them to and from a flat JSON file (`data.json`).

---

## Folder and File Layout

Each problem is associated with a contest (`source`), a `year`, and optionally an `extra` subdivision (e.g., "Round A", "December", "Open").

Problems are organized as:

```
data/<source>/<year>.yaml                for problems without 'extra'
data/<source>/<year>/<extra>.yaml        for problems with 'extra'
```

- `<source>` is lowercase (e.g., `ioi`, `usacobronze`)
- `<year>` is a 4-digit year (e.g., `2025`)
- `<extra>` is the original casing but with spaces replaced by underscores

### Examples

- `data/problems/ioi/2025/Day_1.yaml`
- `data/usacobronze/2025/Open.yaml`  
- `data/gks/2014/Round_A.yaml`

---

## YAML Format

Each YAML file contains a list of problems. These problems should include only the following fields:

```yaml
- name: Problem Name
  number: 1
  link: https://example.com/problem
```

**Do not include** `source`, `year`, or `extra` — these are inferred from the file's location.

IOI problems use `<year>/Day_1.yaml` and `<year>/Day_2.yaml`, with
day-local problem numbers. The existing 2009 and 2010 day files retain their
numbering. Incomplete years retain only the tasks already in the dataset.
Contest problem references must use the same `number` and `extra` (e.g. `Day 2`).

For an existing database, run `npx prisma migrate deploy` before
`npm run syncProblems` and `npm run syncContests`. Migration
`20261027050000_group_problems_by_day` updates IOI, BOI, POI and CEOI grouping.
Standard six-task years use the 1–3 / 4–6 day split
in place, preserving problem IDs, user progress, links, and contest history.
No separate data-migration command is needed. On an empty database, this
migration has no problem rows to update; normal sync creates the new keys.

BOI also uses day folders and day-local numbering for complete six-task years.
BOI 2016 uses a 3+2 split, applied by migration
`20261027050000_group_problems_by_day`. BOI 2011 retains its year-only layout.

POI day groups contain only official Stage III competition tasks, verified against
the [official task archive](https://www.oi.edu.pl/l/oi_zadania/). Some older finals
have five tasks; do not infer day boundaries from the number of entries alone.
Migration `20261027050000_group_problems_by_day` groups the remaining years and
removes eight incorrectly included practice/Stage I/extra tasks. Deleting those
records also removes their dependent progress and links; their IDs are never
repurposed. Run `syncProblems` afterward to add the six missing final tasks with
new IDs. Retained competition tasks keep their existing IDs and progress.

CEOI uses day folders for all existing years. Existing tasks and judge links are
preserved; missing tasks are not added. Day-local numbers retain gaps in sparse
years (2006, 2008, 2009, 2010, 2012, 2013 and 2016).
Assignments were checked against the [oj.uz source archive](https://oj.uz/problems/source/ceoi),
the [2005 QOJ collection](https://qoj.ac/problems?tag=CEOI+2005+Day+1), and official
organizer material. For 2025, the official
[Day 1](https://ceoi2025.utcluj.ro/getarticle/27) and
[Day 2](https://ceoi2025.utcluj.ro/getarticle/31) lists override conflicting oj.uz
labels: Lawnmower is Day 1 and Equalmex is Day 2. The existing modified-grader
links for 2013 Treasure and 2014 Question are deliberately retained.

---

## Scripts

### `yaml_to_json.py`

This script converts the entire `data/` directory into a flat `data.json` file.

**Usage:**

```bash
python yaml_to_json.py data/ --output data.json
```

- Automatically infers `source`, `year`, and `extra` from folder and file names
- Produces a flat JSON file with all fields filled in per problem

### `json_to_yaml.py`

This script takes a JSON file and updates the corresponding YAML files under `data/`. It supports both addition and removal of problems.

**Usage:**

```bash
python json_to_yaml.py problems_to_add.json
python json_to_yaml.py problems_to_remove.json --remove
```

- Infers target YAML file from each problem's `source`, `year`, and `extra`
- Adds or removes problem entries accordingly

---

## Conversion Format

Each entry in `data.json` will look like this:

```json
{
  "name": "Super 2048",
  "number": 1,
  "source": "GKS",
  "year": 2014,
  "extra": "Round A",
  "link": "https://www.acmicpc.net/problem/12209"
}
```

- `source` is capitalized from the folder name
- `extra` is converted from the filename (e.g., `Round_A.yaml` → `"Round A"`)

---

## Summary

| Case           | Path Example                       | Required Fields       |
|----------------|------------------------------------|------------------------|
| No `extra`     | `data/problems/apio/2025.yaml`   | `name`, `number`, `link` |
| With `extra`   | `data/gks/2014/Round_A.yaml`       | `name`, `number`, `link` |

Only the YAML files should be edited manually. `data.json` is a generated file.

The consolidated migration has a new name so `prisma migrate deploy` runs it
even if earlier grouping migrations were already applied. Its guarded operations
skip previously grouped rows. Existing databases retain their older migration
history entries; do not reset the database to remove those entries.
