import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { nowIso } from "./lib/time.js";
const VALID_TRANSITIONS = {
    QUARANTINED: ["AWAITING_CONFIRMATION", "REJECTED", "CANCELLED", "EXPIRED"],
    AWAITING_CONFIRMATION: ["QUEUED", "CANCELLED", "EXPIRED"],
    QUEUED: ["COMPLETED", "EXPIRED"],
    COMPLETED: ["EXPIRED"],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
};
function bool(value) {
    return Number(value) === 1;
}
function nullableString(value) {
    return value === null || value === undefined ? null : String(value);
}
function nullableNumber(value) {
    return value === null || value === undefined ? null : Number(value);
}
function mapJob(row) {
    return {
        id: String(row.id),
        publicReference: String(row.public_reference),
        confirmationTokenHash: nullableString(row.confirmation_token_hash),
        roomNumber: String(row.room_number),
        lastName: String(row.last_name),
        originalFilename: String(row.original_filename),
        storedFilename: String(row.stored_filename),
        mimeType: String(row.mime_type),
        fileSize: Number(row.file_size),
        pageCount: nullableNumber(row.page_count),
        freePageLimitSnapshot: nullableNumber(row.free_page_limit_snapshot),
        chargeablePages: nullableNumber(row.chargeable_pages),
        pricePerPageMinorSnapshot: nullableNumber(row.price_per_page_minor_snapshot),
        currencySnapshot: nullableString(row.currency_snapshot),
        totalMinor: nullableNumber(row.total_minor),
        status: String(row.status),
        scanStatus: String(row.scan_status),
        scanCompletedAt: nullableString(row.scan_completed_at),
        createdAt: String(row.created_at),
        confirmationExpiresAt: nullableString(row.confirmation_expires_at),
        acceptedAt: nullableString(row.accepted_at),
        completedAt: nullableString(row.completed_at),
        expiresAt: nullableString(row.expires_at),
    };
}
function mapSettings(row) {
    return {
        hotelName: String(row.hotel_name),
        freePageLimit: Number(row.free_page_limit),
        pricePerPageMinor: Number(row.price_per_page_minor),
        currency: String(row.currency),
        maxUploadBytes: Number(row.max_upload_bytes),
        maxPageCount: Number(row.max_page_count),
        retentionHours: Number(row.retention_hours),
        confirmationTimeoutMinutes: Number(row.confirmation_timeout_minutes),
        antivirusRequired: bool(row.antivirus_required),
        publicCustomerUrl: String(row.public_customer_url),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}
function mapAdmin(row) {
    return {
        id: String(row.id),
        username: String(row.username),
        passwordHash: String(row.password_hash),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        lastLoginAt: nullableString(row.last_login_at),
    };
}
export class HotelDatabase {
    sqlite;
    constructor(databasePath) {
        this.sqlite = new DatabaseSync(databasePath);
        this.sqlite.exec("PRAGMA journal_mode = WAL;");
        this.sqlite.exec("PRAGMA foreign_keys = ON;");
        this.sqlite.exec("PRAGMA busy_timeout = 5000;");
        this.migrate();
    }
    close() {
        this.sqlite.close();
    }
    migrate() {
        this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        hotel_name TEXT NOT NULL,
        free_page_limit INTEGER NOT NULL CHECK (free_page_limit >= 0),
        price_per_page_minor INTEGER NOT NULL CHECK (price_per_page_minor >= 0),
        currency TEXT NOT NULL,
        max_upload_bytes INTEGER NOT NULL CHECK (max_upload_bytes > 0),
        max_page_count INTEGER NOT NULL CHECK (max_page_count > 0),
        retention_hours INTEGER NOT NULL CHECK (retention_hours > 0),
        confirmation_timeout_minutes INTEGER NOT NULL CHECK (confirmation_timeout_minutes > 0),
        antivirus_required INTEGER NOT NULL CHECK (antivirus_required IN (0, 1)),
        public_customer_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        public_reference TEXT NOT NULL UNIQUE,
        confirmation_token_hash TEXT,
        room_number TEXT NOT NULL,
        last_name TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK (file_size >= 0),
        page_count INTEGER,
        free_page_limit_snapshot INTEGER,
        chargeable_pages INTEGER,
        price_per_page_minor_snapshot INTEGER,
        currency_snapshot TEXT,
        total_minor INTEGER,
        status TEXT NOT NULL,
        scan_status TEXT NOT NULL,
        scan_completed_at TEXT,
        created_at TEXT NOT NULL,
        confirmation_expires_at TEXT,
        accepted_at TEXT,
        completed_at TEXT,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_created
        ON jobs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_confirmation_expires
        ON jobs(status, confirmation_expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires
        ON sessions(expires_at);
    `);
        const current = nowIso();
        this.sqlite
            .prepare(`INSERT OR IGNORE INTO settings (
          id, hotel_name, free_page_limit, price_per_page_minor, currency,
          max_upload_bytes, max_page_count, retention_hours,
          confirmation_timeout_minutes, antivirus_required,
          public_customer_url, created_at, updated_at
        ) VALUES (1, ?, 3, 50, 'USD', 10485760, 100, 24, 15, 1, ?, ?, ?)`)
            .run("Hotel Print Service", "http://localhost:3000/", current, current);
    }
    getSettings() {
        const row = this.sqlite.prepare("SELECT * FROM settings WHERE id = 1").get();
        return mapSettings(row);
    }
    updateSettings(settings) {
        const updatedAt = nowIso();
        this.sqlite
            .prepare(`UPDATE settings SET
          hotel_name = ?, free_page_limit = ?, price_per_page_minor = ?,
          currency = ?, max_upload_bytes = ?, max_page_count = ?,
          retention_hours = ?, confirmation_timeout_minutes = ?,
          antivirus_required = ?, public_customer_url = ?, updated_at = ?
        WHERE id = 1`)
            .run(settings.hotelName, settings.freePageLimit, settings.pricePerPageMinor, settings.currency, settings.maxUploadBytes, settings.maxPageCount, settings.retentionHours, settings.confirmationTimeoutMinutes, settings.antivirusRequired ? 1 : 0, settings.publicCustomerUrl, updatedAt);
        return this.getSettings();
    }
    countAdmins() {
        const row = this.sqlite.prepare("SELECT COUNT(*) AS count FROM admin_users").get();
        return Number(row.count);
    }
    createAdmin(username, passwordHash) {
        const id = crypto.randomUUID();
        const current = nowIso();
        this.sqlite
            .prepare(`INSERT INTO admin_users
          (id, username, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`)
            .run(id, username, passwordHash, current, current);
        return this.getAdminById(id);
    }
    getAdminByUsername(username) {
        const row = this.sqlite
            .prepare("SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE")
            .get(username);
        return row ? mapAdmin(row) : null;
    }
    getAdminById(id) {
        const row = this.sqlite.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
        return row ? mapAdmin(row) : null;
    }
    updateAdminLastLogin(id) {
        this.sqlite
            .prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?")
            .run(nowIso(), nowIso(), id);
    }
    createSession(session) {
        this.sqlite
            .prepare(`INSERT INTO sessions
          (id_hash, user_id, csrf_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`)
            .run(session.idHash, session.userId, session.csrfToken, session.expiresAt, session.createdAt);
    }
    getSession(idHash) {
        const row = this.sqlite.prepare("SELECT * FROM sessions WHERE id_hash = ?").get(idHash);
        if (!row)
            return null;
        return {
            idHash: String(row.id_hash),
            userId: String(row.user_id),
            csrfToken: String(row.csrf_token),
            expiresAt: String(row.expires_at),
            createdAt: String(row.created_at),
        };
    }
    deleteSession(idHash) {
        this.sqlite.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
    }
    deleteExpiredSessions(current = nowIso()) {
        this.sqlite.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(current);
    }
    createQuarantinedJob(input) {
        const id = crypto.randomUUID();
        this.sqlite
            .prepare(`INSERT INTO jobs (
          id, public_reference, confirmation_token_hash, room_number, last_name,
          original_filename, stored_filename, mime_type, file_size,
          status, scan_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUARANTINED', 'PENDING', ?)`)
            .run(id, input.publicReference, input.confirmationTokenHash, input.roomNumber, input.lastName, input.originalFilename, input.storedFilename, input.mimeType, input.fileSize, input.createdAt);
        return this.getJobById(id);
    }
    getJobById(id) {
        const row = this.sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
        return row ? mapJob(row) : null;
    }
    getJobByReference(reference) {
        const row = this.sqlite
            .prepare("SELECT * FROM jobs WHERE public_reference = ?")
            .get(reference);
        return row ? mapJob(row) : null;
    }
    listQueuedJobs() {
        return this.sqlite
            .prepare("SELECT * FROM jobs WHERE status = 'QUEUED' ORDER BY created_at ASC")
            .all().map(mapJob);
    }
    listJobsForCleanup(current) {
        return this.sqlite
            .prepare(`SELECT * FROM jobs
           WHERE
             (status IN ('QUARANTINED', 'AWAITING_CONFIRMATION')
               AND confirmation_expires_at IS NOT NULL
               AND confirmation_expires_at <= ?)
             OR
             (status IN ('QUEUED', 'COMPLETED')
               AND expires_at IS NOT NULL
               AND expires_at <= ?)`)
            .all(current, current).map(mapJob);
    }
    markAwaitingConfirmation(input) {
        const current = this.getJobById(input.id);
        if (!current || !VALID_TRANSITIONS[current.status].includes("AWAITING_CONFIRMATION")) {
            throw new Error("Invalid job transition.");
        }
        this.sqlite
            .prepare(`UPDATE jobs SET
          status = 'AWAITING_CONFIRMATION', scan_status = ?, scan_completed_at = ?,
          page_count = ?, free_page_limit_snapshot = ?, chargeable_pages = ?,
          price_per_page_minor_snapshot = ?, currency_snapshot = ?, total_minor = ?,
          confirmation_expires_at = ?
         WHERE id = ? AND status = 'QUARANTINED'`)
            .run(input.scanStatus, input.scanCompletedAt, input.pageCount, input.freePageLimit, input.chargeablePages, input.pricePerPageMinor, input.currency, input.totalMinor, input.confirmationExpiresAt, input.id);
        return this.getJobById(input.id);
    }
    markRejected(id, scanStatus) {
        const job = this.getJobById(id);
        if (!job || !VALID_TRANSITIONS[job.status].includes("REJECTED"))
            return;
        this.sqlite
            .prepare(`UPDATE jobs SET status = 'REJECTED', scan_status = ?,
          scan_completed_at = ?, confirmation_token_hash = NULL
         WHERE id = ?`)
            .run(scanStatus, nowIso(), id);
    }
    transition(id, nextStatus, patch = {}) {
        const current = this.getJobById(id);
        if (!current || !VALID_TRANSITIONS[current.status].includes(nextStatus)) {
            throw new Error("Invalid job transition.");
        }
        this.sqlite
            .prepare(`UPDATE jobs SET
          status = ?,
          stored_filename = ?,
          confirmation_token_hash = ?,
          accepted_at = ?,
          completed_at = ?,
          expires_at = ?
        WHERE id = ? AND status = ?`)
            .run(nextStatus, patch.storedFilename ?? current.storedFilename, patch.confirmationTokenHash === undefined
            ? current.confirmationTokenHash
            : patch.confirmationTokenHash, patch.acceptedAt === undefined ? current.acceptedAt : patch.acceptedAt, patch.completedAt === undefined ? current.completedAt : patch.completedAt, patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt, id, current.status);
        return this.getJobById(id);
    }
    getQueueStats() {
        const row = this.sqlite
            .prepare(`SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN total_minor = 0 THEN 1 ELSE 0 END) AS free,
          SUM(CASE WHEN total_minor > 0 THEN 1 ELSE 0 END) AS payment_required
         FROM jobs WHERE status = 'QUEUED'`)
            .get();
        return {
            total: Number(row.total ?? 0),
            free: Number(row.free ?? 0),
            paymentRequired: Number(row.payment_required ?? 0),
        };
    }
    deleteJob(id) {
        this.sqlite.prepare("DELETE FROM jobs WHERE id = ?").run(id);
    }
}
//# sourceMappingURL=database.js.map