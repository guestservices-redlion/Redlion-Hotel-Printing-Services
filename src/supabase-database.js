import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { nowIso } from "./lib/time.js";

const VALID_TRANSITIONS = {
    QUARANTINED: ["AWAITING_CONFIRMATION", "REJECTED", "CANCELLED", "EXPIRED"],
    AWAITING_CONFIRMATION: ["QUEUED", "CANCELLED", "EXPIRED"],
    QUEUED: ["COMPLETED", "EXPIRED"],
    COMPLETED: ["EXPIRED"],
    REJECTED: [], CANCELLED: [], EXPIRED: [],
};

function fail(error) {
    if (error)
        throw new Error(`Supabase: ${error.message}`);
}

function mapSettings(row) {
    return {
        hotelName: row.hotel_name,
        freePageLimit: row.free_page_limit,
        pricePerPageMinor: row.price_per_page_minor,
        currency: row.currency,
        maxUploadBytes: row.max_upload_bytes,
        maxPageCount: row.max_page_count,
        retentionHours: row.retention_hours,
        confirmationTimeoutMinutes: row.confirmation_timeout_minutes,
        antivirusRequired: row.antivirus_required,
        publicCustomerUrl: row.public_customer_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapAdmin(row) {
    return {
        id: row.id, username: row.username, passwordHash: row.password_hash,
        createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at,
    };
}

function mapJob(row) {
    return {
        id: row.id, publicReference: row.public_reference,
        confirmationTokenHash: row.confirmation_token_hash, roomNumber: row.room_number,
        lastName: row.last_name, originalFilename: row.original_filename,
        storedFilename: row.storage_path, mimeType: row.mime_type, fileSize: Number(row.file_size),
        pageCount: row.page_count, freePageLimitSnapshot: row.free_page_limit_snapshot,
        chargeablePages: row.chargeable_pages,
        pricePerPageMinorSnapshot: row.price_per_page_minor_snapshot,
        currencySnapshot: row.currency_snapshot, totalMinor: row.total_minor,
        status: row.status, scanStatus: row.scan_status, scanCompletedAt: row.scan_completed_at,
        createdAt: row.created_at, confirmationExpiresAt: row.confirmation_expires_at,
        acceptedAt: row.accepted_at, completedAt: row.completed_at, expiresAt: row.expires_at,
    };
}

export class SupabaseHotelDatabase {
    kind = "supabase";
    client;
    constructor(url, secretKey) {
        this.client = createClient(url, secretKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
    }
    close() {}
    async getSettings() {
        const { data, error } = await this.client.from("hotel_settings").select("*").eq("id", 1).single();
        fail(error); return mapSettings(data);
    }
    async updateSettings(settings) {
        const { error } = await this.client.from("hotel_settings").update({
            hotel_name: settings.hotelName, free_page_limit: settings.freePageLimit,
            price_per_page_minor: settings.pricePerPageMinor, currency: settings.currency,
            max_upload_bytes: settings.maxUploadBytes, max_page_count: settings.maxPageCount,
            retention_hours: settings.retentionHours,
            confirmation_timeout_minutes: settings.confirmationTimeoutMinutes,
            antivirus_required: settings.antivirusRequired,
            public_customer_url: settings.publicCustomerUrl, updated_at: nowIso(),
        }).eq("id", 1);
        fail(error); return this.getSettings();
    }
    async countAdmins() {
        const { count, error } = await this.client.from("admin_users").select("id", { count: "exact", head: true });
        fail(error); return count ?? 0;
    }
    async createAdmin(username, passwordHash) {
        const current = nowIso();
        const { data, error } = await this.client.from("admin_users").insert({
            id: crypto.randomUUID(), username, password_hash: passwordHash,
            created_at: current, updated_at: current,
        }).select().single();
        fail(error); return mapAdmin(data);
    }
    async getAdminByUsername(username) {
        const { data, error } = await this.client.from("admin_users").select("*").ilike("username", username).maybeSingle();
        fail(error); return data ? mapAdmin(data) : null;
    }
    async getAdminById(id) {
        const { data, error } = await this.client.from("admin_users").select("*").eq("id", id).maybeSingle();
        fail(error); return data ? mapAdmin(data) : null;
    }
    async updateAdminLastLogin(id) {
        const current = nowIso();
        const { error } = await this.client.from("admin_users").update({ last_login_at: current, updated_at: current }).eq("id", id);
        fail(error);
    }
    async createSession(session) {
        const { error } = await this.client.from("admin_sessions").insert({
            id_hash: session.idHash, user_id: session.userId, csrf_token: session.csrfToken,
            expires_at: session.expiresAt, created_at: session.createdAt,
        }); fail(error);
    }
    async getSession(idHash) {
        const { data, error } = await this.client.from("admin_sessions").select("*").eq("id_hash", idHash).maybeSingle();
        fail(error); return data ? { idHash: data.id_hash, userId: data.user_id, csrfToken: data.csrf_token, expiresAt: data.expires_at, createdAt: data.created_at } : null;
    }
    async deleteSession(idHash) {
        const { error } = await this.client.from("admin_sessions").delete().eq("id_hash", idHash); fail(error);
    }
    async deleteExpiredSessions(current = nowIso()) {
        const { error } = await this.client.from("admin_sessions").delete().lte("expires_at", current); fail(error);
    }
    async createQuarantinedJob(input) {
        const { data, error } = await this.client.from("print_jobs").insert({
            id: crypto.randomUUID(), public_reference: input.publicReference,
            confirmation_token_hash: input.confirmationTokenHash, room_number: input.roomNumber,
            last_name: input.lastName, original_filename: input.originalFilename,
            storage_path: input.storedFilename, mime_type: input.mimeType, file_size: input.fileSize,
            status: "QUARANTINED", scan_status: "PENDING", created_at: input.createdAt,
        }).select().single(); fail(error); return mapJob(data);
    }
    async getJobById(id) {
        const { data, error } = await this.client.from("print_jobs").select("*").eq("id", id).maybeSingle();
        fail(error); return data ? mapJob(data) : null;
    }
    async getJobByReference(reference) {
        const { data, error } = await this.client.from("print_jobs").select("*").eq("public_reference", reference).maybeSingle();
        fail(error); return data ? mapJob(data) : null;
    }
    async listQueuedJobs() {
        const { data, error } = await this.client.from("print_jobs").select("*").eq("status", "QUEUED").order("created_at");
        fail(error); return data.map(mapJob);
    }
    async listJobsForCleanup(current) {
        const filter = `and(status.in.(QUARANTINED,AWAITING_CONFIRMATION),confirmation_expires_at.lte.${current}),and(status.in.(QUEUED,COMPLETED),expires_at.lte.${current})`;
        const { data, error } = await this.client.from("print_jobs").select("*").or(filter);
        fail(error); return data.map(mapJob);
    }
    async markAwaitingConfirmation(input) {
        const current = await this.getJobById(input.id);
        if (!current || !VALID_TRANSITIONS[current.status].includes("AWAITING_CONFIRMATION")) throw new Error("Invalid job transition.");
        const { error } = await this.client.from("print_jobs").update({
            status: "AWAITING_CONFIRMATION", scan_status: input.scanStatus,
            scan_completed_at: input.scanCompletedAt, page_count: input.pageCount,
            free_page_limit_snapshot: input.freePageLimit, chargeable_pages: input.chargeablePages,
            price_per_page_minor_snapshot: input.pricePerPageMinor,
            currency_snapshot: input.currency, total_minor: input.totalMinor,
            confirmation_expires_at: input.confirmationExpiresAt,
        }).eq("id", input.id).eq("status", "QUARANTINED"); fail(error);
        return this.getJobById(input.id);
    }
    async markRejected(id, scanStatus) {
        const job = await this.getJobById(id);
        if (!job || !VALID_TRANSITIONS[job.status].includes("REJECTED")) return;
        const { error } = await this.client.from("print_jobs").update({ status: "REJECTED", scan_status: scanStatus, scan_completed_at: nowIso(), confirmation_token_hash: null }).eq("id", id);
        fail(error);
    }
    async transition(id, nextStatus, patch = {}) {
        const current = await this.getJobById(id);
        if (!current || !VALID_TRANSITIONS[current.status].includes(nextStatus)) throw new Error("Invalid job transition.");
        const { error } = await this.client.from("print_jobs").update({
            status: nextStatus, storage_path: patch.storedFilename ?? current.storedFilename,
            confirmation_token_hash: patch.confirmationTokenHash === undefined ? current.confirmationTokenHash : patch.confirmationTokenHash,
            accepted_at: patch.acceptedAt === undefined ? current.acceptedAt : patch.acceptedAt,
            completed_at: patch.completedAt === undefined ? current.completedAt : patch.completedAt,
            expires_at: patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
        }).eq("id", id).eq("status", current.status); fail(error);
        return this.getJobById(id);
    }
    async getQueueStats() {
        const { data, error } = await this.client.from("print_jobs").select("total_minor").eq("status", "QUEUED");
        fail(error); return { total: data.length, free: data.filter(row => row.total_minor === 0).length, paymentRequired: data.filter(row => row.total_minor > 0).length };
    }
    async deleteJob(id) {
        const { error } = await this.client.from("print_jobs").delete().eq("id", id); fail(error);
    }
}
