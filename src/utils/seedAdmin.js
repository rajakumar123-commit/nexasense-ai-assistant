'use strict';

// ============================================================
// src/utils/seedAdmin.js — NexaSense AI Assistant
// Idempotent RBAC seeding: roles, permissions, admin user.
// Called by server.js after DB connectivity is confirmed.
// Safe to run on every startup — no duplicate writes.
// ============================================================

const bcrypt   = require('bcrypt');
const fs       = require('fs');
const { pool } = require('../db');          // ← pool, not db.query

const SALT_ROUNDS = 12;

const log = {
  info:  (msg, m = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(),  level: 'info',  msg, ...m })),
  warn:  (msg, m = {}) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn',  msg, ...m })),
  error: (msg, m = {}) => console.error(JSON.stringify({ ts: new Date().toISOString(),level: 'error', msg, ...m })),
};

// ── Docker Secrets support ────────────────────────────────────
// If ADMIN_EMAIL_FILE or ADMIN_PASSWORD_FILE are set, read from file.
// Otherwise fall back to plain env vars.
function getEnv(key) {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey]) {
    try { return fs.readFileSync(process.env[fileKey], 'utf8').trim(); }
    catch (err) { log.error(`Cannot read secret file ${key}`, { error: err.message }); }
  }
  return process.env[key];
}

function resolveCredentials() {
  const email      = (getEnv('ADMIN_EMAIL')    || '').toLowerCase().trim();
  const password   = (getEnv('ADMIN_PASSWORD') || '').trim();
  const forceReset = process.env.ADMIN_FORCE_RESET === 'true';

  if (!email || !password)
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(`Invalid ADMIN_EMAIL: "${email}"`);
  if (password.length < 12)
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  return { email, password, forceReset };
}

async function ensureRole(name, description) {
  const { rows } = await pool.query(
    `INSERT INTO roles (name, description) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, description]
  );
  return rows[0].id;
}

async function ensurePermission(name, description) {
  const { rows } = await pool.query(
    `INSERT INTO permissions (name, description) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, description]
  );
  return rows[0].id;
}

async function assignPermission(roleId, permissionId) {
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [roleId, permissionId]
  );
}

async function seedAdmin() {
  log.info('[seedAdmin] Starting RBAC + admin seeding...');

  // Resolve credentials first — bail non-fatally if missing/invalid
  let email, password, forceReset;
  try {
    ({ email, password, forceReset } = resolveCredentials());
  } catch (err) {
    log.warn('[seedAdmin] Skipping seed.', { reason: err.message });
    return; // Server still starts
  }

  try {
    // ── 1. Seed roles ─────────────────────────────────────────
    const adminRoleId = await ensureRole('admin', 'Full system access');
    const userRoleId  = await ensureRole('user',  'Standard user access');
    log.info('[seedAdmin] Roles verified.');

    // ── 2. Seed permissions ───────────────────────────────────
    const pAdminAccess = await ensurePermission('admin:access', 'Admin control panel');
    const pDocUpload   = await ensurePermission('doc:upload',   'Upload documents');
    const pDocDelete   = await ensurePermission('doc:delete',   'Delete documents');
    const pChatQuery   = await ensurePermission('chat:query',   'Query documents via chat');
    const pChatDelete  = await ensurePermission('chat:delete',  'Delete conversations');
    log.info('[seedAdmin] Permissions verified.');

    // ── 3. Map permissions to roles ───────────────────────────
    // Admin: all permissions
    await assignPermission(adminRoleId, pAdminAccess);
    await assignPermission(adminRoleId, pDocUpload);
    await assignPermission(adminRoleId, pDocDelete);
    await assignPermission(adminRoleId, pChatQuery);
    await assignPermission(adminRoleId, pChatDelete);

    // User: upload + query + chat-delete only
    await assignPermission(userRoleId, pDocUpload);
    await assignPermission(userRoleId, pChatQuery);
    await assignPermission(userRoleId, pChatDelete);
    log.info('[seedAdmin] Role-permission mapping verified.');

    // ── 4. Admin user provisioning ────────────────────────────
    const { rows } = await pool.query(
      `SELECT id, role, role_id::text AS role_id, password_hash
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    const existing = rows[0];

    if (!existing) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.query(
        `INSERT INTO users
           (email, password_hash, full_name, role, role_id, is_active, created_at, updated_at)
         VALUES ($1, $2, 'System Administrator', 'admin', $3, true, NOW(), NOW())`,
        [email, hash, adminRoleId]
      );
      log.info('[seedAdmin] Admin user created.', { email });

    } else {
      const needsRoleUpdate    = existing.role !== 'admin' || existing.role_id !== adminRoleId;
      const needsPasswordReset = forceReset;

      if (needsRoleUpdate || needsPasswordReset) {
        const hash = needsPasswordReset
          ? await bcrypt.hash(password, SALT_ROUNDS)
          : existing.password_hash;

        await pool.query(
          `UPDATE users
           SET role = 'admin', role_id = $1, password_hash = $2, updated_at = NOW()
           WHERE id = $3`,
          [adminRoleId, hash, existing.id]
        );

        if (needsRoleUpdate)    log.warn('[seedAdmin] Admin role/role_id corrected.', { email });
        if (needsPasswordReset) log.warn('[seedAdmin] Admin password rotated.',        { email });
      } else {
        log.info('[seedAdmin] Admin already correctly configured. No changes.', { email });
      }
    }

    // ── 5. Back-fill existing users missing role_id ───────────
    const { rowCount } = await pool.query(
      `UPDATE users u
       SET role_id = r.id
       FROM roles r
       WHERE r.name = u.role AND u.role_id IS NULL`
    );
    if (rowCount > 0) {
      log.warn('[seedAdmin] Back-filled role_id for pre-RBAC users.', { count: rowCount });
    }

    log.info('[seedAdmin] RBAC seeding complete.');

  } catch (err) {
    log.error('[seedAdmin] Seeding failed — server will still start.', {
      error: err.message,
      hint:  'Verify DB connectivity and that schema.sql has been applied.',
    });
  }
}

module.exports = { seedAdmin };
