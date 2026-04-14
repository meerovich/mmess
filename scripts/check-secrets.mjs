import fs from 'node:fs';
import path from 'node:path';

const envPath = process.argv[2] ?? '.env.production';
const absolutePath = path.resolve(process.cwd(), envPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Secret check failed: file not found: ${absolutePath}`);
  process.exit(1);
}

const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);
const env = new Map();

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator === -1) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();
  env.set(key, value);
}

const requiredSecrets = [
  'POSTGRES_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const placeholderPatterns = [
  /^change-me/i,
  /^replace_with/i,
  /^example$/i,
  /^changeme$/i,
  /^secret$/i,
];

const errors = [];
const warnings = [];

for (const key of requiredSecrets) {
  const value = env.get(key);
  if (!value) {
    errors.push(`${key} is missing`);
    continue;
  }

  if (placeholderPatterns.some(pattern => pattern.test(value))) {
    errors.push(`${key} still uses a placeholder value`);
  }
}

const databaseUrl = env.get('DATABASE_URL');
const postgresPassword = env.get('POSTGRES_PASSWORD');
if (databaseUrl && postgresPassword && databaseUrl.includes('change-me')) {
  errors.push('DATABASE_URL still contains placeholder credentials');
}

if (databaseUrl && postgresPassword && !databaseUrl.includes(postgresPassword)) {
  warnings.push('DATABASE_URL does not include the current POSTGRES_PASSWORD; verify sync manually');
}

const codexBotEnabled = [
  env.get('CODEX_BOT_EMAIL'),
  env.get('CODEX_BOT_PASSWORD'),
  env.get('OPENAI_API_KEY'),
].some(Boolean);

if (codexBotEnabled) {
  if (!env.get('CODEX_BOT_EMAIL')) warnings.push('CODEX_BOT_EMAIL is empty');
  if (!env.get('CODEX_BOT_PASSWORD')) warnings.push('CODEX_BOT_PASSWORD is empty');
  if (!env.get('OPENAI_API_KEY')) warnings.push('OPENAI_API_KEY is empty');
}

if (errors.length > 0) {
  console.error(`Secret check failed for ${absolutePath}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  for (const warning of warnings) {
    console.error(`- warning: ${warning}`);
  }
  process.exit(1);
}

console.log(`Secret check passed for ${absolutePath}`);
for (const warning of warnings) {
  console.log(`- warning: ${warning}`);
}
