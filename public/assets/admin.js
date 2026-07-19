const content = document.querySelector("#admin-content");
const sidebar = document.querySelector(".sidebar");
let session = null;
let pollTimer = null;

function htmlEscape(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function money(minor, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    Number(minor ?? 0) / 100,
  );
}

function dateTime(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (session?.csrfToken && options.method && options.method !== "GET") {
    headers.set("x-csrf-token", session.csrfToken);
  }
  const response = await fetch(url, { ...options, headers });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : null;
  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Sign in required.");
  }
  if (!response.ok) throw new Error(body?.error?.message ?? "The request failed.");
  return body;
}

function activeSection() {
  if (location.pathname.startsWith("/admin/settings")) return "settings";
  if (location.pathname.startsWith("/admin/qr-code")) return "qr-code";
  if (location.pathname.startsWith("/admin/jobs/")) return "job";
  return "queue";
}

function markNavigation() {
  const section = activeSection();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === section || (section === "job" && link.dataset.nav === "queue"));
  });
}

async function loadQueue() {
  const [dashboard, jobsResult] = await Promise.all([
    api("/api/admin/dashboard"),
    api("/api/admin/jobs"),
  ]);
  const { stats, settings, antivirus } = dashboard;
  const warning = !antivirus.available || antivirus.status === "BYPASSED_UNSAFE"
    ? `<div class="alert warning"><strong>Antivirus attention required.</strong> ${htmlEscape(antivirus.message)} Clean files should not be accepted for hotel use until scanning is available.</div>`
    : "";
  const rows = jobsResult.jobs.length
    ? jobsResult.jobs.map((job) => `
      <tr>
        <td><a class="job-link" href="/admin/jobs/${encodeURIComponent(job.id)}">${htmlEscape(job.reference)}</a><small>${htmlEscape(job.originalFilename)}</small></td>
        <td><strong>${htmlEscape(job.roomNumber)}</strong><small>${htmlEscape(job.lastName)}</small></td>
        <td>${job.pageCount}<small>${job.chargeablePages} charged</small></td>
        <td><span class="status-pill ${job.totalMinor > 0 ? "paid" : "free"}">${job.totalMinor > 0 ? "Payment required" : "Free"}</span><small>${money(job.totalMinor, job.currency)}</small></td>
        <td>${dateTime(job.acceptedAt)}</td>
        <td class="actions">
          <a class="button compact secondary" target="_blank" rel="noopener" href="/api/admin/jobs/${encodeURIComponent(job.id)}/file">Open PDF</a>
          <button class="button compact primary" data-complete="${htmlEscape(job.id)}">Complete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="6"><div class="empty-state"><div>✓</div><h3>No documents are waiting</h3><p>Accepted guest uploads will appear here automatically.</p></div></td></tr>`;
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Front desk</p><h1>Print queue</h1><p>Accepted, checked documents waiting for staff.</p></div><div class="live-badge"><span></span>Updates automatically</div></div>
    ${warning}
    <section class="stat-grid">
      <article class="stat-card"><span>Waiting</span><strong>${stats.total}</strong><small>active documents</small></article>
      <article class="stat-card"><span>Free jobs</span><strong>${stats.free}</strong><small>within ${settings.freePageLimit} free pages</small></article>
      <article class="stat-card"><span>Payment jobs</span><strong>${stats.paymentRequired}</strong><small>${money(settings.pricePerPageMinor, settings.currency)} per extra page</small></article>
      <article class="stat-card"><span>File scanner</span><strong class="scanner-word ${antivirus.available ? "good" : "bad"}">${antivirus.available ? "Ready" : "Attention"}</strong><small>${htmlEscape(antivirus.message)}</small></article>
    </section>
    <section class="card table-card">
      <div class="section-heading"><div><h2>Waiting documents</h2><p>Verify the guest, collect any payment, then open and print.</p></div><button id="refresh-button" class="button secondary compact">Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>Job</th><th>Guest</th><th>Pages</th><th>Charge</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  document.querySelector("#refresh-button")?.addEventListener("click", loadQueue);
  document.querySelectorAll("[data-complete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Mark this document complete and remove it from the active queue?")) return;
      button.disabled = true;
      try {
        await api(`/api/admin/jobs/${button.dataset.complete}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        await loadQueue();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}

async function loadSettings() {
  const { settings } = await api("/api/admin/settings");
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Configuration</p><h1>Printing settings</h1><p>Changes apply to new uploads only. Accepted jobs keep their original price.</p></div></div>
    <section class="card settings-card">
      <form id="settings-form">
        <div class="field-grid">
          <label class="field full"><span>Hotel name</span><input id="hotel-name" maxlength="100" value="${htmlEscape(settings.hotelName)}" required></label>
          <label class="field"><span>Free-page limit</span><input id="free-pages" type="number" min="0" max="1000" value="${settings.freePageLimit}" required></label>
          <label class="field"><span>Price per extra page</span><input id="price" type="number" min="0" max="10000" step="0.01" value="${(settings.pricePerPageMinor / 100).toFixed(2)}" required></label>
          <label class="field"><span>Currency</span><input id="currency" maxlength="3" value="${htmlEscape(settings.currency)}" required></label>
          <label class="field"><span>Maximum PDF size (MB)</span><input id="max-size" type="number" min="1" max="100" value="${Math.round(settings.maxUploadBytes / 1048576)}" required></label>
          <label class="field"><span>Maximum pages</span><input id="max-pages" type="number" min="1" max="10000" value="${settings.maxPageCount}" required></label>
          <label class="field"><span>Document retention (hours)</span><input id="retention" type="number" min="1" max="8760" value="${settings.retentionHours}" required></label>
          <label class="field"><span>Guest confirmation timeout (minutes)</span><input id="confirmation-timeout" type="number" min="1" max="1440" value="${settings.confirmationTimeoutMinutes}" required></label>
          <label class="field full"><span>Public customer URL</span><input id="public-url" type="url" value="${htmlEscape(settings.publicCustomerUrl)}" required><small>This is the URL encoded in the guest QR code.</small></label>
          <label class="toggle full"><input id="antivirus-required" type="checkbox" ${settings.antivirusRequired ? "checked" : ""}><span><strong>Require antivirus scanning</strong><small>Recommended for every hotel installation.</small></span></label>
        </div>
        <div id="settings-message" class="alert hidden" role="status"></div>
        <button class="button primary" type="submit">Save settings</button>
      </form>
    </section>`;
  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#settings-message");
    message.className = "alert hidden";
    try {
      const result = await api("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelName: document.querySelector("#hotel-name").value,
          freePageLimit: Number(document.querySelector("#free-pages").value),
          pricePerPageMinor: Math.round(Number(document.querySelector("#price").value) * 100),
          currency: document.querySelector("#currency").value,
          maxUploadBytes: Math.round(Number(document.querySelector("#max-size").value) * 1048576),
          maxPageCount: Number(document.querySelector("#max-pages").value),
          retentionHours: Number(document.querySelector("#retention").value),
          confirmationTimeoutMinutes: Number(document.querySelector("#confirmation-timeout").value),
          antivirusRequired: document.querySelector("#antivirus-required").checked,
          publicCustomerUrl: document.querySelector("#public-url").value,
        }),
      });
      message.textContent = `Settings saved at ${dateTime(result.settings.updatedAt)}.`;
      message.className = "alert success";
    } catch (error) {
      message.textContent = error.message;
      message.className = "alert error";
    }
  });
}

