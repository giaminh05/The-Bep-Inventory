import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = process.argv[2] ?? process.env.BEP_API_URL;
let url;
try {
  url = new URL(arg);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Invalid API origin');
  }
} catch {
  console.error('Cách dùng: npm run build:mobile -- https://api.example.com');
  process.exit(1);
}
const dist = new URL('../dist/', import.meta.url);
mkdirSync(dist, { recursive: true });
cpSync(new URL('../web/', import.meta.url), dist, { recursive: true });
writeFileSync(new URL('config.js', dist), `export const apiBase = ${JSON.stringify(url.origin)};\n`);
