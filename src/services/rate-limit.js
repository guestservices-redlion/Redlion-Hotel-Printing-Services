export class MemoryRateLimiter {
    limit;
    windowMs;
    blockMs;
    buckets = new Map();
    constructor(limit, windowMs, blockMs = windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.blockMs = blockMs;
    }
    check(key) {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + this.windowMs, blockedUntil: 0 };
            this.buckets.set(key, bucket);
        }
        if (now < bucket.blockedUntil)
            return false;
        bucket.count += 1;
        if (bucket.count > this.limit) {
            bucket.blockedUntil = now + this.blockMs;
            return false;
        }
        return true;
    }
}
//# sourceMappingURL=rate-limit.js.map