import fs from "node:fs/promises";
import path from "node:path";
import { safeResolveInside } from "../lib/security.js";
export async function removeFileIfPresent(filePath) {
    try {
        await fs.unlink(filePath);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
}
export async function moveFileAtomic(source, destination) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
        await fs.rename(source, destination);
    }
    catch (error) {
        const code = error.code;
        if (code !== "EXDEV")
            throw error;
        await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
        await fs.unlink(source);
    }
}
export function quarantinedPath(directory, storedFilename) {
    return safeResolveInside(directory, storedFilename);
}
export function queuedPath(directory, storedFilename) {
    return safeResolveInside(directory, storedFilename);
}
//# sourceMappingURL=files.js.map