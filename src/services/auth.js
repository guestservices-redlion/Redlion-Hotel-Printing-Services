import { hashToken, randomToken } from "../lib/security.js";
import { addHoursIso, isPast, nowIso } from "../lib/time.js";
const COOKIE_NAME = "hotelprint_session";
function parseCookies(header) {
    const cookies = {};
    if (!header)
        return cookies;
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index < 1)
            continue;
        try {
            cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
        }
        catch {
            // Ignore malformed cookie values.
        }
    }
    return cookies;
}
export class AuthService {
    database;
    config;
    constructor(database, config) {
        this.database = database;
        this.config = config;
    }
    async createSession(userId) {
        const token = randomToken();
        const current = nowIso();
        const session = {
            idHash: hashToken(token),
            userId,
            csrfToken: randomToken(24),
            expiresAt: addHoursIso(current, this.config.sessionHours),
            createdAt: current,
        };
        await this.database.createSession(session);
        return { token, session };
    }
    async authenticate(request) {
        const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
        if (!token)
            return null;
        const session = await this.database.getSession(hashToken(token));
        if (!session || isPast(session.expiresAt)) {
            if (session)
                await this.database.deleteSession(session.idHash);
            return null;
        }
        const user = await this.database.getAdminById(session.userId);
        if (!user) {
            await this.database.deleteSession(session.idHash);
            return null;
        }
        return { user, session, rawToken: token };
    }
    setCookie(response, token) {
        const parts = [
            `${COOKIE_NAME}=${encodeURIComponent(token)}`,
            "HttpOnly",
            "SameSite=Strict",
            "Path=/",
            `Max-Age=${this.config.sessionHours * 3600}`,
        ];
        if (this.config.cookieSecure)
            parts.push("Secure");
        response.setHeader("Set-Cookie", parts.join("; "));
    }
    clearCookie(response) {
        const parts = [
            `${COOKIE_NAME}=`,
            "HttpOnly",
            "SameSite=Strict",
            "Path=/",
            "Max-Age=0",
        ];
        if (this.config.cookieSecure)
            parts.push("Secure");
        response.setHeader("Set-Cookie", parts.join("; "));
    }
}
//# sourceMappingURL=auth.js.map
