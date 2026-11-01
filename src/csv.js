/**
 * A small RFC 4180 CSV reader.
 *
 * Quoted fields may contain the delimiter, CR/LF and doubled quotes
 * (`""` → `"`). Rows are returned as arrays of strings; empty trailing
 * lines are dropped, and a UTF-8 BOM is stripped.
 */

const DELIMITERS = [',', ';', '\t', '|'];

/** Read a CSV body into rows of strings. */
export function parseCsv(text, { delimiter = ',' } = {}) {
  if (typeof delimiter !== 'string' || delimiter.length !== 1) {
    throw new TypeError('delimiter must be a single character');
  }

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;

  const source = String(text).replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
      started = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      started = true;
      continue;
    }

    if (ch === '\r') {
      // Swallow CRLF as one break; a lone CR also ends the record.
      if (source[i + 1] === '\n') i++;
      if (started || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      started = false;
      continue;
    }

    if (ch === '\n') {
      if (started || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      started = false;
      continue;
    }

    field += ch;
    started = true;
  }

  if (started || field !== '') {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Count how often each candidate delimiter appears outside quotes. */
export function countDelimiters(text, lines = 20) {
  const counts = new Map(DELIMITERS.map((delimiter) => [delimiter, 0]));
  const source = String(text).replace(/^\uFEFF/, '');
  let line = 0;
  let quoted = false;

  for (let i = 0; i < source.length && line < lines; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') i++;
        else quoted = false;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === '\n') {
      line++;
      continue;
    }
    if (counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }

  return counts;
}

/**
 * Guess the delimiter: the candidate that yields the most consistent
 * field count across the first rows wins.
 */
export function sniffDelimiter(text) {
  const candidateCounts = countDelimiters(text);
  let best = { delimiter: ',', score: -1, fields: 1 };

  for (const delimiter of DELIMITERS) {
    const seen = candidateCounts.get(delimiter) ?? 0;
    if (seen === 0) continue;
    const head = text.split(/\r?\n/).slice(0, 5).filter(Boolean).join('\n');
    const widths = parseCsv(head, { delimiter }).map((row) => row.length).filter((n) => n > 1);
    if (!widths.length) continue;
    const mode = widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)];
    const consistent = widths.filter((n) => n === mode).length / widths.length;
    const score = consistent * 100 + mode;
    if (score > best.score) best = { delimiter, score, fields: mode };
  }

  return best;
}

/** Records from raw CSV text: `{ header, rows }`, header optional. */
export function readRecords(text, { delimiter = null, header = null } = {}) {
  const guessed = delimiter ? { delimiter } : sniffDelimiter(text);
  const table = parseCsv(text, { delimiter: guessed.delimiter });
  if (!table.length) return { delimiter: guessed.delimiter, header: [], rows: [], fields: 0 };

  const width = Math.max(...table.map((row) => row.length));
  const ragged = table.filter((row) => row.length !== width).length;
  const padded = table.map((row) => (row.length === width ? row : [...row, ...new Array(width - row.length).fill('')]));

  // Header detection looks at the raw rows: padding would make the short row
  // look like it has empty cells, which is a data problem, not a header clue.
  const useHeader = header === null ? looksLikeHeader(table) : header;
  const head = useHeader ? padded[0].map((name, index) => name.trim() || `column_${index + 1}`) : [];
  const rows = useHeader ? padded.slice(1) : padded;

  return {
    delimiter: guessed.delimiter,
    header: head.length ? head : rows[0]?.map((_, index) => `column_${index + 1}`) ?? [],
    rows,
    fields: width,
    ragged: ragged - (useHeader && table[0].length !== width ? 1 : 0),
  };
}

/** A first row is a header when it is all non-empty text and some cell below it is numeric. */
export function looksLikeHeader(rows) {
  if (rows.length < 2) return false;
  const [first, ...rest] = rows;
  if (!first.length) return false;
  if (first.some((cell) => cell.trim() === '')) return false;
  const firstLooksNumeric = first.some((cell) => isNumeric(cell));
  if (firstLooksNumeric) return false;
  return rest.some((row) => row.some((cell) => isNumeric(cell) || cell.trim() !== ''));
}

export function isNumeric(value) {
  const text = String(value).trim();
  if (!text) return false;
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text);
}