async function loadQrCode() {
  const { settings } = await api("/api/admin/settings");
  const isLocal = /localhost|127\.0\.0\.1/i.test(settings.publicCustomerUrl);
  content.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Guest access</p><h1>Guest QR code</h1><p>Print this code and place it in hotel rooms.</p></div></div>
    ${isLocal ? `<div class="alert warning"><strong>This QR code uses a local address.</strong> Guest phones cannot normally open localhost. Configure the public tunnel URL in Settings before printing it.</div>` : ""}
    <section class="qr-layout">
      <div class="card qr-card"><img src="/api/admin/qr.svg" alt="QR code for the customer document upload website"><p class="url-preview">${htmlEscape(settings.publicCustomerUrl)}</p></div>
      <div class="card qr-instructions"><p class="eyebrow">Room card</p><h2>Scan to print</h2><p>Upload a PDF from your phone. The front desk will print it for you.</p><ol><li>Scan this QR code.</li><li>Enter your room and last name.</li><li>Upload and submit your PDF.</li><li>Visit the front desk to collect it.</li></ol><div class="button-stack"><a class="button primary" href="/api/admin/qr.png?download=1">Download PNG</a><a class="button secondary" href="/api/admin/qr.svg?download=1">Download SVG</a><button id="print-qr" class="button secondary">Print this page</button></div></div>
    </section>`;
  document.querySelector("#print-qr").addEventListener("click", () => window.print());
}

async function loadJob() {
  const id = location.pathname.split("/").pop();
  const { job } = await api(`/api/admin/jobs/${encodeURIComponent(id)}`);
  content.innerHTML = `
    <div class="page-heading"><div><a class="back-link" href="/admin/queue">← Back to queue</a><p class="eyebrow">Job ${htmlEscape(job.reference)}</p><h1>${htmlEscape(job.originalFilename)}</h1><p>Submitted by room ${htmlEscape(job.roomNumber)} · ${htmlEscape(job.lastName)}</p></div></div>
    <section class="detail-grid">
      <div class="card">
        <h2>Document</h2>
        <dl class="detail-list">
          <div><dt>Pages</dt><dd>${job.pageCount}</dd></div>
          <div><dt>File size</dt><dd>${(job.fileSize / 1048576).toFixed(2)} MB</dd></div>
          <div><dt>Security scan</dt><dd>${htmlEscape(job.scanStatus)}</dd></div>
          <div><dt>Accepted</dt><dd>${dateTime(job.acceptedAt)}</dd></div>
          <div><dt>Expires</dt><dd>${dateTime(job.expiresAt)}</dd></div>
        </dl>
        <div class="button-row"><a class="button primary" target="_blank" rel="noopener" href="/api/admin/jobs/${encodeURIComponent(job.id)}/file">Open PDF</a><a class="button secondary" href="/api/admin/jobs/${encodeURIComponent(job.id)}/file?download=1">Download</a></div>
      </div>
      <div class="card">
        <h2>Price snapshot</h2>
        <dl class="price-breakdown">
          <div><dt>Total pages</dt><dd>${job.pageCount}</dd></div>
          <div><dt>Free pages</dt><dd>${job.freePageLimit}</dd></div>
          <div><dt>Chargeable pages</dt><dd>${job.chargeablePages}</dd></div>
          <div><dt>Price per page</dt><dd>${money(job.pricePerPageMinor, job.currency)}</dd></div>
          <div class="total-row"><dt>Total</dt><dd>${money(job.totalMinor, job.currency)}</dd></div>
        </dl>
        <button id="complete-job" class="button primary wide">Mark complete</button>
      </div>
    </section>`;
  document.querySelector("#complete-job").addEventListener("click", async () => {
    if (!confirm("Mark this document complete?")) return;
    await api(`/api/admin/jobs/${encodeURIComponent(job.id)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    window.location.assign("/admin/queue");
  });
}

async function initialize() {
  try {
    session = await api("/api/admin/session");
    if (!session.authenticated) return window.location.assign("/admin/login");
    document.querySelector("#signed-in-user").textContent = `Signed in as ${session.username}`;
    markNavigation();
    const section = activeSection();
    if (section === "queue") {
      await loadQueue();
      pollTimer = setInterval(() => {
        if (!document.hidden) loadQueue().catch(() => undefined);
      }, 5000);
    } else if (section === "settings") await loadSettings();
    else if (section === "qr-code") await loadQrCode();
    else await loadJob();
  } catch (error) {
    content.innerHTML = `<div class="alert error">${htmlEscape(error.message)}</div>`;
  }
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  window.location.assign("/admin/login");
});
document.querySelector("#menu-button").addEventListener("click", () => sidebar.classList.toggle("open"));
window.addEventListener("beforeunload", () => clearInterval(pollTimer));
initialize();
