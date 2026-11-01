import test from 'node:test';
import assert from 'node:assert/strict';
import { inferType, detectFormat, profileColumns, profileTable, quantile, median } from '../src/profile.js';

test('inferType narrows to the smallest fitting type', () => {
  assert.equal(inferType(['1', '2', '-3']), 'integer');
  assert.equal(inferType(['1', '2.5']), 'number');
  assert.equal(inferType(['true', 'FALSE', 'yes']), 'boolean');
  assert.equal(inferType(['2024-01-02', '2024-03-04T10:00:00Z']), 'date');
  assert.equal(inferType(['ada', '1']), 'text');
  assert.equal(inferType(['', '  ']), 'empty');
});

test('inferType ignores blanks when deciding', () => {
  assert.equal(inferType(['1', '', '3']), 'integer');
  assert.equal(inferType(['', 'ada']), 'text');
});

test('detectFormat recognises common shapes', () => {
  assert.equal(detectFormat(['a@b.co', 'c@d.org']), 'email');
  assert.equal(detectFormat(['https://a.dev', 'http://b.dev/x']), 'url');
  assert.equal(detectFormat(['2f8e4b1c-0000-4000-8000-000000000000']), 'uuid');
  assert.equal(detectFormat(['10.0.0.1', '192.168.1.5']), 'ipv4');
  assert.equal(detectFormat(['#fff', '#1a2b3c']), 'color');
  assert.equal(detectFormat(['ada', 'grace']), null);
  assert.equal(detectFormat(['']), null);
});

test('profileColumns reports presence, distinct values and top entries', () => {
  const table = { header: ['city', 'note'], rows: [['Berlin', 'a'], ['Berlin', ''], ['Osaka', 'a']] };
  const [city, note] = profileColumns(table);
  assert.equal(city.total, 3);
  assert.equal(city.present, 3);
  assert.equal(city.nulls, 0);
  assert.equal(city.distinct, 2);
  assert.deepEqual(city.top, [
    { value: 'Berlin', count: 2 },
    { value: 'Osaka', count: 1 },
  ]);
  assert.equal(note.nulls, 1);
  assert.equal(note.distinct, 1);
});

test('numeric columns get min, max, mean, median and stddev', () => {
  const table = { header: ['n'], rows: [['1'], ['2'], ['3'], ['4'], ['']] };
  const [column] = profileColumns(table);
  assert.equal(column.type, 'integer');
  assert.deepEqual(column.numeric, { min: 1, max: 4, mean: 2.5, median: 2.5, stddev: Math.sqrt(1.25), sum: 10 });
});

test('date columns get a range', () => {
  const table = { header: ['when'], rows: [['2024-05-01'], ['2023-01-02'], ['2024-02-09']] };
  const [column] = profileColumns(table);
  assert.equal(column.type, 'date');
  assert.deepEqual(column.dates, { min: '2023-01-02', max: '2024-05-01' });
});

test('text columns get length stats and a format hint', () => {
  const table = { header: ['mail'], rows: [['a@b.co'], ['cc@dd.org']] };
  const [column] = profileColumns(table);
  assert.equal(column.type, 'text');
  assert.equal(column.format, 'email');
  assert.deepEqual(column.length, { min: 6, max: 9, mean: 7.5 });
});

test('the top list is capped by the top option', () => {
  const table = { header: ['x'], rows: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']] };
  const [column] = profileColumns(table, { top: 3 });
  assert.equal(column.top.length, 3);
});

test('profileTable summarises the whole file', () => {
  const table = { header: ['a', 'b'], rows: [['1', 'x'], ['', 'y']], delimiter: '\t', fields: 2 };
  const profile = profileTable(table);
  assert.equal(profile.rows, 2);
  assert.equal(profile.columns, 2);
  assert.equal(profile.delimiter, 'tab');
  assert.equal(profile.emptyRows, 0);
  assert.equal(profile.columnsDetail.length, 2);
});

test('quantile helpers interpolate', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([]), null);
});
