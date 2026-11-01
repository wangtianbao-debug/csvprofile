import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, percent, truncate, makeColors, formatProfile, formatJson, formatMarkdown } from '../src/format.js';
import { readRecords } from '../src/csv.js';
import { profileTable } from '../src/profile.js';

const CSV = [
  'id,name,city,spend,joined',
  '1,Ada,Berlin,19.5,2023-01-01',
  '2,Grace,Lisbon,0,2023-02-01',
  '3,Ada,,"",2024-05-06',
].join('\n');

function profileOf(text) {
  return profileTable(readRecords(text));
}

test('formatNumber groups thousands and trims noise', () => {
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(2000.5), '2,000.5');
  assert.equal(formatNumber(55.4173), '55.42');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(0.000123), '0.0001');
  assert.equal(formatNumber(199.5), '199.5');
});

test('percent keeps sub-tenth values visible', () => {
  assert.equal(percent(0, 10), '0%');
  assert.equal(percent(5, 10), '50%');
  assert.equal(percent(1, 10000), '<0.1%');
  assert.equal(percent(1, 3), '33%');
});

test('truncate only shortens long text', () => {
  assert.equal(truncate('abc', 5), 'abc');
  assert.equal(truncate('abcdefgh', 5), 'abcd…');
});

test('makeColors can be switched off', () => {
  const plain = makeColors(false);
  assert.equal(plain.bold('x'), 'x');
  const fancy = makeColors(true);
  assert.match(fancy.bold('x'), /\u001b\[1mx\u001b\[0m/);
});

test('formatProfile lists every column with type and counts', () => {
  const out = formatProfile({ file: 'people.csv', profile: profileOf(CSV) }, { colors: makeColors(false) });
  assert.match(out, /people\.csv — 3 rows · 5 columns/);
  assert.match(out, /id\s+integer\s+3 present/);
  assert.match(out, /city\s+text\s+2 present · 1 missing \(33%\)/);
  assert.match(out, /spend\s+number/);
  assert.match(out, /joined\s+date/);
  assert.match(out, /2023-01-01 → 2024-05-06/);
});

test('formatProfile hides the top list for essentially unique columns', () => {
  const unique = ['id', ...Array.from({ length: 40 }, (_, i) => String(i + 1))].join('\n');
  const out = formatProfile({ file: 'ids.csv', profile: profileOf(unique) }, { colors: makeColors(false) });
  assert.match(out, /all values unique/);
  assert.doesNotMatch(out, /top "1" ×1/);
});

test('formatJson is stable and serialisable', () => {
  const payload = formatJson({ file: 'people.csv', profile: profileOf(CSV) });
  assert.equal(payload.file, 'people.csv');
  assert.equal(payload.rows, 3);
  assert.equal(payload.fields.length, 5);
  assert.equal(payload.fields[0].type, 'integer');
  assert.deepEqual(payload.fields[0].top, [{ value: '1', count: 1 }, { value: '2', count: 1 }, { value: '3', count: 1 }]);
  assert.ok(JSON.stringify(payload).includes('"numeric"'));
});

test('formatMarkdown builds a table', () => {
  const md = formatMarkdown({ file: 'people.csv', profile: profileOf(CSV) });
  const rows = md.trim().split('\n');
  assert.match(md, /^### people\.csv/);
  assert.equal(rows[0], '### people.csv');
  const header = rows.find((line) => line.startsWith('| Column |'));
  assert.ok(header, 'missing table header');
  assert.equal(header.split('|').length - 2, 6);
  assert.match(md, /\| `city` \| text \| 2 \| 1 \| 2 \|/);
});
