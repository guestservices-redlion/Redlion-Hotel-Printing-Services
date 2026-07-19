import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  "sb_publishable_1sCc6Vi_3JnfHN8MRN5BAw_YqKhKs_c";
const BUCKET = "guest-documents";
const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
function fail(error: { message?: string } | null) {
  if (error) throw new ApiError(500, "SUPABASE_ERROR", error.message ?? "Backend operation failed.");
}
function now() { return new Date().toISOString(); }
function addMinutes(value: string, minutes: number) { return new Date(Date.parse(value) + minutes * 60_000).toISOString(); }
function addHours(value: string, hours: number) { return new Date(Date.parse(value) + hours * 3_600_000).toISOString(); }
function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function reference() { return `HP-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`; }
function text(value: unknown, name: string, maximum = 100) {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "INVALID_INPUT", `${name} is required.`);
  return value.trim().slice(0, maximum);
}
function integer(value: unknown, name: string, minimum: number, maximum: number) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new ApiError(400, "INVALID_INPUT", `${name} is invalid.`);
  return result;
}
function mapSettings(row: Record<string, unknown>) {
  return {
    hotelName: row.hotel_name, freePageLimit: row.free_page_limit,
    pricePerPageMinor: row.price_per_page_minor, currency: row.currency,
    maxUploadBytes: row.max_upload_bytes, maxPageCount: row.max_page_count,
    retentionHours: row.retention_hours,
    confirmationTimeoutMinutes: row.confirmation_timeout_minutes,
    antivirusRequired: false, publicCustomerUrl: row.public_customer_url,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapJob(row: Record<string, any>) {
  return {
    id: row.id, reference: row.public_reference, roomNumber: row.room_number,
    lastName: row.last_name, originalFilename: row.original_filename,
    fileSize: Number(row.file_size), pageCount: row.page_count,
    freePageLimit: row.free_page_limit_snapshot,
    chargeablePages: row.chargeable_pages,
    pricePerPageMinor: row.price_per_page_minor_snapshot,
    currency: row.currency_snapshot, totalMinor: row.total_minor,
    status: row.status, scanStatus: row.scan_status, createdAt: row.created_at,
    acceptedAt: row.accepted_at, completedAt: row.completed_at, expiresAt: row.expires_at,
  };
}
async function settings() {
  const { data, error } = await service.from("hotel_settings").select("*").eq("id", 1).single();
  fail(error); return data;
}
async function admin(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in required.");
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) throw new ApiError(401, "UNAUTHORIZED", "Your session has expired.");
  const { data: profile, error } = await service.from("admin_profiles").select("*").eq("user_id", authData.user.id).maybeSingle();
  fail(error);
  if (!profile) throw new ApiError(403, "FORBIDDEN", "Administrator access required.");
  return { user: authData.user, profile };
}
function normalizePath(url: URL) {
  const marker = "/api/";
  const index = url.pathname.lastIndexOf(marker);
  return index >= 0 ? marker + url.pathname.slice(index + marker.length) : "/api";
}
async function readJson(req: Request) {
  try { return await req.json(); } catch { throw new ApiError(400, "INVALID_JSON", "The request body is invalid."); }
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const path = normalizePath(url);
  const method = req.method;

  if (method === "GET" && path === "/api/health") return json(200, { status: "ok", backend: "supabase-edge" });
  if (method === "GET" && path === "/api/customer/config") {
    const value = await settings();
    return json(200, { hotelName: value.hotel_name, maxUploadBytes: value.max_upload_bytes, maxPageCount: value.max_page_count, acceptedTypes: ["application/pdf"] });
  }
  if (method === "POST" && path === "/api/customer/upload") {
    const config = await settings();
    const form = await req.formData();
    const file = form.get("document");
    if (!(file instanceof File)) throw new ApiError(400, "MISSING_FILE", "Select a PDF document.");
    if (file.size < 1) throw new ApiError(400, "EMPTY_FILE", "The selected file is empty.");
    if (file.size > config.max_upload_bytes) throw new ApiError(413, "FILE_TOO_LARGE", "The document exceeds the upload limit.");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) throw new ApiError(400, "INVALID_FILE_TYPE", "Only PDF documents are accepted.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new ApiError(400, "INVALID_PDF", "The selected file is not a valid PDF.");
    let document: PDFDocument;
    try { document = await PDFDocument.load(bytes, { updateMetadata: false }); }
    catch { throw new ApiError(400, "INVALID_PDF", "The PDF is damaged, encrypted, or unsupported."); }
    const pageCount = document.getPageCount();
    if (pageCount < 1 || pageCount > config.max_page_count) throw new ApiError(400, "PAGE_LIMIT", "The PDF page count is outside the allowed range.");
    const roomNumber = text(form.get("roomNumber"), "Room number", 20);
    const lastName = text(form.get("lastName"), "Last name", 80);
    const token = randomToken();
    const createdAt = now();
    const publicReference = reference();
    const storagePath = `quarantine/${crypto.randomUUID()}.pdf`;
    const chargeablePages = Math.max(pageCount - config.free_page_limit, 0);
    const totalMinor = chargeablePages * config.price_per_page_minor;
    const { error: uploadError } = await service.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    fail(uploadError);
    const { data: job, error } = await service.from("print_jobs").insert({
      id: crypto.randomUUID(), public_reference: publicReference,
      confirmation_token_hash: await hashToken(token), room_number: roomNumber,
      last_name: lastName, original_filename: file.name.slice(0, 255), storage_path: storagePath,
      mime_type: "application/pdf", file_size: file.size, page_count: pageCount,
      free_page_limit_snapshot: config.free_page_limit, chargeable_pages: chargeablePages,
      price_per_page_minor_snapshot: config.price_per_page_minor,
      currency_snapshot: config.currency, total_minor: totalMinor,
      status: "AWAITING_CONFIRMATION", scan_status: "BYPASSED", scan_completed_at: createdAt,
      created_at: createdAt, confirmation_expires_at: addMinutes(createdAt, config.confirmation_timeout_minutes),
    }).select().single();
    if (error) { await service.storage.from(BUCKET).remove([storagePath]); fail(error); }
    return json(201, { job: {
      reference: job.public_reference, confirmationToken: token, pageCount,
      freePageLimit: config.free_page_limit, chargeablePages,
      pricePerPageMinor: config.price_per_page_minor, currency: config.currency,
      totalMinor, confirmationExpiresAt: job.confirmation_expires_at, scanStatus: "BYPASSED",
    } });
  }

  const confirmation = path.match(/^\/api\/customer\/jobs\/([^/]+)\/(confirm|cancel)$/);
  if (method === "POST" && confirmation) {
    const body = await readJson(req);
    const { data: job, error } = await service.from("print_jobs").select("*").eq("public_reference", decodeURIComponent(confirmation[1])).maybeSingle();
    fail(error);
    if (!job || !job.confirmation_token_hash || await hashToken(String(body.token ?? "")) !== job.confirmation_token_hash) throw new ApiError(404, "JOB_NOT_FOUND", "Submission not found.");
    if (job.status !== "AWAITING_CONFIRMATION") throw new ApiError(409, "INVALID_JOB_STATE", "This submission was already handled.");
    if (Date.parse(job.confirmation_expires_at) <= Date.now()) {
      await service.storage.from(BUCKET).remove([job.storage_path]);
      await service.from("print_jobs").update({ status: "EXPIRED", confirmation_token_hash: null }).eq("id", job.id);
      throw new ApiError(410, "CONFIRMATION_EXPIRED", "This confirmation has expired.");
    }
    if (confirmation[2] === "cancel") {
      await service.storage.from(BUCKET).remove([job.storage_path]);
      const { error: updateError } = await service.from("print_jobs").update({ status: "CANCELLED", confirmation_token_hash: null }).eq("id", job.id).eq("status", "AWAITING_CONFIRMATION");
      fail(updateError); return json(200, { status: "CANCELLED" });
    }
    const target = `queue/${crypto.randomUUID()}.pdf`;
    const { error: moveError } = await service.storage.from(BUCKET).move(job.storage_path, target); fail(moveError);
    const acceptedAt = now(); const config = await settings();
    const { error: updateError } = await service.from("print_jobs").update({
      status: "QUEUED", storage_path: target, confirmation_token_hash: null,
      accepted_at: acceptedAt, expires_at: addHours(acceptedAt, config.retention_hours),
    }).eq("id", job.id).eq("status", "AWAITING_CONFIRMATION");
    if (updateError) { await service.storage.from(BUCKET).move(target, job.storage_path); fail(updateError); }
    return json(200, { status: "QUEUED", reference: job.public_reference, message: "Your document was sent to the front desk." });
  }

  if (method === "GET" && path === "/api/admin/session") {
    const { count, error } = await service.from("admin_profiles").select("user_id", { count: "exact", head: true }); fail(error);
    try { const context = await admin(req); return json(200, { setupRequired: false, authenticated: true, username: context.profile.username }); }
    catch { return json(200, { setupRequired: (count ?? 0) === 0, authenticated: false, username: null }); }
  }
  if (method === "POST" && path === "/api/admin/setup") {
    const { count, error: countError } = await service.from("admin_profiles").select("user_id", { count: "exact", head: true }); fail(countError);
    if ((count ?? 0) > 0) throw new ApiError(409, "SETUP_COMPLETE", "Initial setup is already complete.");
    const body = await readJson(req);
    const username = text(body.username, "Username", 50).toLowerCase();
    const password = text(body.password, "Password", 200);
    if (password.length < 12) throw new ApiError(400, "WEAK_PASSWORD", "Use at least 12 characters for the password.");
    if (password !== body.confirmPassword) throw new ApiError(400, "INVALID_INPUT", "Password confirmation does not match.");
    const email = `${username.replace(/[^a-z0-9._-]/g, "-")}@hotelprint.local`;
    const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } }); fail(createError);
    const { error: profileError } = await service.from("admin_profiles").insert({ user_id: created.user.id, username, email });
    if (profileError) { await service.auth.admin.deleteUser(created.user.id); fail(profileError); }
    const current = await settings();
    const { error: settingsError } = await service.from("hotel_settings").update({
      hotel_name: text(body.hotelName, "Hotel name", 100),
      free_page_limit: integer(body.freePageLimit, "Free-page limit", 0, 1000),
      price_per_page_minor: integer(body.pricePerPageMinor, "Price", 0, 1_000_000),
      currency: text(body.currency, "Currency", 3).toUpperCase(), updated_at: now(),
      max_upload_bytes: current.max_upload_bytes, max_page_count: current.max_page_count,
    }).eq("id", 1); fail(settingsError);
    const { data: signed, error: signError } = await publicAuth.auth.signInWithPassword({ email, password }); fail(signError);
    return json(201, { status: "READY", session: signed.session });
  }
  if (method === "POST" && path === "/api/admin/login") {
    const body = await readJson(req);
    const username = text(body.username, "Username", 50);
    const { data: profile, error } = await service.from("admin_profiles").select("*").ilike("username", username).maybeSingle(); fail(error);
    if (!profile) throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect username or password.");
    const { data: signed, error: signError } = await publicAuth.auth.signInWithPassword({ email: profile.email, password: String(body.password ?? "") });
    if (signError || !signed.session) throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect username or password.");
    await service.from("admin_profiles").update({ last_login_at: now() }).eq("user_id", profile.user_id);
    return json(200, { status: "SIGNED_IN", session: signed.session });
  }

  if (!path.startsWith("/api/admin/")) throw new ApiError(404, "NOT_FOUND", "Not found.");
  await admin(req);
  if (method === "POST" && path === "/api/admin/logout") return json(200, { status: "SIGNED_OUT" });
  if (method === "GET" && path === "/api/admin/dashboard") {
    const config = await settings();
    const { data: rows, error } = await service.from("print_jobs").select("total_minor").eq("status", "QUEUED"); fail(error);
    return json(200, { stats: { total: rows.length, free: rows.filter((row) => row.total_minor === 0).length, paymentRequired: rows.filter((row) => row.total_minor > 0).length }, settings: mapSettings(config), antivirus: { available: false, status: "DISABLED", message: "PDF validation enabled." } });
  }
  if (method === "GET" && path === "/api/admin/jobs") {
    const { data, error } = await service.from("print_jobs").select("*").eq("status", "QUEUED").order("created_at"); fail(error);
    return json(200, { jobs: data.map(mapJob) });
  }
  const fileMatch = path.match(/^\/api\/admin\/jobs\/([^/]+)\/file$/);
  if (method === "GET" && fileMatch) {
    const { data: job, error } = await service.from("print_jobs").select("*").eq("id", fileMatch[1]).maybeSingle(); fail(error);
    if (!job || !["QUEUED", "COMPLETED"].includes(job.status)) throw new ApiError(404, "JOB_NOT_FOUND", "Document not found.");
    const { data, error: downloadError } = await service.storage.from(BUCKET).download(job.storage_path); fail(downloadError);
    return new Response(data, { status: 200, headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(job.original_filename)}` } });
  }
  const completeMatch = path.match(/^\/api\/admin\/jobs\/([^/]+)\/complete$/);
  if (method === "POST" && completeMatch) {
    const { data: job, error } = await service.from("print_jobs").select("*").eq("id", completeMatch[1]).maybeSingle(); fail(error);
    if (!job || job.status !== "QUEUED") throw new ApiError(409, "INVALID_JOB_STATE", "Only queued jobs can be completed.");
    const config = await settings(); const completedAt = now();
    const { data: updated, error: updateError } = await service.from("print_jobs").update({ status: "COMPLETED", completed_at: completedAt, expires_at: addHours(completedAt, config.retention_hours) }).eq("id", job.id).select().single(); fail(updateError);
    return json(200, { job: mapJob(updated) });
  }
  const jobMatch = path.match(/^\/api\/admin\/jobs\/([^/]+)$/);
  if (method === "GET" && jobMatch) {
    const { data, error } = await service.from("print_jobs").select("*").eq("id", jobMatch[1]).maybeSingle(); fail(error);
    if (!data) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found."); return json(200, { job: mapJob(data) });
  }
  if (method === "DELETE" && jobMatch) {
    const { data: job, error } = await service.from("print_jobs").select("*").eq("id", jobMatch[1]).maybeSingle(); fail(error);
    if (!job || !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(job.status)) throw new ApiError(409, "INVALID_JOB_STATE", "This job cannot be removed yet.");
    await service.storage.from(BUCKET).remove([job.storage_path]);
    const { error: deleteError } = await service.from("print_jobs").delete().eq("id", job.id); fail(deleteError);
    return json(200, { status: "REMOVED" });
  }
  if (method === "GET" && path === "/api/admin/settings") return json(200, { settings: mapSettings(await settings()) });
  if (method === "PUT" && path === "/api/admin/settings") {
    const body = await readJson(req);
    const publicUrl = new URL(text(body.publicCustomerUrl, "Public customer URL", 500)).toString();
    const patch = {
      hotel_name: text(body.hotelName, "Hotel name", 100), free_page_limit: integer(body.freePageLimit, "Free-page limit", 0, 1000),
      price_per_page_minor: integer(body.pricePerPageMinor, "Price", 0, 1_000_000), currency: text(body.currency, "Currency", 3).toUpperCase(),
      max_upload_bytes: integer(body.maxUploadBytes, "Maximum upload size", 1024, 100 * 1024 * 1024), max_page_count: integer(body.maxPageCount, "Maximum pages", 1, 10_000),
      retention_hours: integer(body.retentionHours, "Retention", 1, 8760), confirmation_timeout_minutes: integer(body.confirmationTimeoutMinutes, "Confirmation timeout", 1, 1440),
      antivirus_required: false, public_customer_url: publicUrl, updated_at: now(),
    };
    const { data, error } = await service.from("hotel_settings").update(patch).eq("id", 1).select().single(); fail(error);
    return json(200, { settings: mapSettings(data) });
  }
  if (method === "GET" && path === "/api/admin/qr.svg") {
    const svg = await QRCode.toString((await settings()).public_customer_url, { type: "svg", errorCorrectionLevel: "M" });
    return new Response(svg, { status: 200, headers: { ...cors, "Content-Type": "image/svg+xml; charset=utf-8" } });
  }
  if (method === "GET" && path === "/api/admin/qr.png") {
    const dataUrl = await QRCode.toDataURL((await settings()).public_customer_url, { errorCorrectionLevel: "M", width: 512 });
    const binary = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
    return new Response(binary, { status: 200, headers: { ...cors, "Content-Type": "image/png" } });
  }
  throw new ApiError(404, "NOT_FOUND", "Not found.");
}

Deno.serve(async (req) => {
  try { return await handle(req); }
  catch (error) {
    if (error instanceof ApiError) return json(error.status, { error: { code: error.code, message: error.message } });
    console.error(error); return json(500, { error: { code: "INTERNAL_ERROR", message: "Something went wrong while processing the request." } });
  }
});
