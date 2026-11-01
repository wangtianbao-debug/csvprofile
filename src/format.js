/** Terminal, JSON and Markdown views of a profile. */

export function makeColors(enabled) {
  const wrap = (code) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  return {
    enabled,
    dim: wrap('2'),
    bold: wrap('1'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    cyan: wrap('36'),
  };
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const [whole, fraction] = splitNumber(number);
  return fraction ? `${group(whole)}.${fraction}` : group(whole);
}

function splitNumber(number) {
  const magnitude = Math.abs(number);
  const decimals = magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 4;
  const rounded = number.toFixed(decimals);
  const [whole, fraction = ''] = rounded.split('.');
  return [whole, fraction.replace(/0+$/, '')];
}

function group(whole) {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function percent(part, total) {
  if (!total) return '0%';
  const value = (part / total) * 100;
  if (value === 0) return '0%';
  if (value < 0.1) return '<0.1%';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function truncate(text, width) {
  const value = String(text);
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

const TYPE_LABEL = {
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  text: 'text',
  empty: 'empty',
};

function statLine(column) {
  const parts = [];
  if (column.numeric) {
    parts.push(`min ${formatNumber(column.numeric.min)}`);
    parts.push(`max ${formatNumber(column.numeric.max)}`);
    parts.push(`mean ${formatNumber(column.numeric.mean)}`);
    if (column.numeric.min !== column.numeric.max) parts.push(`median ${formatNumber(column.numeric.median)}`);
    if (column.distinct > 1) parts.push(`σ ${formatNumber(column.numeric.stddev)}`);
  }
  if (column.dates) parts.push(`${column.dates.min} → ${column.dates.max}`);
  if (column.length) {
    parts.push(`length ${column.length.min}–${column.length.max}`);
  }
  if (column.format) parts.push(`format ${column.format}`);
  if (column.distinct === column.present && column.present > 1) parts.push('all values unique');
  return parts.join(' · ');
}

/** A column that is essentially unique (ids, hashes) has no useful "frequent values". */
export function hasUsefulTop(column) {
  if (!column.top.length) return false;
  return !(column.present > 30 && column.distinct / column.present > 0.6);
}

function topLine(column, colors) {
  if (!hasUsefulTop(column)) return '';
  const entries = column.top.map((entry) => {
    const value = entry.value.length > 28 ? `${entry.value.slice(0, 27)}…` : entry.value;
    return `${JSON.stringify(value)} ×${formatNumber(entry.count)}`;
  });
  return `${colors.dim('top')} ${entries.join('  ')}`;
}

/**
 * @param {{file: string, profile: object}} input
 * @param {{colors?: object}} [opts]
 */
export function formatProfile({ file, profile }, { colors = makeColors(false) } = {}) {
  const lines = [];
  const { rows, columns, delimiter, columnsDetail, emptyRows, ragged } = profile;

  lines.push(`${colors.bold(file)} — ${formatNumber(rows)} row${rows === 1 ? '' : 's'} · ${columns} column${columns === 1 ? '' : 's'} · delimiter ${delimiter === 'tab' ? 'tab' : `"${delimiter}"`}`);
  if (emptyRows) lines.push(colors.yellow(`  ${formatNumber(emptyRows)} empty row${emptyRows === 1 ? '' : 's'}`));
  if (ragged) lines.push(colors.yellow(`  ${formatNumber(ragged)} row${ragged === 1 ? '' : 's'} had an unexpected field count (padded)`));
  lines.push(colors.dim('─'.repeat(72)));

  const nameWidth = Math.min(24, Math.max(...columnsDetail.map((column) => column.name.length), 6));
  const typeWidth = Math.max(...columnsDetail.map((column) => TYPE_LABEL[column.type].length), 4);

  for (const column of columnsDetail) {
    const name = truncate(column.name, nameWidth).padEnd(nameWidth);
    const type = TYPE_LABEL[column.type].padEnd(typeWidth);
    const palette = column.type === 'empty' ? colors.yellow : column.nulls > 0 ? colors.cyan : colors.green;
    const counts = [
      `${formatNumber(column.present)} present`,
      column.nulls ? colors.yellow(`${formatNumber(column.nulls)} missing (${percent(column.nulls, column.total)})`) : '0 missing',
      `${formatNumber(column.distinct)} distinct`,
    ].join(colors.dim(' · '));
    lines.push(`${colors.bold(name)}  ${palette(type)}  ${counts}`);
    const detail = statLine(column);
    if (detail) lines.push(`  ${colors.dim(detail)}`);
    const top = topLine(column, colors);
    if (top) lines.push(`  ${top}`);
  }

  return `${lines.join('\n')}\n`;
}

/** Machine-readable shape, dates left as strings so JSON stays portable. */
export function formatJson({ file, profile }) {
  return {
    file,
    rows: profile.rows,
    columns: profile.columns,
    delimiter: profile.delimiter,
    emptyRows: profile.emptyRows,
    fields: profile.columnsDetail.map((column) => ({
      name: column.name,
      type: column.type,
      present: column.present,
      missing: column.nulls,
      distinct: column.distinct,
      top: column.top,
      ...(column.numeric ? { numeric: column.numeric } : {}),
      ...(column.dates ? { dates: column.dates } : {}),
      ...(column.length ? { length: column.length } : {}),
      ...(column.format ? { format: column.format } : {}),
    })),
  };
}

export function formatMarkdown({ file, profile }) {
  const header = ['Column', 'Type', 'Present', 'Missing', 'Distinct', 'Summary'];
  const rows = profile.columnsDetail.map((column) => {
    const summary = [statLine(column), hasUsefulTop(column) ? `top ${column.top.map((e) => `\`${e.value}\` ×${e.count}`).join(', ')}` : '']
      .filter(Boolean)
      .join('; ');
    return [
      `\`${column.name.replace(/\|/g, '\\|')}\``,
      column.type,
      formatNumber(column.present),
      formatNumber(column.nulls),
      formatNumber(column.distinct),
      summary.replace(/\|/g, '\\|'),
    ];
  });

  const out = [
    `### ${file}`,
    '',
    `${formatNumber(profile.rows)} rows · ${profile.columns} columns · delimiter \`${profile.delimiter}\``,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
  ];
  return out.join('\n');
}
