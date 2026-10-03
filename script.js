// ============ CONFIGURAZIONE ============
const API_URL = "https://script.google.com/macros/s/IL_TUO_DEPLOYMENT_ID/exec";
let STATO = {
  token: localStorage.getItem("ore_token"),
  user: null,
  foglioAttivo: null,
  fogliMesi: []
};

// ============ UTILITY ============
function toast(msg, tipo) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + (tipo || "");
  setTimeout(() => t.className = "toast " + (tipo || ""), 3000);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => 
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ============ CHIAMATE API ============
async function callAPI(action, params = {}) {
  const formData = new FormData();
  formData.append("action", action);
  Object.keys(params).forEach(key => formData.append(key, params[key]));
  
  const response = await fetch(API_URL, {
    method: "POST",
    body: formData,
    redirect: "follow"
  });
  
  return await response.json();
}

// ============ LOGIN ============
async function faiLogin() {
  const email = document.getElementById("login_email").value.trim();
  const password = document.getElementById("login_password").value;
  const errDiv = document.getElementById("login_error");
  errDiv.style.display = "none";
  
  if (!email || !password) {
    errDiv.textContent = "Inserisci email e password";
    errDiv.style.display = "block";
    return;
  }
  
  const btn = document.getElementById("btnLogin");
  btn.disabled = true;
  btn.innerHTML = "Accesso...";
  
  try {
    const res = await callAPI("login", { email, password });
    if (res.ok) {
      STATO.token = res.token;
      STATO.user = res.user;
      localStorage.setItem("ore_token", res.token);
      mostraApp();
    } else {
      errDiv.textContent = res.msg;
      errDiv.style.display = "block";
    }
  } catch (err) {
    errDiv.textContent = "Errore: " + err.message;
    errDiv.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🔓 Accedi";
  }
}

// ============ LOGOUT ============
async function faiLogout() {
  if (!confirm("Vuoi uscire?")) return;
  await callAPI("logout", { token: STATO.token });
  STATO.token = null;
  STATO.user = null;
  localStorage.removeItem("ore_token");
  location.reload();
}

// ============ MOSTRA APP ============
function mostraApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("userBadge").textContent = STATO.user.nome + " • " + STATO.user.ruolo;
  caricaDashboard();
}

// ============ DASHBOARD ============
async function caricaDashboard() {
  const nomeFoglio = document.getElementById("selettoreMese").value || null;
  const res = await callAPI("getDashboard", { 
    token: STATO.token, 
    foglio: nomeFoglio,
    filtro: JSON.stringify({ tipo: "tutto" })
  });
  
  if (res.error) {
    if (res.error.includes("Sessione")) {
      localStorage.removeItem("ore_token");
      location.reload();
      return;
    }
    toast(res.error, "err");
    return;
  }
  
  // Rendering KPI
  const r = res.riepilogo;
  document.getElementById("kpi").innerHTML = `
    <div class="kpi"><div class="label">Ore totali</div><div class="value">${r.totaleOre}</div></div>
    <div class="kpi green"><div class="label">Ordinarie</div><div class="value">${r.ordinarie}</div></div>
    <div class="kpi orange"><div class="label">Straordinarie</div><div class="value">${r.straordFeriali + r.straordFestivi}</div></div>
    <div class="kpi purple"><div class="label">Km</div><div class="value">${r.km}</div></div>
  `;
  
  document.getElementById("countVoci").textContent = res.rows.length + " voci";
  // ... rendering tabella (adattare dal codice originale)
}

// ============ EMAIL ============
async function inviaEmail() {
  if (!confirm("Inviare le tue ore via email?")) return;
  const res = await callAPI("inviaEmail", { token: STATO.token, mode: "proprie" });
  toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
}

// ============ INIT ============
if (STATO.token) {
  callAPI("getCurrentUser", { token: STATO.token }).then(user => {
    if (user && user.email) {
      STATO.user = user;
      mostraApp();
    }
  });
}