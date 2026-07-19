export function nowIso() {
    return new Date().toISOString();
}
export function addMinutesIso(iso, minutes) {
    return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
export function addHoursIso(iso, hours) {
    return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}
export function isPast(iso, now = new Date()) {
    return Boolean(iso && new Date(iso).getTime() <= now.getTime());
}
//# sourceMappingURL=time.js.map