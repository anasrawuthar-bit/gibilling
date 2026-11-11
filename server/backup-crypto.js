/**
 * ZynBill Tenant Cloud Backup Cryptographic Engine
 * Provides Application-Level AES-256-GCM Encryption at Rest for Tenant Backups.
 * 
 * Architecture:
 * - Master Key: Provided via process.env.BACKUP_ENCRYPTION_KEY or persisted in server/data/secrets/backup_master.key.
 * - Per-Tenant Key Derivation: Each tenant's backup key is derived using HKDF-SHA256(masterKey, customerId, info, 32).
 * - Authenticated Envelope: Uses AES-256-GCM with a fresh 12-byte CSPRNG IV per backup.
 * - Additional Authenticated Data (AAD): Cryptographically binds metadata (customerId, schemaVersion, timestamp)
 *   to the ciphertext so metadata cannot be forged or swapped across tenants.
 * - Backward Compatibility: Gracefully identifies and reads legacy unencrypted SQLite files.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAGIC_HEADER = Buffer.from('ZYNBKP01'); // 8 bytes: ZynBill Backup Format v1
let activeKeyId = 'k1';
const SECRETS_DIR = path.join(__dirname, 'data', 'secrets');
const KEY_FILE = path.join(SECRETS_DIR, 'backup_master.key');

/**
 * Returns the currently active encryption key identifier.
 */
function getActiveKeyId() {
  return activeKeyId;
}

/**
 * Sets the active encryption key identifier (used for key rotation).
 */
function setActiveKeyId(newKeyId) {
  if (!newKeyId || typeof newKeyId !== 'string') {
    throw new Error('Key ID must be a non-empty string.');
  }
  activeKeyId = newKeyId.trim();
  return activeKeyId;
}

/**
 * Validates whether the server is configured with a secure production encryption secret.
 */
function validateProductionKeyConfiguration() {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY ? process.env.BACKUP_ENCRYPTION_KEY.trim() : null;
  const keyring = process.env.BACKUP_KEYRING ? process.env.BACKUP_KEYRING.trim() : null;

  if (keyring) {
    try {
      const parsed = JSON.parse(keyring);
      if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return {
          ok: true,
          source: 'env_keyring',
          isProductionSafe: true,
          keyCount: Object.keys(parsed).length,
          message: 'Production backup encryption key ring configured via BACKUP_KEYRING environment variable.'
        };
      }
    } catch (_) {}
  }

  if (envKey) {
    const byteLen = Buffer.byteLength(envKey);
    const isHex64 = envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey);
    const isBase64_44 = envKey.length === 44 && /^[0-9a-zA-Z+/=]+$/.test(envKey);

    if (isHex64 || isBase64_44 || byteLen >= 32) {
      return {
        ok: true,
        source: 'env_var',
        isProductionSafe: true,
        message: 'Production backup encryption master key configured via BACKUP_ENCRYPTION_KEY environment variable.'
      };
    } else {
      return {
        ok: false,
        source: 'env_var_insufficient_entropy',
        isProductionSafe: false,
        error: 'BACKUP_ENCRYPTION_KEY is too short. Must be at least 32 bytes (or 64 hex characters).'
      };
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  return {
    ok: !isProduction,
    source: fs.existsSync(KEY_FILE) ? 'filesystem_fallback' : 'ephemeral_fallback',
    isProductionSafe: false,
    error: isProduction
      ? 'CRITICAL SECURITY: BACKUP_ENCRYPTION_KEY is NOT configured in environment. Filesystem fallback keys are not permitted in production.'
      : 'Using local filesystem key fallback for development/staging environment.'
  };
}

/**
 * Retrieves or generates the Master Backup Encryption Key (32 bytes / 256 bits) for a given keyId.
 */
