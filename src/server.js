import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig, ensureDataDirectories } from "./config.js";
import { HotelDatabase } from "./database.js";
import { SupabaseHotelDatabase } from "./supabase-database.js";
import { createLogger } from "./lib/logger.js";
import { calculatePrice } from "./lib/money.js";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./lib/security.js";
import { addHoursIso, addMinutesIso, isPast, nowIso } from "./lib/time.js";
import { currencyCode, integerInRange, normalizeLastName, normalizeRoomNumber, normalizeUsername, safeDisplayFilename, validatePassword, ValidationError, } from "./lib/validation.js";
import { AntivirusService } from "./services/antivirus.js";
import { AuthService } from "./services/auth.js";
import { runCleanup } from "./services/cleanup.js";
import { moveFileAtomic, quarantinedPath, queuedPath, removeFileIfPresent, } from "./services/files.js";
import { validateAndCountPdf } from "./services/pdf.js";
import { qrPng, qrSvg } from "./services/qr.js";
import { MemoryRateLimiter } from "./services/rate-limit.js";
import { DocumentStore } from "./services/document-store.js";
const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};
function securityHeaders(response) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}
function sendJson(response, status, body) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}
function sendError(response, status, code, message) {
    sendJson(response, status, { error: { code, message } });
}
function redirect(response, location) {
    response.statusCode = 302;
    response.setHeader("Location", location);
    response.end();
}
async function sendFile(response, filePath, contentType) {
    const stat = await fsp.stat(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Length", stat.size);
    response.setHeader("Content-Type", contentType ?? MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream");
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on("error", reject);
        stream.on("end", resolve);
        stream.pipe(response);
    });
}
async function readBody(request, maximumBytes) {
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (contentLength > maximumBytes) {
        throw new ValidationError("The request is too large.", "REQUEST_TOO_LARGE", 413);
    }
    const chunks = [];
    let received = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > maximumBytes) {
            throw new ValidationError("The request is too large.", "REQUEST_TOO_LARGE", 413);
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
async function readJson(request, maximumBytes = 64 * 1024) {
    const body = await readBody(request, maximumBytes);
    if (!body.length)
        return {};
    try {
        const value = JSON.parse(body.toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error();
        return value;
    }
    catch {
        throw new ValidationError("The request body is invalid.", "INVALID_JSON");
    }
}
function parseMultipart(body, contentType) {
    const boundaryMatch = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]?.trim();
    if (!boundary) {
        throw new ValidationError("Upload a PDF using the document form.", "INVALID_MULTIPART");
    }
    const delimiter = Buffer.from(`--${boundary}`, "ascii");
    const fields = {};
    let file = null;
    let position = body.indexOf(delimiter);
    while (position >= 0) {
        position += delimiter.length;
        if (body.subarray(position, position + 2).toString("ascii") === "--")
            break;
        if (body.subarray(position, position + 2).toString("ascii") === "\r\n")
            position += 2;
        const next = body.indexOf(delimiter, position);
        if (next < 0)
            break;
        let end = next;
        if (body.subarray(end - 2, end).toString("ascii") === "\r\n")
            end -= 2;
        const part = body.subarray(position, end);
        const headerEnd = part.indexOf(Buffer.from("\r\n\r\n", "ascii"));
        if (headerEnd >= 0) {
            const headers = part.subarray(0, headerEnd).toString("utf8");
            const data = part.subarray(headerEnd + 4);
            const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
            if (disposition?.[1]) {
                const name = disposition[1];
                const filename = disposition[2];
                if (filename !== undefined && !file) {
                    const mimeType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ??
                        "application/octet-stream";
                    file = {
                        originalFilename: safeDisplayFilename(filename),
                        mimeType,
                        data: Buffer.from(data),
                    };
                }
                else if (filename === undefined) {
                    fields[name] = data.toString("utf8").slice(0, 4096);
                }
            }
        }
        position = next;
    }
    return { fields, file };
}
function routeParameter(pathname, expression) {
    const match = pathname.match(expression);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}
function requestIp(request) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string")
        return forwarded.split(",")[0]?.trim() ?? "unknown";
    return request.socket.remoteAddress ?? "unknown";
}
function publicReference() {
    return `HP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}
function publicJob(job) {
    return {
        id: job.id,
        reference: job.publicReference,
        roomNumber: job.roomNumber,
        lastName: job.lastName,
        originalFilename: job.originalFilename,
        fileSize: job.fileSize,
        pageCount: job.pageCount,
        freePageLimit: job.freePageLimitSnapshot,
        chargeablePages: job.chargeablePages,
        pricePerPageMinor: job.pricePerPageMinorSnapshot,
        currency: job.currencySnapshot,
        totalMinor: job.totalMinor,
        status: job.status,
        scanStatus: job.scanStatus,
        createdAt: job.createdAt,
        acceptedAt: job.acceptedAt,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
    };
}
function parseSettings(body, existing) {
    const hotelName = typeof body.hotelName === "string" ? body.hotelName.trim() : "";
    if (hotelName.length < 1 || hotelName.length > 100) {
        throw new ValidationError("Hotel name must contain 1 to 100 characters.");
    }
    const publicCustomerUrl = typeof body.publicCustomerUrl === "string" ? body.publicCustomerUrl.trim() : "";
    try {
        const url = new URL(publicCustomerUrl);
        if (!["http:", "https:"].includes(url.protocol))
            throw new Error();
    }
    catch {
        throw new ValidationError("Enter a valid customer website URL.");
    }
    return {
        hotelName,
        freePageLimit: integerInRange(body.freePageLimit, "Free-page limit", 0, 1000),
        pricePerPageMinor: integerInRange(body.pricePerPageMinor, "Price per extra page", 0, 1_000_000),
        currency: currencyCode(body.currency),
        maxUploadBytes: integerInRange(body.maxUploadBytes, "Maximum upload size", 1024, 100 * 1024 * 1024),
        maxPageCount: integerInRange(body.maxPageCount, "Maximum page count", 1, 10_000),
        retentionHours: integerInRange(body.retentionHours, "Retention period", 1, 8760),
        confirmationTimeoutMinutes: integerInRange(body.confirmationTimeoutMinutes, "Confirmation timeout", 1, 1440),
        antivirusRequired: body.antivirusRequired === true,
        publicCustomerUrl,
    };
}
export function createHotelServer(overrides = {}) {
    const config = createConfig(overrides);
    ensureDataDirectories(config);
    const logger = createLogger(config.logsDir);
    const database = config.supabaseUrl && config.supabaseSecretKey
        ? new SupabaseHotelDatabase(config.supabaseUrl, config.supabaseSecretKey)
        : new HotelDatabase(config.databasePath);
    const antivirus = new AntivirusService(config, logger);
    const documentStore = new DocumentStore(config);
    const auth = new AuthService(database, config);
    const loginLimiter = new MemoryRateLimiter(5, 15 * 60_000, 15 * 60_000);
    const uploadLimiter = new MemoryRateLimiter(20, 15 * 60_000, 15 * 60_000);
    const confirmationLocks = new Set();
    async function requireAdmin(request, response, csrf = false) {
        const context = await auth.authenticate(request);
        if (!context) {
            sendError(response, 401, "UNAUTHORIZED", "Sign in required.");
            return null;
        }
        if (csrf && request.headers["x-csrf-token"] !== context.session.csrfToken) {
            sendError(response, 403, "INVALID_CSRF_TOKEN", "Your session must be refreshed.");
            return null;
        }
        return context;
    }
    async function handleApi(request, response, url) {
        const { pathname } = url;
        const method = request.method ?? "GET";
        if (method === "GET" && pathname === "/api/health") {
            sendJson(response, 200, { status: "ok", backend: database.kind ?? "sqlite" });
            return true;
        }
        if (method === "GET" && pathname === "/api/customer/config") {
            const settings = await database.getSettings();
            sendJson(response, 200, {
                hotelName: settings.hotelName,
                maxUploadBytes: settings.maxUploadBytes,
                maxPageCount: settings.maxPageCount,
                acceptedTypes: ["application/pdf"],
            });
            return true;
        }
        if (method === "POST" && pathname === "/api/customer/upload") {
            if (!uploadLimiter.check(requestIp(request))) {
                sendError(response, 429, "RATE_LIMITED", "Please wait before uploading again.");
                return true;
            }
            const settings = await database.getSettings();
            const body = await readBody(request, settings.maxUploadBytes + 128 * 1024);
            const upload = parseMultipart(body, request.headers["content-type"]);
            if (!upload.file)
                throw new ValidationError("Select a PDF document.", "MISSING_FILE");
            if (upload.file.data.length === 0) {
                throw new ValidationError("The selected file is empty.", "EMPTY_FILE");
            }
            if (upload.file.data.length > settings.maxUploadBytes) {
                throw new ValidationError(`The document exceeds the ${Math.floor(settings.maxUploadBytes / 1_048_576)} MB limit.`, "FILE_TOO_LARGE", 413);
            }
            const roomNumber = normalizeRoomNumber(upload.fields.roomNumber);
            const lastName = normalizeLastName(upload.fields.lastName);
            const staged = await documentStore.prepareUpload(upload.file.data);
            const storedFilename = staged.storedFilename;
            const temporaryPath = staged.scanPath;
            const token = randomToken();
            const createdAt = nowIso();
            const job = await database.createQuarantinedJob({
                publicReference: publicReference(),
                confirmationTokenHash: hashToken(token),
                roomNumber,
                lastName,
                originalFilename: upload.file.originalFilename,
                storedFilename,
                mimeType: upload.file.mimeType,
                fileSize: upload.file.data.length,
                createdAt,
            });
            try {
                const scan = await antivirus.scan(temporaryPath, settings.antivirusRequired);
                if (!["CLEAN", "BYPASSED_UNSAFE"].includes(scan.status)) {
                    await database.markRejected(job.id, scan.status);
                    await removeFileIfPresent(temporaryPath);
                    if (scan.status === "INFECTED") {
                        throw new ValidationError("This document could not be accepted because it failed the security check.", "UNSAFE_FILE");
                    }
                    if (scan.status === "UNAVAILABLE") {
                        throw new ValidationError("Document scanning is temporarily unavailable. Please contact the front desk.", "ANTIVIRUS_UNAVAILABLE", 503);
                    }
                    throw new ValidationError("The document security scan could not be completed. Please try again.", "ANTIVIRUS_ERROR", 503);
                }
                const pageCount = await validateAndCountPdf(temporaryPath, upload.file.originalFilename, upload.file.mimeType, settings.maxPageCount);
                const price = calculatePrice(pageCount, settings.freePageLimit, settings.pricePerPageMinor);
                const pending = await database.markAwaitingConfirmation({
                    id: job.id,
                    scanStatus: scan.status,
                    pageCount,
                    freePageLimit: settings.freePageLimit,
                    chargeablePages: price.chargeablePages,
                    pricePerPageMinor: settings.pricePerPageMinor,
                    currency: settings.currency,
                    totalMinor: price.totalMinor,
                    scanCompletedAt: nowIso(),
                    confirmationExpiresAt: addMinutesIso(createdAt, settings.confirmationTimeoutMinutes),
                });
                await documentStore.commitQuarantine(storedFilename, temporaryPath);
                sendJson(response, 201, {
                    job: {
                        reference: pending.publicReference,
                        confirmationToken: token,
                        pageCount,
                        freePageLimit: settings.freePageLimit,
                        chargeablePages: price.chargeablePages,
                        pricePerPageMinor: settings.pricePerPageMinor,
                        currency: settings.currency,
                        totalMinor: price.totalMinor,
                        confirmationExpiresAt: pending.confirmationExpiresAt,
                        scanStatus: pending.scanStatus,
                    },
                });
            }
            catch (error) {
                const current = await database.getJobById(job.id);
                if (current?.status === "QUARANTINED")
                    await database.markRejected(job.id, current.scanStatus);
                await removeFileIfPresent(temporaryPath).catch(() => undefined);
                await documentStore.remove(storedFilename).catch(() => undefined);
                throw error;
            }
            return true;
        }
        const confirmationReference = routeParameter(pathname, /^\/api\/customer\/jobs\/([^/]+)\/(confirm|cancel)$/);
        const confirmationAction = pathname.match(/^\/api\/customer\/jobs\/[^/]+\/(confirm|cancel)$/)?.[1];
        if (method === "POST" &&
            confirmationReference &&
            (confirmationAction === "confirm" || confirmationAction === "cancel")) {
            const body = await readJson(request);
            const token = typeof body.token === "string" ? body.token : "";
            const job = await database.getJobByReference(confirmationReference);
            if (!job || !job.confirmationTokenHash || hashToken(token) !== job.confirmationTokenHash) {
                sendError(response, 404, "JOB_NOT_FOUND", "Submission not found.");
                return true;
            }
            if (job.status !== "AWAITING_CONFIRMATION") {
                sendError(response, 409, "INVALID_JOB_STATE", "This submission was already handled.");
                return true;
            }
            if (isPast(job.confirmationExpiresAt)) {
                await documentStore.remove(job.storedFilename);
                await database.transition(job.id, "EXPIRED", { confirmationTokenHash: null });
                sendError(response, 410, "CONFIRMATION_EXPIRED", "This confirmation has expired.");
                return true;
            }
            if (confirmationLocks.has(job.id)) {
                sendError(response, 409, "JOB_BUSY", "This submission is already being processed.");
                return true;
            }
            confirmationLocks.add(job.id);
            try {
                if (confirmationAction === "cancel") {
                    await documentStore.remove(job.storedFilename);
                    await database.transition(job.id, "CANCELLED", { confirmationTokenHash: null });
                    sendJson(response, 200, { status: "CANCELLED" });
                    return true;
                }
                const queuedFilename = await documentStore.queue(job.storedFilename);
                try {
                    const acceptedAt = nowIso();
                    const currentSettings = await database.getSettings();
                    const queued = await database.transition(job.id, "QUEUED", {
                        storedFilename: queuedFilename,
                        confirmationTokenHash: null,
                        acceptedAt,
                        expiresAt: addHoursIso(acceptedAt, currentSettings.retentionHours),
                    });
                    sendJson(response, 200, {
                        status: "QUEUED",
                        reference: queued.publicReference,
                        message: "Your document was sent to the front desk.",
                    });
                }
                catch (error) {
                    await documentStore.restoreToQuarantine(queuedFilename, job.storedFilename).catch(() => undefined);
                    throw error;
                }
            }
            finally {
                confirmationLocks.delete(job.id);
            }
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/session") {
            const context = await auth.authenticate(request);
            sendJson(response, 200, {
                setupRequired: await database.countAdmins() === 0,
                authenticated: Boolean(context),
                username: context?.user.username ?? null,
                csrfToken: context?.session.csrfToken ?? null,
            });
            return true;
        }
        if (method === "POST" && pathname === "/api/admin/setup") {
            if (await database.countAdmins() > 0) {
                sendError(response, 409, "SETUP_COMPLETE", "Initial setup is already complete.");
                return true;
            }
            const body = await readJson(request);
            const username = normalizeUsername(body.username);
            const password = validatePassword(body.password);
            if (password !== body.confirmPassword) {
                throw new ValidationError("Password confirmation does not match.");
            }
            const existing = await database.getSettings();
            const initialBody = {
                ...existing,
                ...body,
                maxUploadBytes: existing.maxUploadBytes,
                maxPageCount: existing.maxPageCount,
                retentionHours: existing.retentionHours,
                confirmationTimeoutMinutes: existing.confirmationTimeoutMinutes,
                antivirusRequired: existing.antivirusRequired,
                publicCustomerUrl: existing.publicCustomerUrl,
            };
            const settings = parseSettings(initialBody, existing);
            const passwordHash = await hashPassword(password);
            let userId = "";
            try {
                const user = await database.createAdmin(username, passwordHash);
                userId = user.id;
                await database.updateSettings(settings);
            }
            catch (error) {
                throw error;
            }
            const createdSession = await auth.createSession(userId);
            auth.setCookie(response, createdSession.token);
            sendJson(response, 201, {
                status: "READY",
                csrfToken: createdSession.session.csrfToken,
            });
            return true;
        }
        if (method === "POST" && pathname === "/api/admin/login") {
            const body = await readJson(request);
            const username = normalizeUsername(body.username);
            const rateKey = `${requestIp(request)}:${username}`;
            if (!loginLimiter.check(rateKey)) {
                sendError(response, 429, "RATE_LIMITED", "Please wait before trying again.");
                return true;
            }
            const password = typeof body.password === "string" ? body.password : "";
            const user = await database.getAdminByUsername(username);
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                sendError(response, 401, "INVALID_CREDENTIALS", "Incorrect username or password.");
                return true;
            }
            await database.updateAdminLastLogin(user.id);
            const createdSession = await auth.createSession(user.id);
            auth.setCookie(response, createdSession.token);
            sendJson(response, 200, {
                status: "SIGNED_IN",
                csrfToken: createdSession.session.csrfToken,
            });
            return true;
        }
        if (!pathname.startsWith("/api/admin/"))
            return false;
        const admin = await requireAdmin(request, response, method !== "GET" && method !== "HEAD");
        if (!admin)
            return true;
        if (method === "POST" && pathname === "/api/admin/logout") {
            await database.deleteSession(hashToken(admin.rawToken));
            auth.clearCookie(response);
            sendJson(response, 200, { status: "SIGNED_OUT" });
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/dashboard") {
            const settings = await database.getSettings();
            const scanner = await antivirus.availability();
            sendJson(response, 200, {
                stats: await database.getQueueStats(),
                settings,
                antivirus: {
                    available: scanner.available,
                    status: scanner.status,
                    message: scanner.message,
                    unsafeBypassEnabled: config.allowUnsafeAntivirusBypass,
                },
            });
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/jobs") {
            sendJson(response, 200, { jobs: (await database.listQueuedJobs()).map(publicJob) });
            return true;
        }
        const jobFileId = routeParameter(pathname, /^\/api\/admin\/jobs\/([^/]+)\/file$/);
        if (method === "GET" && jobFileId) {
            const job = await database.getJobById(jobFileId);
            if (!job || !["QUEUED", "COMPLETED"].includes(job.status)) {
                sendError(response, 404, "JOB_NOT_FOUND", "Document not found.");
                return true;
            }
            const file = await documentStore.download(job.storedFilename).catch(() => null);
            if (!file) {
                sendError(response, 404, "FILE_NOT_FOUND", "Document file is unavailable.");
                return true;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Disposition", `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(job.originalFilename)}`);
            response.setHeader("Content-Length", file.length);
            response.end(file);
            return true;
        }
        const completeJobId = routeParameter(pathname, /^\/api\/admin\/jobs\/([^/]+)\/complete$/);
        if (method === "POST" && completeJobId) {
            await readJson(request);
            const job = await database.getJobById(completeJobId);
            if (!job || job.status !== "QUEUED") {
                sendError(response, 409, "INVALID_JOB_STATE", "Only queued jobs can be completed.");
                return true;
            }
            const current = nowIso();
            const settings = await database.getSettings();
            const completed = await database.transition(job.id, "COMPLETED", {
                completedAt: current,
                expiresAt: addHoursIso(current, settings.retentionHours),
            });
            sendJson(response, 200, { job: publicJob(completed) });
            return true;
        }
        const jobId = routeParameter(pathname, /^\/api\/admin\/jobs\/([^/]+)$/);
        if (method === "GET" && jobId) {
            const job = await database.getJobById(jobId);
            if (!job || !["QUEUED", "COMPLETED"].includes(job.status)) {
                sendError(response, 404, "JOB_NOT_FOUND", "Job not found.");
                return true;
            }
            sendJson(response, 200, { job: publicJob(job) });
            return true;
        }
        if (method === "DELETE" && jobId) {
            const job = await database.getJobById(jobId);
            if (!job || !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(job.status)) {
                sendError(response, 409, "INVALID_JOB_STATE", "This job cannot be removed yet.");
                return true;
            }
            if (job.status === "COMPLETED") {
                await documentStore.remove(job.storedFilename);
            }
            await database.deleteJob(job.id);
            sendJson(response, 200, { status: "REMOVED" });
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/settings") {
            sendJson(response, 200, { settings: await database.getSettings() });
            return true;
        }
        if (method === "PUT" && pathname === "/api/admin/settings") {
            const body = await readJson(request);
            const current = await database.getSettings();
            sendJson(response, 200, {
                settings: await database.updateSettings(parseSettings(body, current)),
            });
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/qr.svg") {
            const svg = qrSvg((await database.getSettings()).publicCustomerUrl);
            response.statusCode = 200;
            response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
            if (url.searchParams.get("download") === "1") {
                response.setHeader("Content-Disposition", 'attachment; filename="hotel-print-qr.svg"');
            }
            response.end(svg);
            return true;
        }
        if (method === "GET" && pathname === "/api/admin/qr.png") {
            const png = qrPng((await database.getSettings()).publicCustomerUrl);
            response.statusCode = 200;
            response.setHeader("Content-Type", "image/png");
            if (url.searchParams.get("download") === "1") {
                response.setHeader("Content-Disposition", 'attachment; filename="hotel-print-qr.png"');
            }
            response.end(png);
            return true;
        }
        sendError(response, 404, "NOT_FOUND", "Not found.");
        return true;
    }
    async function requestHandler(request, response) {
        securityHeaders(response);
        const url = new URL(request.url ?? "/", "http://localhost");
        try {
            if (url.pathname.startsWith("/api/")) {
                const handled = await handleApi(request, response, url);
                if (!handled)
                    sendError(response, 404, "NOT_FOUND", "Not found.");
                return;
            }
            if (request.method !== "GET" && request.method !== "HEAD") {
                response.statusCode = 405;
                response.end("Method not allowed");
                return;
            }
            if (url.pathname.startsWith("/assets/")) {
                const relative = decodeURIComponent(url.pathname.slice("/assets/".length));
                const base = path.resolve(config.publicDir, "assets");
                const resolved = path.resolve(base, relative);
                if (path.relative(base, resolved).startsWith("..") || !fs.existsSync(resolved)) {
                    response.statusCode = 404;
                    response.end("Not found");
                    return;
                }
                await sendFile(response, resolved);
                return;
            }
            if (url.pathname === "/") {
                await sendFile(response, path.join(config.publicDir, "customer.html"));
                return;
            }
            if (url.pathname === "/admin") {
                if (await database.countAdmins() === 0)
                    return redirect(response, "/admin/setup");
                if (!await auth.authenticate(request))
                    return redirect(response, "/admin/login");
                return redirect(response, "/admin/queue");
            }
            if (url.pathname === "/admin/setup") {
                if (await database.countAdmins() > 0) {
                    return redirect(response, await auth.authenticate(request) ? "/admin/queue" : "/admin/login");
                }
                await sendFile(response, path.join(config.publicDir, "admin-setup.html"));
                return;
            }
            if (url.pathname === "/admin/login") {
                if (await database.countAdmins() === 0)
                    return redirect(response, "/admin/setup");
                if (await auth.authenticate(request))
                    return redirect(response, "/admin/queue");
                await sendFile(response, path.join(config.publicDir, "admin-login.html"));
                return;
            }
            if (["/admin/queue", "/admin/settings", "/admin/qr-code"].includes(url.pathname) ||
                /^\/admin\/jobs\/[^/]+$/.test(url.pathname)) {
                if (!await auth.authenticate(request))
                    return redirect(response, "/admin/login");
                await sendFile(response, path.join(config.publicDir, "admin-app.html"));
                return;
            }
            response.statusCode = 404;
            await sendFile(response, path.join(config.publicDir, "not-found.html"));
        }
        catch (error) {
            if (response.headersSent) {
                response.destroy();
                return;
            }
            if (error instanceof ValidationError) {
                sendError(response, error.status, error.code, error.message);
                return;
            }
            logger.error("Unhandled request error.", {
                error: error instanceof Error ? error.message : "Unknown error",
            });
            sendError(response, 500, "INTERNAL_ERROR", "Something went wrong while processing the request.");
        }
    }
    const server = http.createServer((request, response) => {
        void requestHandler(request, response);
    });
    return {
        server,
        config,
        database,
        logger,
        antivirus,
        documentStore,
        close: async () => {
            if (server.listening) {
                await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
            }
            database.close();
        },
    };
}
async function start() {
    const context = createHotelServer();
    await runCleanup(context.database, context.config, context.logger, context.documentStore);
    const cleanupTimer = setInterval(() => void runCleanup(context.database, context.config, context.logger, context.documentStore), context.config.cleanupIntervalMinutes * 60_000);
    cleanupTimer.unref();
    context.server.listen(context.config.port, context.config.host, () => {
        console.log(`Hotel Print customer site: http://${context.config.host}:${context.config.port}/`);
        console.log(`Hotel Print front desk:   http://${context.config.host}:${context.config.port}/admin`);
    });
    const shutdown = () => {
        clearInterval(cleanupTimer);
        void context.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await start();
}
//# sourceMappingURL=server.js.map
