import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { readRecords } from './csv.js';
import { profileTable } from './profile.js';
import { makeColors, formatProfile, formatJson, formatMarkdown } from './format.js';

export const VERSION = '0.1.0';

const HELP = `csvprofile — what is actually inside this CSV?

  csvprofile data.csv              profile every column
  cat data.csv | csvprofile -      read from stdin

Options
  -d, --delimiter <char>   field separator (default: sniffed; "tab" means \\t)
      --no-header          treat the first row as data
      --header             force the first row to be the header
      --top <n>            frequent values per column (default 5)
      --json               print the profile as JSON
      --markdown           print the profile as a Markdown table
      --no-color           disable ANSI colours
  -h, --help               show this help
  -v, --version            print the version

Exit codes
  0  profiled
  1  the file could not be read or held no data rows
  2  bad usage
`;

export function parseDelimiter(value) {
  if (value === 'tab' || value === '\\t') return '\t';
  if (value.length !== 1) throw new Error(`expected one character, got "${value}"`);
  return value;
}

export function parseArgs(argv) {
  const opts = { file: null, delimiter: null, header: null, top: 5, json: false, markdown: false, color: null, help: false, version: false };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      case '-d':
      case '--delimiter':
        opts.delimiter = parseDelimiter(next());
        break;
      case '--no-header':
        opts.header = false;
        break;
      case '--header':
        opts.header = true;
        break;
      case '--top': {
        const raw = next();
        if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error('--top expects a positive integer');
        opts.top = Number(raw);
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--markdown':
        opts.markdown = true;
        break;
      case '--no-color':
        opts.color = false;
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') throw new Error(`unknown option ${arg}`);
        rest.push(arg);
    }
  }

  if (rest.length > 1) throw new Error(`expected one file, got ${rest.length}`);
  opts.file = rest[0] ?? null;
  return opts;
}

export function decode(buffer) {
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return (isGzip ? gunzipSync(buffer) : buffer).toString('utf8');
}

function colorEnabled(opts, io) {
  if (opts.color === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(io.stdout.isTTY);
}

/**
 * @param {string[]} argv
 * @param {{stdout: object, stderr: object}} io
 * @param {{readFile?: (p: string) => Buffer}} [deps]
 */
export function run(argv, io = process, deps = {}) {
  const readFile = deps.readFile ?? ((path) => readFileSync(path));

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`csvprofile: ${error.message}\n`);
    return 2;
  }
  if (opts.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!opts.file) {
    io.stderr.write('csvprofile: no file given (use - for stdin, --help for usage)\n');
    return 2;
  }
  if (opts.json && opts.markdown) {
    io.stderr.write('csvprofile: pick either --json or --markdown\n');
    return 2;
  }

  let text;
  try {
    text = opts.file === '-' ? decode(readFileSync(0)) : decode(readFile(opts.file));
  } catch (error) {
    io.stderr.write(`csvprofile: cannot read ${opts.file}: ${error.code ?? error.message}\n`);
    return 1;
  }
  if (!text.trim()) {
    io.stderr.write(`csvprofile: ${opts.file} is empty\n`);
    return 1;
  }

  const table = readRecords(text, { delimiter: opts.delimiter, header: opts.header });
  if (!table.rows.length) {
    io.stderr.write(`csvprofile: ${opts.file} has a header but no data rows\n`);
    return 1;
  }

  const profile = profileTable(table);
  const file = opts.file === '-' ? 'stdin' : basename(opts.file);

  if (opts.json) {
    io.stdout.write(`${JSON.stringify(formatJson({ file, profile }), null, 2)}\n`);
    return 0;
  }
  if (opts.markdown) {
    io.stdout.write(formatMarkdown({ file, profile }));
    return 0;
  }

  const colors = makeColors(colorEnabled(opts, io));
  io.stdout.write(formatProfile({ file, profile }, { colors }));
  return 0;
}
