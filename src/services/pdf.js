import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "../vendor/pdf-lib.esm.js";
import { ValidationError } from "../lib/validation.js";
export async function validateAndCountPdf(filePath, originalFilename, mimeType, maxPageCount) {
    if (path.extname(originalFilename).toLowerCase() !== ".pdf") {
        throw new ValidationError("Only PDF documents are accepted.", "INVALID_FILE_TYPE");
    }
    if (mimeType.toLowerCase() !== "application/pdf") {
        throw new ValidationError("The selected file is not identified as a PDF.", "INVALID_MIME_TYPE");
    }
    const bytes = await fs.readFile(filePath);
    if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new ValidationError("The selected file is not a genuine PDF.", "INVALID_PDF_SIGNATURE");
    }
    if (bytes.includes(Buffer.from("/Encrypt", "ascii"))) {
        throw new ValidationError("Password-protected or encrypted PDFs cannot be accepted.", "ENCRYPTED_PDF");
    }
    let pages;
    try {
        const pdf = await PDFDocument.load(bytes, {
            ignoreEncryption: false,
            updateMetadata: false,
            throwOnInvalidObject: true,
        });
        pages = pdf.getPageCount();
    }
    catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("encrypt")) {
            throw new ValidationError("Password-protected or encrypted PDFs cannot be accepted.", "ENCRYPTED_PDF");
        }
        throw new ValidationError("This PDF is damaged or cannot be processed.", "CORRUPTED_PDF");
    }
    if (pages < 1)
        throw new ValidationError("The PDF does not contain any pages.", "EMPTY_PDF");
    if (pages > maxPageCount) {
        throw new ValidationError(`The PDF exceeds the ${maxPageCount}-page limit.`, "TOO_MANY_PAGES");
    }
    return pages;
}
//# sourceMappingURL=pdf.js.map