function getMasterKey(keyId = activeKeyId) {
  // 1. Check versioned key in environment (e.g., BACKUP_ENCRYPTION_KEY_K2)
  const versionedEnvVar = `BACKUP_ENCRYPTION_KEY_${keyId.toUpperCase()}`;
  const versionedEnvKey = process.env[versionedEnvVar] ? process.env[versionedEnvVar].trim() : null;
  if (versionedEnvKey) {
    if (versionedEnvKey.length === 64 && /^[0-9a-fA-F]+$/.test(versionedEnvKey)) {
      return Buffer.from(versionedEnvKey, 'hex');
    }
    return crypto.createHash('sha256').update(versionedEnvKey).digest();
  }

  // 2. Check BACKUP_KEYRING JSON environment variable
  if (process.env.BACKUP_KEYRING) {
    try {
      const ring = JSON.parse(process.env.BACKUP_KEYRING);
      if (ring[keyId]) {
        const rk = ring[keyId].trim();
        if (rk.length === 64 && /^[0-9a-fA-F]+$/.test(rk)) {
          return Buffer.from(rk, 'hex');
        }
        return crypto.createHash('sha256').update(rk).digest();
      }
    } catch (_) {}
  }

  // 3. Check primary BACKUP_ENCRYPTION_KEY environment variable
  const envKey = process.env.BACKUP_ENCRYPTION_KEY ? process.env.BACKUP_ENCRYPTION_KEY.trim() : null;
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    } else if (envKey.length === 44 && /^[0-9a-zA-Z+/=]+$/.test(envKey)) {
      return Buffer.from(envKey, 'base64');
    } else if (Buffer.byteLength(envKey) >= 32) {
      return crypto.createHash('sha256').update(envKey).digest();
    }
  }

  // Production safety check
  if (process.env.NODE_ENV === 'production' && process.env.STRICT_PRODUCTION_SECURITY === 'true') {
    throw new Error('CRITICAL SECURITY VIOLATION: BACKUP_ENCRYPTION_KEY environment secret is required in production.');
  }

  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }

  const versionedKeyFile = path.join(SECRETS_DIR, `backup_master_${keyId}.key`);
  const targetFile = fs.existsSync(versionedKeyFile) ? versionedKeyFile : KEY_FILE;

  if (fs.existsSync(targetFile)) {
    const fileContent = fs.readFileSync(targetFile, 'utf8').trim();
    if (fileContent.length === 64) {
      return Buffer.from(fileContent, 'hex');
    }
  }

  // Generate fresh cryptographically secure 256-bit master key
  const freshKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(targetFile, freshKey.toString('hex'), { mode: 0o600 });
    console.log(`[BackupCrypto] Generated and persisted Master Key (${keyId}) in secrets store: ${targetFile}`);
  } catch (err) {
    console.warn('[BackupCrypto] Could not persist key file (using memory key):', err.message);
  }
  return freshKey;
}

/**
 * Derives a tenant-specific 256-bit encryption key using HKDF-SHA256.
 */
function deriveTenantKey(customerId, keyId = activeKeyId) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('customerId is required for tenant key derivation.');
  }
  const masterKey = getMasterKey(keyId);
  const info = `zynbill_backup_encryption_${keyId}`;
  const derived = crypto.hkdfSync('sha256', masterKey, customerId, info, 32);
  return Buffer.from(derived);
}

/**
 * Checks whether a buffer has the ZynBill encrypted envelope header.
 */
function isEncryptedEnvelope(buffer) {
  if (!buffer || buffer.length < MAGIC_HEADER.length) return false;
  return buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
}

/**
 * Inspects a backup buffer and categorizes its format, encryption status, and version.
 */
function inspectBackupFormat(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) {
    return { format: 'invalid', isEncrypted: false, isSqlite: false };
  }

  if (isEncryptedEnvelope(buffer)) {
    let keyId = 'k1';
    try {
      const keyIdLen = buffer.readUInt8(MAGIC_HEADER.length);
      keyId = buffer.subarray(MAGIC_HEADER.length + 1, MAGIC_HEADER.length + 1 + keyIdLen).toString('utf8');
    } catch (_) {}
    return {
      format: 'encrypted',
      version: 'ZYNBKP01',
      keyId,
      isEncrypted: true,
      isSqlite: true // Will be SQLite after decryption
    };
  }

  const headerPrefix = buffer.subarray(0, 16).toString('utf8');
  if (headerPrefix.startsWith('SQLite format 3')) {
    return {
      format: 'legacy_plaintext',
      version: 'sqlite3',
      isEncrypted: false,
      isSqlite: true
    };
  }

  return { format: 'unknown', isEncrypted: false, isSqlite: false };
}

/**
 * Encrypts a raw SQLite database buffer using AES-256-GCM.
 * Envelope layout:
 * [8 bytes: MAGIC 'ZYNBKP01']
 * [1 byte: keyId length] + [N bytes: keyId string]
 * [12 bytes: IV / nonce]
 * [16 bytes: GCM Auth Tag]
 * [2 bytes: AAD length (uint16 BE)] + [M bytes: AAD JSON string]
 * [Rest: AES-256-GCM Ciphertext]
 */
