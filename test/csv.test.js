import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, sniffDelimiter, readRecords, looksLikeHeader, isNumeric } from '../src/csv.js';

test('parseCsv splits plain rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('parseCsv handles quoted delimiters, newlines and doubled quotes', () => {
  const rows = parseCsv('name,note\n"Smith, Jane","said ""hi""\nsecond line"\n');
  assert.deepEqual(rows, [
    ['name', 'note'],
    ['Smith, Jane', 'said "hi"\nsecond line'],
  ]);
});

test('parseCsv accepts CRLF and a BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('parseCsv keeps empty fields and drops trailing blank lines', () => {
  assert.deepEqual(parseCsv('a,,c\n,,\n\n'), [['a', '', 'c'], ['', '', '']]);
});

test('parseCsv ignores an empty file', () => {
  assert.deepEqual(parseCsv(''), []);
});

test('parseCsv supports other delimiters', () => {
  assert.deepEqual(parseCsv('a;b\n1;2', { delimiter: ';' }), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  assert.throws(() => parseCsv('a,b', { delimiter: ';;' }), /single character/);
});

test('sniffDelimiter picks the separator that yields consistent width', () => {
  assert.equal(sniffDelimiter('a,b,c\n1,2,3\n4,5,6').delimiter, ',');
  assert.equal(sniffDelimiter('a;b;c\n1;2;3\n4;5;6').delimiter, ';');
  assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3').delimiter, '\t');
  assert.equal(sniffDelimiter('a|b\n1|2').delimiter, '|');
  assert.equal(sniffDelimiter('onlyonecolumn\nx\ny').delimiter, ',');
});

test('looksLikeHeader is not fooled by data or blank cells', () => {
  assert.equal(looksLikeHeader([['id', 'name'], ['1', 'ada']]), true);
  assert.equal(looksLikeHeader([['1', 'ada'], ['2', 'grace']]), false);
  assert.equal(looksLikeHeader([['id', ''], ['1', 'ada']]), false);
  assert.equal(looksLikeHeader([['a']]), false);
});

test('readRecords detects a header and pads ragged rows', () => {
  const table = readRecords('id,name\n1,ada\n2,grace,extra\n');
  assert.deepEqual(table.header, ['id', 'name', 'column_3']);
  assert.equal(table.rows.length, 2);
  assert.equal(table.fields, 3);
  assert.equal(table.ragged, 1);
  assert.deepEqual(table.rows[0], ['1', 'ada', '']);
});

test('readRecords can be forced either way', () => {
  const asData = readRecords('a,b\n1,2\n', { header: false });
  assert.equal(asData.rows.length, 2);
  assert.deepEqual(asData.header, ['column_1', 'column_2']);

  const asHeader = readRecords('1,ada\n2,grace\n', { header: true });
  assert.deepEqual(asHeader.header, ['1', 'ada']);
  assert.equal(asHeader.rows.length, 1);
});

test('isNumeric accepts signed and exponent forms', () => {
  assert.equal(isNumeric('1'), true);
  assert.equal(isNumeric('-2.5'), true);
  assert.equal(isNumeric('.5'), true);
  assert.equal(isNumeric('1e3'), true);
  assert.equal(isNumeric('1,5'), false);
  assert.equal(isNumeric('abc'), false);
  assert.equal(isNumeric(''), false);
});
