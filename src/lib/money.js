export function calculatePrice(totalPages, freePageLimit, pricePerPageMinor) {
    if (![totalPages, freePageLimit, pricePerPageMinor].every(Number.isSafeInteger)) {
        throw new TypeError("Page counts and price must be safe integers.");
    }
    if (totalPages < 0 || freePageLimit < 0 || pricePerPageMinor < 0) {
        throw new RangeError("Page counts and price cannot be negative.");
    }
    const chargeablePages = Math.max(totalPages - freePageLimit, 0);
    const totalMinor = chargeablePages * pricePerPageMinor;
    if (!Number.isSafeInteger(totalMinor))
        throw new RangeError("Calculated price is too large.");
    return { chargeablePages, totalMinor };
}
export function formatMoney(minor, currency) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(minor / 100);
}
//# sourceMappingURL=money.js.map