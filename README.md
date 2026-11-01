# csvprofile

**What is actually inside this CSV?** One command, no dependencies, no notebook.

![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-2b5d34) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-2b5d34) ![Tests](https://img.shields.io/badge/tests-40-2b5d34) ![License MIT](https://img.shields.io/badge/license-MIT-2b5d34)

```
$ csvprofile sales.csv
sales.csv — 4,000 rows · 10 columns · delimiter ","
────────────────────────────────────────────────────────────────────────
id             integer  4,000 present · 0 missing · 4,000 distinct
  min 1 · max 4,000 · mean 2,000.5 · median 2,000.5 · σ 1,154.7 · all values unique
name           text     4,000 present · 0 missing · 105 distinct
  length 10–22
  top "grace thompson" ×104  "grace perlman" ×100  "barbara thompson" ×98
email          text     3,831 present · 169 missing (4.2%) · 452 distinct
  length 20–33 · format email
signup_date    date     4,000 present · 0 missing · 477 distinct
  2023-01-01 → 2024-07-12
plan           text     4,000 present · 0 missing · 4 distinct
  top "pro" ×1,085  "free" ×1,033  "team" ×951  "enterprise" ×931
monthly_spend  number   4,000 present · 0 missing · 11 distinct
  min 0 · max 199.5 · mean 55.42 · median 29 · σ 64.33
seats          integer  3,439 present · 561 missing (14%) · 40 distinct
  min 1 · max 40 · mean 21.23 · median 22 · σ 11.64
active         boolean  4,000 present · 0 missing · 2 distinct
  top "true" ×3,262  "false" ×738
country        text     4,000 present · 0 missing · 7 distinct
  top "Lisbon" ×661  "Auckland" ×623  "Berlin" ×585
```

Seventeen seconds after the download, before you import anything anywhere: which columns are numbers, which are dates, which are empty, which are unique, and what the values actually look like.

## Why

Opening a CSV means either a spreadsheet (slow, and it silently retypes your IDs) or a Python session (`import pandas` and three lines you have to remember). Both are heavier than the question deserves.

`csvprofile` answers the questions you ask in the first minute:

- Does this file have a header, and what separator does it really use?
- Which columns are missing values, and how many?
- Is `id` unique? Is `signup_date` sorted? Is `zip` being read as a number?
- What does the data look like — three sample rows beat an eight-column dump.

## Install

Node 18 or newer, nothing else.

```sh
git clone https://github.com/wangtianbao-debug/csvprofile.git
cd csvprofile
npm link        # optional: puts `csvprofile` on your PATH
```

## Usage

```sh
csvprofile data.csv                  # profile to the terminal
csvprofile data.csv --json           # same numbers, for a script
csvprofile data.csv --markdown       # a table to paste into a PR or README
csvprofile data.csv --no-header      # there is no header row
csvprofile data.csv -d ';'           # semicolon-separated export
csvprofile data.csv --top 10         # more frequent values per column
cat export.csv | csvprofile -        # from stdin
```

| Option | Meaning |
| --- | --- |
| `-d, --delimiter <char>` | Field separator. Default: sniffed from the first rows. `tab` means `\t`. |
| `--no-header` | Treat the first row as data. |
| `--header` | Force the first row to be the header (useful for header-only files). |
| `--top <n>` | How many frequent values to show per column (default 5). |
| `--json` | Machine-readable profile. |
| `--markdown` | Markdown table. |
| `--no-color` | Plain text (also honours `NO_COLOR` and `TERM=dumb`). |

## What it reports

| Column detail | How it is computed |
| --- | --- |
| Type | The narrowest type every non-empty value fits: `integer`, `number`, `boolean`, `date`, `text`, or `empty`. |
| Present / missing | Blank and whitespace-only cells count as missing, with the percentage of the file. |
| Distinct | Number of different non-empty values. Equal to `present` means the column is a key. |
| Numeric stats | `min`, `max`, `mean`, `median`, population `σ`. |
| Date range | Earliest and latest ISO date (`2024-01-02`, with optional time and zone). |
| Text length | Shortest and longest value, so you can see truncation at 255 characters. |
| Format hint | When every value shares a shape: `email`, `url`, `uuid`, `ipv4`, `color`. |
| Frequent values | Top `n` values and counts, skipped when the column is essentially unique. |
| Ragged rows | Rows with a different field count from the widest row are padded and counted. |

Type inference is all-or-nothing on purpose: one stray `n/a` in a numeric column makes it `text`, which is exactly the thing you want to notice before loading it into a database.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Profiled. |
| 1 | The file could not be read, was empty, or had a header and no data rows. |
| 2 | Bad usage (no file, unknown flag, both `--json` and `--markdown`). |

## Use it as a library

```js
import { readRecords, profileTable, formatProfile, formatJson } from 'csvprofile';
import { readFileSync } from 'node:fs';

const text = readFileSync('data.csv', 'utf8');
const table = readRecords(text);
const profile = profileTable(table);

console.log(profile.rows, profile.columnsDetail[0].name);
console.log(formatJson({ file: 'data.csv', profile }));   // plain object
```

`readRecords` also tells you what it guessed: `delimiter`, `fields`, `ragged`, and whether the first row looked like a header.

## Limits

- The file is read into memory; a 500 MB CSV is not the target.
- UTF-8 only (a BOM is stripped; UTF-16 is not detected).
- Dates are recognised by shape, not by locale: ISO-style only.
- Delimiter sniffing looks at the first 20 lines and picks the most consistent separator.
- SQLite/Parquet/Excel files are out of scope; convert first.

## Tests

```sh
node --test
```

40 tests: RFC 4180 quoting (embedded commas, newlines, doubled quotes), CRLF, BOM, delimiter sniffing, header detection, ragged rows, type inference, numeric statistics, format hints, all three output formats, and the CLI end to end (stdin, `--json`, `--markdown`, gzip, exit codes).

## CI

The workflow is at [`ci/ci.yml`](ci/ci.yml) — copy it to `.github/workflows/ci.yml` for the 3-OS × 4-Node matrix.

## License

MIT © 2026 wangtianbao-debug
