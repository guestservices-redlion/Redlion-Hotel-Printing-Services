const form = document.querySelector("#login-form");
const errorBox = document.querySelector("#login-error");

fetch(hotelPrintApiUrl("/api/admin/session"))
  .then((response) => response.json())
  .then((status) => {
    if (status.setupRequired) window.location.assign(hotelPrintPageUrl("admin-setup.html"));
  })
  .catch(() => undefined);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const pin = document.querySelector("#pin").value;
    if (!/^\d{4}$/.test(pin)) throw new Error("Enter your 4-digit staff PIN.");
    const response = await fetch(hotelPrintApiUrl("/api/admin/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.querySelector("#username").value,
        pin,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "Sign-in failed.");
    sessionStorage.setItem("hotelPrintSession", JSON.stringify(result.session));
    window.location.assign(hotelPrintPageUrl("admin-app.html#/queue"));
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
});
