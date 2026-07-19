import { spawn } from "node:child_process";
function runProcess(command, args, timeoutMs) {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const child = spawn(command, args, { windowsHide: true, shell: false });
        const timer = setTimeout(() => {
            child.kill();
            if (!settled) {
                settled = true;
                resolve({ code: null, stdout, stderr, timedOut: true });
            }
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout = `${stdout}${String(chunk)}`.slice(-8000);
        });
        child.stderr.on("data", (chunk) => {
            stderr = `${stderr}${String(chunk)}`.slice(-8000);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                resolve({ code: null, stdout, stderr: error.message, timedOut: false });
            }
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                resolve({ code, stdout, stderr, timedOut: false });
            }
        });
    });
}
export class AntivirusService {
    config;
    logger;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async availability() {
        if (this.config.antivirusMode.startsWith("mock-")) {
            return { status: "CLEAN", available: true, message: "Mock scanner enabled." };
        }
        const result = await runProcess(this.config.clamScanPath, ["--version"], Math.min(this.config.clamScanTimeoutMs, 5000));
        if (result.code === 0) {
            return {
                status: "CLEAN",
                available: true,
                message: result.stdout.trim().split(/\r?\n/)[0] ?? "ClamAV available.",
            };
        }
        return {
            status: "UNAVAILABLE",
            available: false,
            message: "ClamAV is not available.",
        };
    }
    async scan(filePath, required) {
        switch (this.config.antivirusMode) {
            case "mock-clean":
                return { status: "CLEAN", available: true, message: "Clean." };
            case "mock-infected":
                return { status: "INFECTED", available: true, message: "Threat detected." };
            case "mock-error":
                return { status: "ERROR", available: true, message: "Scanner error." };
            case "mock-timeout":
                return { status: "ERROR", available: true, message: "Scanner timed out." };
        }
        const available = await this.availability();
        if (!available.available) {
            if (!required && this.config.allowUnsafeAntivirusBypass) {
                this.logger.warn("Antivirus scan bypassed by explicit configuration.");
                return {
                    status: "BYPASSED_UNSAFE",
                    available: false,
                    message: "Antivirus bypassed by administrator configuration.",
                };
            }
            return available;
        }
        const result = await runProcess(this.config.clamScanPath, ["--no-summary", "--infected", filePath], this.config.clamScanTimeoutMs);
        if (result.timedOut) {
            this.logger.warn("Antivirus scan timed out.");
            return { status: "ERROR", available: true, message: "Antivirus scan timed out." };
        }
        if (result.code === 0)
            return { status: "CLEAN", available: true, message: "Clean." };
        if (result.code === 1) {
            this.logger.warn("Antivirus detected an unsafe upload.");
            return { status: "INFECTED", available: true, message: "Threat detected." };
        }
        this.logger.warn("Antivirus scan failed.", { exitCode: result.code });
        return { status: "ERROR", available: true, message: "Antivirus scan failed." };
    }
}
//# sourceMappingURL=antivirus.js.map