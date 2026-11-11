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
const CURRENT_KEY_ID = 'k1';
const SECRETS_DIR = path.join(__dirname, 'data', 'secrets');
const KEY_FILE = path.join(SECRETS_DIR, 'backup_master.key');

/**
 * Retrieves or generates the server Master Backup Encryption Key (32 bytes / 256 bits).
 */
function getMasterKey() {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY ? process.env.BACKUP_ENCRYPTION_KEY.trim() : null;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    } else if (envKey.length === 44) {
      return Buffer.from(envKey, 'base64');
    } else if (Buffer.byteLength(envKey) >= 32) {
      return crypto.createHash('sha256').update(envKey).digest();
    }
  }

  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }

  if (fs.existsSync(KEY_FILE)) {
    const fileContent = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (fileContent.length === 64) {
      return Buffer.from(fileContent, 'hex');
    }
  }

  // Generate fresh cryptographically secure 256-bit master key
  const freshKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(KEY_FILE, freshKey.toString('hex'), { mode: 0o600 });
    console.log('[BackupCrypto] Generated and persisted fresh Master Backup Encryption Key in secrets store.');
  } catch (err) {
    console.warn('[BackupCrypto] Could not persist key file (using memory key):', err.message);
  }
  return freshKey;
}

/**
 * Derives a tenant-specific 256-bit encryption key using HKDF-SHA256.
 */
function deriveTenantKey(customerId, keyId = CURRENT_KEY_ID) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('customerId is required for tenant key derivation.');
  }
  const masterKey = getMasterKey();
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

  const tenantKey = deriveTenantKey(customerId, CURRENT_KEY_ID);
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

  const keyIdBuffer = Buffer.from(CURRENT_KEY_ID, 'utf8');
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

  // Handle legacy unencrypted SQLite files (backward compatibility)
  const headerPrefix = envelopeBuffer.subarray(0, 16).toString('utf8');
  if (headerPrefix.startsWith('SQLite format 3')) {
    return envelopeBuffer;
  }

  if (!isEncryptedEnvelope(envelopeBuffer)) {
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
  deriveTenantKey,
  isEncryptedEnvelope,
  encryptBackupEnvelope,
  decryptBackupEnvelope
};
