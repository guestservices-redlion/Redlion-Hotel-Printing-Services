import { nowIso } from "../lib/time.js";
export async function runCleanup(database, config, logger, documentStore) {
    await database.deleteExpiredSessions();
    const jobs = await database.listJobsForCleanup(nowIso());
    for (const job of jobs) {
        try {
            await documentStore.remove(job.storedFilename);
            await database.transition(job.id, "EXPIRED", { confirmationTokenHash: null });
            logger.info("Expired job cleaned.", { jobReference: job.publicReference });
        }
        catch (error) {
            logger.error("Failed to clean an expired job.", {
                jobReference: job.publicReference,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
}
//# sourceMappingURL=cleanup.js.map
