
const APP_CONFIG = window.APP_CONFIG || {};
const API_BASE = APP_CONFIG.API_BASE || "";

if (APP_CONFIG.IS_API_PLACEHOLDER || !APP_CONFIG.API_BASE) {
    console.warn("Set your Render backend URL in frontend/config.js before production deploy.");
}

const token = localStorage.getItem("access_token");
let user = null;
try {
    user = JSON.parse(localStorage.getItem("user") || "null");
} catch (error) {
    localStorage.removeItem("user");
    user = null;
}

if (!token || !user) {
    window.location.href = "login.html";
}

const header = document.getElementById("siteHeader");
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
const userInfo = document.getElementById("userInfo");

if (userInfo && user && user.email) {
    userInfo.innerText = user.email;
}
const adminNavLink = document.getElementById("adminNavLink");
if (adminNavLink && user && user.role === "admin") {
    adminNavLink.style.display = "inline-flex";
}

function closeMenu() {
    if (!navLinks || !menuBtn) return;
    navLinks.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
}
window.closeMenu = closeMenu;

if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
        const willOpen = !navLinks.classList.contains("open");
        navLinks.classList.toggle("open", willOpen);
        menuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
}

document.querySelectorAll(".nav-links-wrap a").forEach((link) => {
    link.addEventListener("click", closeMenu);
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
        closeMenu();
    }
});

window.addEventListener("scroll", () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 18);
});

function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    window.location.href = "index.html";
}
window.logout = logout;

let lastPredictionData = null;
let loadingInterval = null;
const loadingMessages = [
    "Reading sentence patterns...",
    "Comparing AI and human writing signals...",
    "Scoring confidence across segments...",
    "Preparing your result report..."
];
function escapeHtml(value) {
    return String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

}

