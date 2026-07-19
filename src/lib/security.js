import crypto from "node:crypto";
import path from "node:path";
function scryptAsync(password, salt, keyLength, options) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keyLength, options, (error, derivedKey) => {
            if (error)
                reject(error);
            else
                resolve(derivedKey);
        });
    });
}
export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}
export function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
export async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scryptAsync(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
    });
    return `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(password, encoded) {
    const [algorithm, n, r, p, saltText, keyText] = encoded.split("$");
    if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !keyText)
        return false;
    const expected = Buffer.from(keyText, "base64url");
    const actual = await scryptAsync(password, Buffer.from(saltText, "base64url"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export function safeResolveInside(baseDirectory, filename) {
    const base = path.resolve(baseDirectory);
    const resolved = path.resolve(base, filename);
    const relative = path.relative(base, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Resolved path is outside the allowed directory.");
    }
    return resolved;
}
//# sourceMappingURL=security.js.map