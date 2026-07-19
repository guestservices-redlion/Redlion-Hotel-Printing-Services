import fs from "node:fs";
import path from "node:path";
export function createLogger(logsDir) {
    const logFile = path.join(logsDir, "hotel-print.log");
    const write = (level, message, details) => {
        const safeDetails = details ? JSON.stringify(details) : "";
        const line = `${new Date().toISOString()} ${level} ${message}${safeDetails ? ` ${safeDetails}` : ""}\n`;
        try {
            fs.appendFileSync(logFile, line, "utf8");
        }
        catch {
            // Console output remains available if disk logging fails.
        }
        if (level === "ERROR")
            console.error(message, details ?? "");
    };
    return {
        info: (message, details) => write("INFO", message, details),
        warn: (message, details) => write("WARN", message, details),
        error: (message, details) => write("ERROR", message, details),
    };
}
//# sourceMappingURL=logger.js.map