function getSafeUserSlug() {
    const email = (user && user.email) ? user.email : "user";
    return email.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

function setUxMessage(message, type = "info") {
    const uxMessage = document.getElementById("uxMessage");
    uxMessage.className = `ux-message show ${type}`;
    uxMessage.innerText = message;
}

function clearUxMessage() {
    const uxMessage = document.getElementById("uxMessage");
    uxMessage.className = "ux-message";
    uxMessage.innerText = "";
}

function startLoading(initialText = "Analyzing...") {
    const loading = document.getElementById("loading");
    const loadingMessage = document.getElementById("loadingMessage");
    let idx = 0;

    loading.hidden = false;
    loadingMessage.innerText = initialText;

    if (loadingInterval) {
        clearInterval(loadingInterval);
    }

    loadingInterval = setInterval(() => {
        idx = (idx + 1) % loadingMessages.length;
        loadingMessage.innerText = loadingMessages[idx];
    }, 1500);
}

function stopLoading() {
    const loading = document.getElementById("loading");
    const loadingMessage = document.getElementById("loadingMessage");
    loading.hidden = true;
    loadingMessage.innerText = "";
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
}

function renderDonut(aiValue, humanValue) {
    const donut = document.getElementById("donutChart");
    const ai = Math.max(0, Math.min(100, Number(aiValue) || 0));
    const human = Math.max(0, Math.min(100, Number(humanValue) || 0));
    const aiDeg = (ai / 100) * 360;

    donut.style.background = `conic-gradient(#ef4444 0deg ${aiDeg}deg, #10b981 ${aiDeg}deg 360deg)`;
    donut.innerHTML = `
        <div class="donut-inner">
            <strong>AI ${ai}%</strong>
            <span>Human ${human}%</span>
        </div>
    `;
}

async function loadHistory() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  if (!API_BASE) {
    historyList.innerHTML = "<div class='history-item'>Backend URL not configured.</div>";
    return;
  }

  // Safari-safe null/undefined check helper
  const valOrZero = (v) => (v === null || v === undefined ? 0 : v);

  try {
    const response = await fetch(API_BASE + "/my-history", {
      headers: { Authorization: "Bearer " + token },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(data)) {
      historyList.innerHTML = "<div class='history-item'>Unable to load history.</div>";
      return;
    }

    data.sort((a, b) => {
      const aTime = a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    const recent = data.slice(0, 3);

    if (!recent.length) {
      historyList.innerHTML = "<div class='history-item'>No scans yet.</div>";
      return;
    }

    historyList.innerHTML = recent
      .map((log) => {
        const time = log && log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A";
        const scanned = (log && log.scanned_text) ? String(log.scanned_text) : "";
        const preview = scanned.slice(0, 300);
        const suffix = scanned.length > 300 ? "..." : "";

        const result = escapeHtml((log && log.result) ? log.result : "N/A");
        const ai = valOrZero(log && log.ai_percent);
        const human = valOrZero(log && log.human_percent);

        return (
          '<div class="history-item">' +
            '<div class="history-meta">' +
              "Result: " + result + " | " +
              "AI: " + ai + "% | " +
              "Human: " + human + "% | " +
              "Time: " + escapeHtml(time) +
            "</div>" +
            '<p class="history-text">' +
              escapeHtml(preview) + suffix +
            "</p>" +
          "</div>"
        );
      })
      .join("");
  } catch (error) {
    historyList.innerHTML = "<div class='history-item'>Unable to load history.</div>";
  }
}



function clearText() {
    document.getElementById("textInput").value = "";
    document.getElementById("fileInput").value = "";
    document.getElementById("highlightedText").innerHTML = "";
    document.getElementById("overallStats").innerHTML = "";
    document.getElementById("resultSummary").innerHTML = "";
    document.getElementById("donutChart").innerHTML = "";
    document.getElementById("results").style.display = "none";
    lastPredictionData = null;
    stopLoading();
    clearUxMessage();
}
window.clearText = clearText;

function renderPrediction(data) {
    renderDonut(data.overall_ai_probability, data.overall_human_probability);

    const overallStats = document.getElementById("overallStats");
    overallStats.innerHTML = `
        <span class="overall-pill human-pill">Human: ${data.overall_human_probability}%</span>
        <span class="overall-pill ai-pill">AI: ${data.overall_ai_probability}%</span>
    `;

    const aiPercent = Number(data.overall_ai_probability || 0);
    const humanPercent = Number(data.overall_human_probability || 0);
    const confidenceGap = Math.abs(humanPercent - aiPercent);
    const verdict = aiPercent > humanPercent ? "Likely AI-Generated" : "Likely Human-Written";
    const summary = document.getElementById("resultSummary");
    summary.innerHTML = `
        <article class="summary-card">
            <h4>Final Verdict</h4>
            <p>${verdict}</p>
        </article>
        <article class="summary-card">
            <h4>Confidence Gap</h4>
            <p>${confidenceGap.toFixed(1)}%</p>
        </article>
        <article class="summary-card">
            <h4>Sentences Reviewed</h4>
            <p>${(data.sentences && data.sentences.length) ? data.sentences.length : 0}</p>
        </article>
    `;

    const box = document.getElementById("highlightedText");
    box.innerHTML = "";
    data.sentences.forEach((s) => {
        const span = document.createElement("span");
        span.innerText = s.sentence + " ";
        span.className = s.final_label.toLowerCase();
        box.appendChild(span);
    });

    document.getElementById("results").style.display = "block";
    lastPredictionData = data;
    setUxMessage("Analysis complete. You can copy the result text or download a report.", "success");
}

function handlePredictionError(response, data) {
    stopLoading();
    if (response.status === 401) {
        alert("Session expired. Please login again.");
        logout();
        return;
    }
    if (response.status === 402) {
        alert("No tokens left. Contact admin.");
        return;
    }
    setUxMessage(data.detail || "Prediction failed", "error");
}

async function analyzeText() {
    const text = document.getElementById("textInput").value.trim();
    if (!text) return alert("Please enter some text.");
    if (!API_BASE) return alert("Backend URL is not configured. Set it in frontend/config.js");

    clearUxMessage();
    startLoading("Analyzing document...");

    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        if (!response.ok) {
            handlePredictionError(response, data);
            return;
        }

        renderPrediction(data);
        setUxMessage(`Analysis complete. Tokens left: ${data.tokens_left}`, "success");
        loadHistory();
    } catch (error) {
        setUxMessage("Server not reachable. Please try again.", "error");
    } finally {
        stopLoading();
    }
}
window.analyzeText = analyzeText;

async function analyzeFile() {
    const fileInput = document.getElementById("fileInput");
    const textInput = document.getElementById("textInput");
    if (!fileInput.files.length) return alert("Please choose a file to extract.");
    if (!API_BASE) return alert("Backend URL is not configured. Set it in frontend/config.js");

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    clearUxMessage();
    startLoading("Extracting text from file...");
    try {
        const response = await fetch(`${API_BASE}/extract-file`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token },
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) {
                alert("Session expired. Please login again.");
                logout();
                return;
            }
            setUxMessage(data.detail || "File extraction failed", "error");
            return;
        }

        textInput.value = data.text || "";
        setUxMessage(`Extracted ${data.characters || 0} characters. Click Analyze to scan.`, "info");
    } catch (error) {
        setUxMessage("Unable to extract file right now. Please try again.", "error");
    } finally {
        stopLoading();
    }
}
window.analyzeFile = analyzeFile;

