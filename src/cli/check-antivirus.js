import { createConfig, ensureDataDirectories } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { AntivirusService } from "../services/antivirus.js";
const config = createConfig();
ensureDataDirectories(config);
const scanner = new AntivirusService(config, createLogger(config.logsDir));
const status = await scanner.availability();
console.log(status.message);
process.exitCode = status.available ? 0 : 1;
//# sourceMappingURL=check-antivirus.js.map