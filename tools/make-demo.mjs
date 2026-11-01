// Deterministic demo CSV: mixed types, missing values, duplicates, quoted commas.
import { writeFileSync } from 'node:fs';

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[int(0, list.length - 1)];

const CITIES = ['Berlin', 'Lisbon', 'Osaka', 'Montreal', 'Nairobi', 'Bogotá', 'Auckland'];
const PLANS = ['free', 'pro', 'team', 'enterprise'];
const NOTES = ['', '', '', 'renewed early', 'asked for invoice', 'opted out of email', 'referred a friend'];
const DOMAINS = ['example.com', 'mail.test', 'corp.internal'];

const rows = ['id,name,email,signup_date,plan,monthly_spend,seats,active,country,notes'];
for (let id = 1; id <= 4000; id++) {
  const first = pick(['ada', 'grace', 'alan', 'radia', 'linus', 'margaret', 'ken', 'barbara']);
  const last = pick(['lovelace', 'hopper', 'turing', 'perlman', 'torvalds', 'hamilton', 'thompson', 'liskov']);
  const plain = `${first} ${last}`;
  const name = rand() < 0.07 ? `"${plain}, jr."` : plain;
  const email = rand() < 0.04 ? '' : `${first}.${last}${rand() < 0.3 ? int(1, 99) : ''}@${pick(DOMAINS)}`;
  const day = new Date(Date.UTC(2023, 0, 1) + int(0, 560) * 86400000).toISOString().slice(0, 10);
  const plan = pick(PLANS);
  const spend = plan === 'free' ? 0 : [19, 29, 49, 99, 199][int(0, 4)] + (rand() < 0.15 ? 0.5 : 0);
  const seats = rand() < 0.12 ? '' : String(int(1, 40));
  const active = rand() < 0.78 ? 'true' : 'false';
  rows.push(`${id},${name},${email},${day},${plan},${spend},${seats},${active},${pick(CITIES)},"${pick(NOTES)}"`);
}

writeFileSync(new URL('../demo.csv', import.meta.url), `${rows.join('\n')}\n`, 'utf8');
console.log(`${rows.length - 1} rows → demo.csv`);