async function copyResultText() {
    if (!lastPredictionData) {
        setUxMessage("Run an analysis first to copy result text.", "error");
        return;
    }
    const text = lastPredictionData.sentences
        .map((s, idx) => `${idx + 1}. [${s.final_label}] ${s.sentence}`)
        .join("\n");
    try {
        await navigator.clipboard.writeText(text);
        setUxMessage("Result text copied to clipboard.", "success");
    } catch (error) {
        setUxMessage("Unable to copy automatically. Please copy manually.", "error");
    }
}
window.copyResultText = copyResultText;

function downloadReport() {
    if (!lastPredictionData) {
        setUxMessage("Run an analysis first before downloading the report.", "error");
        return;
    }

    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const fileName = `ai_detection_report_${getSafeUserSlug()}_${datePart}.html`;
    const sourceText = document.getElementById("textInput").value.trim();
    const highlightedHtml = lastPredictionData.sentences.map((s) => {
        const label = String(s.final_label || "").toLowerCase();
        const klass = label === "ai" ? "ai" : "human";
        return `<span class="${klass}">${escapeHtml(s.sentence)}</span> `;
    }).join("");
    const reportLines = [
        "<!DOCTYPE html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"UTF-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
        "<title>AI Detection Report</title>",
        "<style>",
        "body{font-family:Poppins,Arial,sans-serif;margin:24px;color:#0f172a;line-height:1.7}",
        "h1{margin:0 0 10px}",
        ".meta{color:#334155;margin-bottom:16px}",
        ".pill{display:inline-block;margin-right:8px;padding:6px 10px;border-radius:999px;color:#fff;font-weight:600}",
        ".human-pill{background:#059669}",
        ".ai-pill{background:#dc2626}",
        ".section{margin-top:18px}",
        ".box{border:1px solid #cbd5e1;border-radius:12px;padding:16px;background:#fff}",
        ".ai{background:linear-gradient(135deg,#fee2e2,#fecaca);color:#7f1d1d;padding:4px 8px;border-radius:7px;border-left:3px solid #ef4444}",
        ".human{background:linear-gradient(135deg,#dcfce7,#bbf7d0);color:#14532d;padding:4px 8px;border-radius:7px;border-left:3px solid #10b981}",
        "pre{white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px}",
        "</style>",
        "</head>",
        "<body>",
        "<h1>AI Text Detector Report</h1>",
        `<div class="meta">Generated for: ${escapeHtml((user && user.email) ? user.email : "N/A")}<br>Generated at: ${escapeHtml(now.toLocaleString())}</div>`,
        "<div>",
        `<span class="pill human-pill">Human: ${lastPredictionData.overall_human_probability}%</span>`,
        `<span class="pill ai-pill">AI: ${lastPredictionData.overall_ai_probability}%</span>`,
        "</div>",
        "<div class=\"section\">",
        "<h3>Highlighted Result</h3>",
        `<div class="box">${highlightedHtml || "(No highlighted output available)"}</div>`,
        "</div>",
        "<div class=\"section\">",
        "<h3>Source Text</h3>",
        `<pre>${escapeHtml(sourceText || "(No source text available)")}</pre>`,
        "</div>",
        "</body>",
        "</html>"
    ];
    const reportContent = reportLines.join("\n");

    const blob = new Blob([reportContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setUxMessage(`Report downloaded as ${fileName}`, "success");
}
window.downloadReport = downloadReport;

const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeFileBtn = document.getElementById("analyzeFileBtn");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyResultBtn = document.getElementById("copyResultBtn");
const logoutBtn = document.getElementById("logoutBtn");

if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeText);
if (analyzeFileBtn) analyzeFileBtn.addEventListener("click", analyzeFile);
if (clearBtn) clearBtn.addEventListener("click", clearText);
if (downloadBtn) downloadBtn.addEventListener("click", downloadReport);
if (copyResultBtn) copyResultBtn.addEventListener("click", copyResultText);
if (logoutBtn) logoutBtn.addEventListener("click", () => {
    logout();
    closeMenu();
});

loadHistory();

