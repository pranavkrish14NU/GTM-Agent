/**
 * generate-jwt-keys.mjs
 *
 * Generates an RSA-2048 key pair for local JWT signing and writes
 * the PEM values directly into your .env.local file.
 *
 * Usage:
 *   node scripts/generate-jwt-keys.mjs
 */

import { generateKeyPairSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_FILE = join(ROOT, '.env.local');

if (!existsSync(ENV_FILE)) {
  console.error('ERROR: .env.local not found. Run first:\n  cp .env.example .env.local');
  process.exit(1);
}

console.log('Generating RSA-2048 key pair...');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Escape newlines for .env format (single-line value)
const privateEscaped = privateKey.replace(/\n/g, '\\n');
const publicEscaped  = publicKey.replace(/\n/g, '\\n');

let env = readFileSync(ENV_FILE, 'utf8');

// Replace or set JWT_PRIVATE_KEY_PEM
if (env.includes('JWT_PRIVATE_KEY_PEM=')) {
  env = env.replace(/JWT_PRIVATE_KEY_PEM=.*/, `JWT_PRIVATE_KEY_PEM=${privateEscaped}`);
} else {
  env += `\nJWT_PRIVATE_KEY_PEM=${privateEscaped}`;
}

// Replace or set JWT_PUBLIC_KEY_PEM
if (env.includes('JWT_PUBLIC_KEY_PEM=')) {
  env = env.replace(/JWT_PUBLIC_KEY_PEM=.*/, `JWT_PUBLIC_KEY_PEM=${publicEscaped}`);
} else {
  env += `\nJWT_PUBLIC_KEY_PEM=${publicEscaped}`;
}

writeFileSync(ENV_FILE, env);
console.log('Done! JWT keys written to .env.local');