function encryptBackupEnvelope(sqliteBuffer, customerId, metadata = {}) {
  if (!sqliteBuffer || !Buffer.isBuffer(sqliteBuffer)) {
    throw new Error('sqliteBuffer must be a valid Buffer.');
  }
  if (!customerId) {
    throw new Error('customerId is required for backup encryption.');
  }

  const selectedKeyId = metadata.keyId || activeKeyId;
  const tenantKey = deriveTenantKey(customerId, selectedKeyId);
  const iv = crypto.randomBytes(12);

  const aadData = {
    customerId,
    companyName: metadata.companyName || '',
    schemaVersion: metadata.schemaVersion || 9,
    timestamp: metadata.timestamp || new Date().toISOString(),
    uncompressedSize: sqliteBuffer.length,
    format: 'sqlite3'
  };
  const aadBuffer = Buffer.from(JSON.stringify(aadData), 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', tenantKey, iv);
  cipher.setAAD(aadBuffer);

  const ciphertext = Buffer.concat([cipher.update(sqliteBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const keyIdBuffer = Buffer.from(selectedKeyId, 'utf8');
  const keyIdLenBuf = Buffer.from([keyIdBuffer.length]);

  const aadLenBuf = Buffer.alloc(2);
  aadLenBuf.writeUInt16BE(aadBuffer.length, 0);

  return Buffer.concat([
    MAGIC_HEADER,
    keyIdLenBuf,
    keyIdBuffer,
    iv,
    authTag,
    aadLenBuf,
    aadBuffer,
    ciphertext
  ]);
}

/**
 * Decrypts an envelope buffer and returns the raw SQLite database buffer.
 * If the buffer is legacy unencrypted SQLite, returns it directly after validation.
 */
function decryptBackupEnvelope(envelopeBuffer, customerId) {
  if (!envelopeBuffer || !Buffer.isBuffer(envelopeBuffer) || envelopeBuffer.length < 16) {
    throw new Error('Invalid or truncated backup envelope buffer.');
  }

  const inspection = inspectBackupFormat(envelopeBuffer);

  // Handle legacy unencrypted SQLite files (backward compatibility)
  if (inspection.format === 'legacy_plaintext') {
    return envelopeBuffer;
  }

  if (inspection.format !== 'encrypted') {
    throw new Error('Unrecognized backup file format: neither ZYNBKP01 encrypted envelope nor SQLite format 3.');
  }

  let offset = MAGIC_HEADER.length;

  const keyIdLen = envelopeBuffer.readUInt8(offset);
  offset += 1;

  const keyId = envelopeBuffer.subarray(offset, offset + keyIdLen).toString('utf8');
  offset += keyIdLen;

  const iv = envelopeBuffer.subarray(offset, offset + 12);
  offset += 12;

  const authTag = envelopeBuffer.subarray(offset, offset + 16);
  offset += 16;

  const aadLen = envelopeBuffer.readUInt16BE(offset);
  offset += 2;

  const aadBuffer = envelopeBuffer.subarray(offset, offset + aadLen);
  offset += aadLen;

  let aadObj = {};
  try {
    aadObj = JSON.parse(aadBuffer.toString('utf8'));
  } catch (parseErr) {
    throw new Error('Failed to parse authenticated backup metadata: ' + parseErr.message);
  }

  // Strict tenant boundary assertion
  if (aadObj.customerId && aadObj.customerId !== customerId) {
    throw new Error(`Tenant mismatch: encrypted backup belongs to tenant (${aadObj.customerId}), cannot decrypt for (${customerId}).`);
  }

  const ciphertext = envelopeBuffer.subarray(offset);
  const tenantKey = deriveTenantKey(customerId, keyId);

  const decipher = crypto.createDecipheriv('aes-256-gcm', tenantKey, iv);
  decipher.setAAD(aadBuffer);
  decipher.setAuthTag(authTag);

  let decrypted;
  try {
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (decErr) {
    throw new Error('Backup decryption or authentication tag verification failed. Data may be corrupted or tampered: ' + decErr.message);
  }

  const decHeader = decrypted.subarray(0, 16).toString('utf8');
  if (!decHeader.startsWith('SQLite format 3')) {
    throw new Error('Decrypted payload does not contain a valid SQLite database header.');
  }

  return decrypted;
}

module.exports = {
  getMasterKey,
  getActiveKeyId,
  setActiveKeyId,
  validateProductionKeyConfiguration,
  deriveTenantKey,
  isEncryptedEnvelope,
  inspectBackupFormat,
  encryptBackupEnvelope,
  decryptBackupEnvelope
};
