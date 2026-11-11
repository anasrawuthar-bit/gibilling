/**
 * ZynBill Cloud Ecosystem – Zero-Dependency Environment Variable Loader
 * 
 * Complies with strict architectural constraint:
 * - Zero external dependencies: uses Node.js native fs and path.
 * - Safely parses .env files from project root, server directory, or CWD.
 * - Respects system environment variables (does not overwrite existing non-empty env vars).
 * - Properly handles single and double-quoted values, multiline, inline comments, and whitespace.
 * - Normalizes alias names (SUPER_ADMIN_* <-> ADMIN_*).
 * - Never prints or exposes secret values in logs.
 */

const fs = require('node:fs');
const path = require('node:path');

let envLoaded = false;
let loadedFromPath = null;

function parseEnvString(src) {
  const result = {};
  if (!src || typeof src !== 'string') return result;

  const lines = src.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();

    if (!key) continue;

    // Handle quoted values (double quotes or single quotes)
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
      // Unescape common sequences in quoted strings
      val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    } else {
      // Strip trailing inline comment if unquoted (e.g., VALUE # comment)
      const commentIndex = val.indexOf('#');
      if (commentIndex !== -1) {
        val = val.slice(0, commentIndex).trim();
      }
    }

    result[key] = val;
  }
  return result;
}

function loadEnvFile() {
  if (envLoaded) return { loaded: true, path: loadedFromPath };

  // Candidate paths to look for .env files
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '..', '.env')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const content = fs.readFileSync(candidate, 'utf8');
        const parsed = parseEnvString(content);

        for (const [k, v] of Object.entries(parsed)) {
          // Do not overwrite existing system/container environment variables
          if (process.env[k] === undefined || process.env[k] === '') {
            process.env[k] = v;
          }
        }

        loadedFromPath = candidate;
        envLoaded = true;
        break;
      }
    } catch (_) {}
  }

  // Normalize aliases across SUPER_ADMIN_* and ADMIN_*
  if (!process.env.SUPER_ADMIN_EMAIL && process.env.ADMIN_EMAIL) {
    process.env.SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  } else if (!process.env.ADMIN_EMAIL && process.env.SUPER_ADMIN_EMAIL) {
    process.env.ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
  }

  if (!process.env.SUPER_ADMIN_PASSWORD && process.env.ADMIN_PASSWORD) {
    process.env.SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  } else if (!process.env.ADMIN_PASSWORD && process.env.SUPER_ADMIN_PASSWORD) {
    process.env.ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  }

  if (!process.env.SUPER_ADMIN_NAME && process.env.ADMIN_NAME) {
    process.env.SUPER_ADMIN_NAME = process.env.ADMIN_NAME;
  } else if (!process.env.ADMIN_NAME && process.env.SUPER_ADMIN_NAME) {
    process.env.ADMIN_NAME = process.env.SUPER_ADMIN_NAME;
  }

  return { loaded: envLoaded, path: loadedFromPath };
}

/**
 * Returns diagnostic metadata regarding admin configuration (without exposing secrets).
 */
function getAdminConfigStatus() {
  loadEnvFile();

  const emailRaw = process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '';
  const passRaw = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
  const nameRaw = process.env.SUPER_ADMIN_NAME || process.env.ADMIN_NAME || '';

  const cleanEmail = String(emailRaw).trim().toLowerCase();
  const passLen = String(passRaw).trim().length;

  return {
    emailConfigured: Boolean(cleanEmail),
    emailValueClean: cleanEmail,
    emailSource: process.env.SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN_EMAIL' : (process.env.ADMIN_EMAIL ? 'ADMIN_EMAIL' : 'none'),
    passwordConfigured: passLen > 0,
    passwordLength: passLen,
    passwordValidLength: passLen >= 8,
    passwordSource: process.env.SUPER_ADMIN_PASSWORD ? 'SUPER_ADMIN_PASSWORD' : (process.env.ADMIN_PASSWORD ? 'ADMIN_PASSWORD' : 'none'),
    nameConfigured: Boolean(nameRaw),
    isFullyConfigured: Boolean(cleanEmail && passLen >= 8),
    envFileLoaded: envLoaded,
    envFilePath: loadedFromPath
  };
}

// Automatically invoke on module load
loadEnvFile();

module.exports = {
  loadEnvFile,
  parseEnvString,
  getAdminConfigStatus
};
