import fs from "node:fs";
import path from "node:path";
function parseDotEnv(filePath) {
    if (!fs.existsSync(filePath))
        return;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#"))
            continue;
        const index = line.indexOf("=");
        if (index < 1)
            continue;
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined)
            process.env[key] = value;
    }
}
function integer(name, fallback, min, max) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
function boolean(name, fallback) {
    const raw = process.env[name]?.toLowerCase();
    if (raw === "true")
        return true;
    if (raw === "false")
        return false;
    return fallback;
}
export function createConfig(overrides = {}) {
    const rootDir = overrides.rootDir ?? process.cwd();
    parseDotEnv(path.join(rootDir, ".env"));
    const dataDir = path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? path.join(rootDir, "data"));
    const antivirusModeRaw = process.env.ANTIVIRUS_MODE ?? "normal";
    const antivirusMode = [
        "normal",
        "mock-clean",
        "mock-infected",
        "mock-error",
        "mock-timeout",
    ].includes(antivirusModeRaw)
        ? antivirusModeRaw
        : "normal";
    return {
        rootDir,
        publicDir: path.resolve(overrides.publicDir ?? path.join(rootDir, "public")),
        dataDir,
        quarantineDir: path.join(dataDir, "quarantine"),
        queueDir: path.join(dataDir, "queue"),
        databaseDir: path.join(dataDir, "database"),
        logsDir: path.join(dataDir, "logs"),
        backupsDir: path.join(dataDir, "backups"),
        databasePath: path.join(dataDir, "database", "hotel-print.sqlite"),
        port: overrides.port ?? integer("PORT", 3000, 1, 65535),
        host: overrides.host ?? process.env.HOST ?? "127.0.0.1",
        cookieSecure: overrides.cookieSecure ?? boolean("COOKIE_SECURE", false),
        sessionHours: overrides.sessionHours ?? integer("SESSION_HOURS", 8, 1, 168),
        cleanupIntervalMinutes: overrides.cleanupIntervalMinutes ?? integer("CLEANUP_INTERVAL_MINUTES", 15, 1, 1440),
        clamScanPath: overrides.clamScanPath ?? process.env.CLAMSCAN_PATH ?? "clamscan",
        clamScanTimeoutMs: overrides.clamScanTimeoutMs ?? integer("CLAMSCAN_TIMEOUT_MS", 30000, 1000, 300000),
        allowUnsafeAntivirusBypass: overrides.allowUnsafeAntivirusBypass ??
            boolean("ALLOW_UNSAFE_ANTIVIRUS_BYPASS", false),
        antivirusMode: overrides.antivirusMode ?? antivirusMode,
        isTest: overrides.isTest ?? process.env.NODE_ENV === "test",
        supabaseUrl: overrides.supabaseUrl ?? process.env.SUPABASE_URL ?? "",
        supabaseSecretKey: overrides.supabaseSecretKey ?? process.env.SUPABASE_SECRET_KEY ?? "",
        supabaseStorageBucket: overrides.supabaseStorageBucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? "guest-documents",
    };
}
export function ensureDataDirectories(config) {
    for (const directory of [
        config.dataDir,
        config.quarantineDir,
        config.queueDir,
        config.databaseDir,
        config.logsDir,
        config.backupsDir,
    ]) {
        fs.mkdirSync(directory, { recursive: true });
    }
}
//# sourceMappingURL=config.js.map
