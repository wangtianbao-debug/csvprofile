/**
 * Column profiling: how many values are missing, how many are distinct,
 * what the values look like, and what the numbers add up to.
 */

const BOOLEANS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f']);
const DATE = /^(\d{4})-(\d{2})-(\d{2})([T ](\d{2}):(\d{2})(:(\d{2}))?(\.\d+)?(Z|[-+]\d{2}:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL = /^https?:\/\/[^\s]+$/i;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const HEX_COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

export function isBlank(value) {
  const text = String(value ?? '');
  return text.trim() === '';
}

export function asNumber(value) {
  const text = String(value).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function isDate(value) {
  return DATE.test(String(value).trim());
}

/** The narrowest type that fits every non-empty value in the column. */
export function inferType(values) {
  const present = values.filter((value) => !isBlank(value));
  if (!present.length) return 'empty';
  if (present.every((value) => /^[-+]?\d+$/.test(String(value).trim()))) return 'integer';
  if (present.every((value) => asNumber(value) !== null)) return 'number';
  if (present.every((value) => BOOLEANS.has(String(value).trim().toLowerCase()))) return 'boolean';
  if (present.every((value) => isDate(value))) return 'date';
  return 'text';
}

/** A shape hint for text columns, when every value shares it. */
export function detectFormat(values) {
  const present = values.filter((value) => !isBlank(value));
  if (!present.length) return null;
  const every = (re) => present.every((value) => re.test(String(value).trim()));
  if (every(EMAIL)) return 'email';
  if (every(URL)) return 'url';
  if (every(UUID)) return 'uuid';
  if (every(IPV4)) return 'ipv4';
  if (every(HEX_COLOR)) return 'color';
  return null;
}

/** Linear-interpolated quantile of an already sorted list. */
export function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Median of an unsorted list, or null when it is empty. */
export function median(values) {
  if (!values.length) return null;
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

function numericStats(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: quantile(sorted, 0.5),
    stddev: Math.sqrt(variance),
    sum,
  };
}

function dateStats(values) {
  const stamps = values.filter((value) => !isBlank(value)).map((value) => String(value).trim()).sort();
  return { min: stamps[0] ?? null, max: stamps[stamps.length - 1] ?? null };
}

/**
 * @param {{header: string[], rows: string[][]}} table
 * @param {{top?: number}} [opts]
 */
export function profileColumns({ header, rows }, { top = 5 } = {}) {
  const columns = header.map((name, index) => {
    const values = rows.map((row) => (row[index] ?? '').trim());
    const present = values.filter((value) => value !== '');
    const type = inferType(values);
    const frequencies = new Map();
    for (const value of present) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);

    const column = {
      index,
      name,
      type,
      total: values.length,
      present: present.length,
      nulls: values.length - present.length,
      distinct: frequencies.size,
      top: [...frequencies.entries()]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, top)
        .map(([value, count]) => ({ value, count })),
    };

    if (type === 'integer' || type === 'number') {
      const numbers = present.map((value) => asNumber(value)).filter((value) => value !== null);
      Object.assign(column, { numeric: numericStats(numbers) });
      column.integer = type === 'integer';
    } else if (type === 'date') {
      column.dates = dateStats(values);
    } else if (type === 'text') {
      const lengths = present.map((value) => value.length);
      column.length = lengths.length
        ? { min: Math.min(...lengths), max: Math.max(...lengths), mean: lengths.reduce((a, b) => a + b, 0) / lengths.length }
        : null;
      column.format = type === 'text' ? detectFormat(present) : null;
    }

    return column;
  });

  return columns;
}

/** Whole-table numbers, for the summary line. */
export function profileTable({ header, rows, delimiter, fields, ragged = 0 }) {
  const columns = profileColumns({ header, rows });
  const emptyRows = rows.filter((row) => row.every((cell) => isBlank(cell))).length;
  return {
    rows: rows.length,
    columns: fields ?? header.length,
    delimiter: delimiterName(delimiter),
    emptyRows,
    ragged,
    columnsDetail: columns,
  };
}

export function delimiterName(delimiter) {
  if (delimiter === '\t') return 'tab';
  return delimiter ?? ',';
}
