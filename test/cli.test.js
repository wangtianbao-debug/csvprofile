import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parseDelimiter, run } from '../src/cli.js';

const CSV = 'id,name,spend\n1,Ada,19.5\n2,Grace,0\n3,,12\n';

function io() {
  const out = [];
  const err = [];
  return {
    stdout: { write: (chunk) => out.push(chunk), isTTY: false },
    stderr: { write: (chunk) => err.push(chunk) },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

function deps(text, files = {}) {
  return {
    readFile: (path) => {
      if (path in files) return Buffer.from(files[path]);
      if (path === 'boom.csv') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return Buffer.from(text);
    },
  };
}

test('parseArgs reads the flags', () => {
  const opts = parseArgs(['a.csv', '-d', ';', '--top', '3', '--json', '--no-header']);
  assert.equal(opts.file, 'a.csv');
  assert.equal(opts.delimiter, ';');
  assert.equal(opts.top, 3);
  assert.equal(opts.json, true);
  assert.equal(opts.header, false);
});

test('parseDelimiter understands tab', () => {
  assert.equal(parseDelimiter('tab'), '\t');
  assert.equal(parseDelimiter('\\t'), '\t');
  assert.equal(parseDelimiter(','), ',');
  assert.throws(() => parseDelimiter(';;'), /one character/);
});

test('parseArgs rejects bad usage', () => {
  assert.throws(() => parseArgs(['--top', 'x']), /positive integer/);
  assert.throws(() => parseArgs(['--delimiter']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  assert.throws(() => parseArgs(['a.csv', 'b.csv']), /one file/);
});

test('--help and --version exit 0', () => {
  const a = io();
  assert.equal(run(['--version'], a), 0);
  assert.match(a.out(), /^0\.1\.0\n$/);

  const b = io();
  assert.equal(run(['--help'], b), 0);
  assert.match(b.out(), /csvprofile — what is actually inside this CSV\?/);
});

test('profiles a file to the terminal', () => {
  const stream = io();
  assert.equal(run(['people.csv'], stream, deps(CSV)), 0);
  const out = stream.out();
  assert.match(out, /people\.csv — 3 rows · 3 columns/);
  assert.match(out, /id\s+integer/);
  assert.match(out, /name\s+text\s+2 present · 1 missing/);
  assert.doesNotMatch(out, /\u001b\[/, 'colour must be off when stdout is not a tty');
});

test('--json prints a parseable profile', () => {
  const stream = io();
  assert.equal(run(['people.csv', '--json'], stream, deps(CSV)), 0);
  const payload = JSON.parse(stream.out());
  assert.equal(payload.rows, 3);
  assert.equal(payload.fields[0].name, 'id');
  assert.equal(payload.fields[1].missing, 1);
});

test('--markdown prints a table', () => {
  const stream = io();
  assert.equal(run(['people.csv', '--markdown'], stream, deps(CSV)), 0);
  assert.match(stream.out(), /^### people\.csv/);
  assert.match(stream.out(), /\| `id` \| integer \|/);
});

test('--delimiter and --no-header change the parse', () => {
  const semi = io();
  assert.equal(run(['x.csv', '-d', ';'], semi, deps('a;b\n1;2\n3;4\n')), 0);
  assert.match(semi.out(), /2 rows · 2 columns · delimiter ";"/);

  const noHeader = io();
  assert.equal(run(['x.csv', '--no-header'], noHeader, deps('1,2\n3,4\n')), 0);
  assert.match(noHeader.out(), /2 rows/);
  assert.match(noHeader.out(), /column_1/);
});

test('missing files, empty files and header-only files exit 1', () => {
  const missing = io();
  assert.equal(run(['boom.csv'], missing, deps(CSV)), 1);
  assert.match(missing.err(), /cannot read boom\.csv: ENOENT/);

  const empty = io();
  assert.equal(run(['empty.csv'], empty, deps('   \n')), 1);
  assert.match(empty.err(), /is empty/);

  const headerOnly = io();
  assert.equal(run(['h.csv', '--header'], headerOnly, deps('a,b\n')), 1);
  assert.match(headerOnly.err(), /no data rows/);
});

test('no file, or two output formats at once, is a usage error', () => {
  const none = io();
  assert.equal(run([], none), 2);
  assert.match(none.err(), /no file given/);

  const both = io();
  assert.equal(run(['people.csv', '--json', '--markdown'], both, deps(CSV)), 2);
  assert.match(both.err(), /pick either/);
});

test('a gzipped csv still profiles', async () => {
  const { gzipSync } = await import('node:zlib');
  const stream = io();
  const gz = gzipSync(Buffer.from(CSV));
  assert.equal(run(['data.csv.gz'], stream, deps('', { 'data.csv.gz': gz })), 0);
  assert.match(stream.out(), /3 rows/);
});
