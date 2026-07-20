const form = document.querySelector("#setup-form");
const errorBox = document.querySelector("#setup-error");

fetch(hotelPrintApiUrl("/api/admin/session"))
  .then((response) => response.json())
  .then((status) => {
    if (!status.setupRequired) window.location.assign(hotelPrintPageUrl("admin-login.html"));
  })
  .catch(() => undefined);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  const button = form.querySelector("button");
  button.disabled = true;
  const price = Number(document.querySelector("#price-per-page").value);
  try {
    const pin = document.querySelector("#pin").value;
    const confirmPin = document.querySelector("#confirm-pin").value;
    if (!/^\d{4}$/.test(pin)) throw new Error("Use exactly 4 digits for the staff PIN.");
    if (pin !== confirmPin) throw new Error("PIN confirmation does not match.");
    const response = await fetch(hotelPrintApiUrl("/api/admin/setup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelName: document.querySelector("#hotel-name").value,
        username: document.querySelector("#username").value,
        pin,
        confirmPin,
        freePageLimit: Number(document.querySelector("#free-pages").value),
        pricePerPageMinor: Math.round(price * 100),
        currency: document.querySelector("#currency").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "Setup failed.");
    sessionStorage.setItem("hotelPrintSession", JSON.stringify(result.session));
    window.location.assign(hotelPrintPageUrl("admin-app.html#/queue"));
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
});
