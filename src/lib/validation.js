export class ValidationError extends Error {
    code;
    status;
    constructor(message, code = "VALIDATION_ERROR", status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
export function normalizeRoomNumber(value) {
    if (typeof value !== "string")
        throw new ValidationError("Enter a room number.");
    const normalized = value.trim();
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .#-]{0,19}$/u.test(normalized)) {
        throw new ValidationError("Enter a valid room number using 1 to 20 characters.");
    }
    return normalized;
}
export function normalizeLastName(value) {
    if (typeof value !== "string")
        throw new ValidationError("Enter a last name.");
    const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
    if (normalized.length < 1 || normalized.length > 80) {
        throw new ValidationError("Enter a last name using 1 to 80 characters.");
    }
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(normalized)) {
        throw new ValidationError("Enter a valid last name.");
    }
    return normalized;
}
export function normalizeUsername(value) {
    if (typeof value !== "string")
        throw new ValidationError("Enter a username.");
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) {
        throw new ValidationError("Username must be 3 to 32 characters using letters, numbers, dots, dashes, or underscores.");
    }
    return normalized;
}
export function validatePassword(value) {
    if (typeof value !== "string" || value.length < 10 || value.length > 128) {
        throw new ValidationError("Password must contain 10 to 128 characters.");
    }
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        throw new ValidationError("Password must contain at least one letter and one number.");
    }
    return value;
}
export function integerInRange(value, label, minimum, maximum) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new ValidationError(`${label} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
}
export function currencyCode(value) {
    if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
        throw new ValidationError("Currency must be a three-letter code such as USD.");
    }
    const code = value.trim().toUpperCase();
    try {
        new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(0);
    }
    catch {
        throw new ValidationError("Enter a supported currency code.");
    }
    return code;
}
export function safeDisplayFilename(value) {
    const filename = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return filename.slice(0, 180) || "document.pdf";
}
//# sourceMappingURL=validation.js.map