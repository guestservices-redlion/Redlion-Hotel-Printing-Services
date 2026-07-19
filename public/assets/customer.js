const uploadForm = document.querySelector("#upload-form");
const uploadCard = uploadForm.closest(".card");
const documentInput = document.querySelector("#document");
const fileTitle = document.querySelector("#file-title");
const formError = document.querySelector("#form-error");
const progressCard = document.querySelector("#progress-card");
const progressTitle = document.querySelector("#progress-title");
const progressDetail = document.querySelector("#progress-detail");
const progressBar = document.querySelector("#progress-bar");
const confirmationCard = document.querySelector("#confirmation-card");
const confirmationError = document.querySelector("#confirmation-error");
const confirmButton = document.querySelector("#confirm-button");
const cancelButton = document.querySelector("#cancel-button");
const successCard = document.querySelector("#success-card");
let pendingJob = null;

function show(element) {
  element.classList.remove("hidden");
}

function hide(element) {
  element.classList.add("hidden");
}

function showError(element, message) {
  element.textContent = message;
  show(element);
}

function money(minor, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}

async function loadConfig() {
  try {
    const response = await fetch(hotelPrintApiUrl("/api/customer/config"));
    const config = await response.json();
    document.querySelector("#hotel-name").textContent = config.hotelName;
    document.querySelector("#max-size").textContent =
      `${Math.floor(config.maxUploadBytes / 1048576)} MB`;
    document.title = `${config.hotelName} Print Service`;
  } catch {
    // Defaults remain usable if this informational request fails.
  }
}

documentInput.addEventListener("change", () => {
  const file = documentInput.files?.[0];
  fileTitle.textContent = file ? file.name : "Choose a PDF document";
});

uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  hide(formError);
  const file = documentInput.files?.[0];
  if (!file) return showError(formError, "Choose a PDF document.");
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return showError(formError, "Only PDF documents are accepted.");
  }
  const data = new FormData();
  data.set("roomNumber", document.querySelector("#room-number").value);
  data.set("lastName", document.querySelector("#last-name").value);
  data.set("document", file);

  hide(uploadCard);
  show(progressCard);
  progressBar.style.width = "8%";
  progressTitle.textContent = "Uploading document…";
  progressDetail.textContent = "Sending the PDF to the hotel computer.";

  const xhr = new XMLHttpRequest();
  xhr.open("POST", hotelPrintApiUrl("/api/customer/upload"));
  xhr.responseType = "json";
  xhr.upload.addEventListener("progress", (progress) => {
    if (!progress.lengthComputable) return;
    const percent = Math.min(70, Math.round((progress.loaded / progress.total) * 70));
    progressBar.style.width = `${percent}%`;
  });
  xhr.upload.addEventListener("load", () => {
    progressBar.style.width = "82%";
    progressTitle.textContent = "Scanning and counting pages…";
    progressDetail.textContent = "Checking the file before it reaches the front desk.";
  });
  xhr.addEventListener("load", () => {
    if (xhr.status < 200 || xhr.status >= 300) {
      hide(progressCard);
      show(uploadCard);
      return showError(
        formError,
        xhr.response?.error?.message ?? "The document could not be processed.",
      );
    }
    pendingJob = xhr.response.job;
    progressBar.style.width = "100%";
    setTimeout(showConfirmation, 250);
  });
  xhr.addEventListener("error", () => {
    hide(progressCard);
    show(uploadCard);
    showError(formError, "The upload was interrupted. Please check the connection and try again.");
  });
  xhr.send(data);
});

function showConfirmation() {
  hide(progressCard);
  const job = pendingJob;
  document.querySelector("#total-pages").textContent = job.pageCount;
  document.querySelector("#free-pages").textContent = job.freePageLimit;
  document.querySelector("#chargeable-pages").textContent = job.chargeablePages;
  document.querySelector("#price-per-page").textContent = money(
    job.pricePerPageMinor,
    job.currency,
  );
  document.querySelector("#total-price").textContent = money(job.totalMinor, job.currency);
  const notice = document.querySelector("#payment-notice");
  if (job.totalMinor > 0) {
    notice.textContent =
      "Please visit the front desk to pay and collect your printed document.";
    confirmButton.textContent = "Accept & Submit";
  } else {
    notice.textContent = "There is no printing charge for this document.";
    confirmButton.textContent = "Submit to front desk";
  }
  show(confirmationCard);
}

async function handlePendingAction(action) {
  hide(confirmationError);
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  try {
    const response = await fetch(
      hotelPrintApiUrl(`/api/customer/jobs/${encodeURIComponent(pendingJob.reference)}/${action}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingJob.confirmationToken }),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "The request could not be completed.");
    hide(confirmationCard);
    if (action === "confirm") {
      document.querySelector("#job-reference").textContent = result.reference;
      show(successCard);
    } else {
      resetForm();
    }
  } catch (error) {
    showError(confirmationError, error.message);
  } finally {
    confirmButton.disabled = false;
    cancelButton.disabled = false;
  }
}

confirmButton.addEventListener("click", () => handlePendingAction("confirm"));
cancelButton.addEventListener("click", () => handlePendingAction("cancel"));
document.querySelector("#new-upload-button").addEventListener("click", resetForm);

function resetForm() {
  pendingJob = null;
  uploadForm.reset();
  fileTitle.textContent = "Choose a PDF document";
  hide(progressCard);
  hide(confirmationCard);
  hide(successCard);
  hide(formError);
  show(uploadCard);
}

loadConfig();
