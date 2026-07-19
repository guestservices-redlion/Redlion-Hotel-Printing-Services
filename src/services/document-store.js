import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { moveFileAtomic, quarantinedPath, queuedPath, removeFileIfPresent } from "./files.js";

export class DocumentStore {
    config;
    client;
    constructor(config) {
        this.config = config;
        this.client = config.supabaseUrl && config.supabaseSecretKey
            ? createClient(config.supabaseUrl, config.supabaseSecretKey, {
                auth: { persistSession: false, autoRefreshToken: false },
            })
            : null;
    }
    get cloud() { return Boolean(this.client); }
    async prepareUpload(data) {
        const filename = `${crypto.randomUUID()}.pdf.pending`;
        const scanPath = quarantinedPath(this.config.quarantineDir, filename);
        await fsp.writeFile(scanPath, data, { flag: "wx" });
        return { scanPath, storedFilename: this.cloud ? `quarantine/${filename}` : filename };
    }
    async commitQuarantine(storedFilename, scanPath) {
        if (!this.client) return;
        const data = await fsp.readFile(scanPath);
        const { error } = await this.client.storage.from(this.config.supabaseStorageBucket)
            .upload(storedFilename, data, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error(`Supabase Storage: ${error.message}`);
        await removeFileIfPresent(scanPath);
    }
    async queue(storedFilename) {
        const queuedFilename = `${crypto.randomUUID()}.pdf`;
        if (this.client) {
            const destination = `queue/${queuedFilename}`;
            const { error } = await this.client.storage.from(this.config.supabaseStorageBucket)
                .move(storedFilename, destination);
            if (error) throw new Error(`Supabase Storage: ${error.message}`);
            return destination;
        }
        await moveFileAtomic(
            quarantinedPath(this.config.quarantineDir, storedFilename),
            queuedPath(this.config.queueDir, queuedFilename),
        );
        return queuedFilename;
    }
    async restoreToQuarantine(queuedFilename, originalFilename) {
        if (this.client) {
            const { error } = await this.client.storage.from(this.config.supabaseStorageBucket)
                .move(queuedFilename, originalFilename);
            if (error) throw new Error(`Supabase Storage: ${error.message}`);
            return;
        }
        await moveFileAtomic(
            queuedPath(this.config.queueDir, queuedFilename),
            quarantinedPath(this.config.quarantineDir, originalFilename),
        );
    }
    async remove(storedFilename) {
        if (this.client) {
            const { error } = await this.client.storage.from(this.config.supabaseStorageBucket)
                .remove([storedFilename]);
            if (error) throw new Error(`Supabase Storage: ${error.message}`);
            return;
        }
        const base = storedFilename.endsWith(".pending") ? this.config.quarantineDir : this.config.queueDir;
        const resolved = storedFilename.endsWith(".pending")
            ? quarantinedPath(base, storedFilename)
            : queuedPath(base, storedFilename);
        await removeFileIfPresent(resolved);
    }
    async download(storedFilename) {
        if (this.client) {
            const { data, error } = await this.client.storage.from(this.config.supabaseStorageBucket)
                .download(storedFilename);
            if (error) throw new Error(`Supabase Storage: ${error.message}`);
            return Buffer.from(await data.arrayBuffer());
        }
        const filePath = queuedPath(this.config.queueDir, storedFilename);
        if (!fs.existsSync(filePath)) return null;
        return fsp.readFile(filePath);
    }
}
