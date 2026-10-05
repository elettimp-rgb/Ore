/************************************************************
 * CONFIGURAZIONE
 ************************************************************/
const API_URL = "https://ore.elettimp.workers.dev";

let STATO = {
  token: localStorage.getItem("ore_token") || null,
  user: null,
  foglioAttivo: null,
  fogliMesi: [],
  commesseConfig: [],
  dipendenti: [],
  mesiDisponibili: [],
  editRowNum: null
};

let EMAIL_STATO = {
  mode: null,
  foglioScelto: null
};

/************************************************************
 * UTILITY
 ************************************************************/
function toast(msg, tipo) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + (tipo || "");
  setTimeout(function() { t.className = "toast " + (tipo || ""); }, 3000);
}
function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function numVal(id) { const v = val(id); return v === "" ? "" : Number(v); }
function setVal(id, v) { const el = (id); if (el) el.value = v; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function valOrEmpty(v) {
  if (v === null || v === undefined || v === "" || v === 0 || v === "0") return "";
  return v;
}

function switchInner(name, el) {
  document.querySelectorAll(".segment").forEach(function(t) { t.classList.remove("active"); });
  el.classList.add("active");
  ["voci", "dip", "comm"].forEach(function(n) {
    document.getElementById("inner-" + n).style.display = (n === name) ? "block" : "none";
  });
}

function isAdminPrincipale() {
  return STATO.user &&
    STATO.user.ruolo === "admin" &&
    (STATO.user.adminPrincipale === true || STATO.user.adminPrincipale === "TRUE");
}
function isAdminSecondario() {
  return STATO.user &&
    STATO.user.ruolo === "admin" &&
    STATO.user.adminPrincipale !== true &&
    STATO.user.adminPrincipale !== "TRUE";
}
function isAdmin() {
  return STATO.user && STATO.user.ruolo === "admin";
}

/************************************************************
 * API CALL
 ************************************************************/
async function callAPI(action, params) {
  params = params || {};

  const queryParams = new URLSearchParams();
  queryParams.append("action", action);
  queryParams.append("payload", JSON.stringify(params));
  queryParams.append("_t", Date.now() + "_" + Math.random().toString(36).substring(7));

  const response = await fetch(API_URL + "?" + queryParams.toString(), {
    method: "GET",
    redirect: "follow",
    cache: "no-store"
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Risposta non JSON:", text.substring(0, 500));
    return { ok: false, msg: "Risposta non valida dal server" };
  }
}

/************************************************************
 * SESSIONE
 ************************************************************/
function salvaSessione(token) {
  try { localStorage.setItem("ore_token", token); } catch (e) {}
}
function cancellaSessione() {
  try { localStorage.removeItem("ore_token"); } catch (e) {}
}

/************************************************************
 * LOGIN / LOGOUT
 ************************************************************/
async function faiLogin() {
  const email = val("login_email").trim();
  const password = val("login_password");
  const errDiv = document.getElementById("login_error");
  errDiv.style.display = "none";

  if (!email || !password) {
    errDiv.textContent = "Inserisci email e password";
    errDiv.style.display = "block";
    return;
  }

  const btn = document.getElementById("btnLogin");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span>Accesso...';

  try {
    const res = await callAPI("login", { email: email, password: password });
    if (res.ok) {
      STATO.token = res.token;
      STATO.user = res.user;
      salvaSessione(res.token);
      mostraApp();
    } else {
      errDiv.textContent = res.msg || "Errore di login";
      errDiv.style.display = "block";
    }
  } catch (err) {
    errDiv.textContent = "Errore: " + err.message;
    errDiv.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function faiLogout() {
  if (!confirm("Vuoi uscire?")) return;
  const t = STATO.token;
  STATO.token = null;
  STATO.user = null;
  cancellaSessione();
  if (t) {
    try { await callAPI("logout", { token: t }); } catch (e) {}
  }
  location.reload();
}

/************************************************************
 * MOSTRA APP
 ************************************************************/
function mostraApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";

  document.body.classList.remove("is-admin", "is-admin-principale", "is-admin-secondario", "is-utente");

  if (isAdminPrincipale()) {
    document.body.classList.add("is-admin", "is-admin-principale");
  } else if (isAdminSecondario()) {
    document.body.classList.add("is-admin", "is-admin-secondario");
  } else {
    document.body.classList.add("is-utente");
  }

  let ruoloLabel = "Utente";
  if (isAdminPrincipale()) ruoloLabel = "👑 Admin Principale";
  else if (isAdminSecondario()) ruoloLabel = "🔧 Admin";

  document.getElementById("userBadge").textContent = STATO.user.nome + " • " + ruoloLabel;

  caricaFogli();
  caricaDipendenti();
  caricaMesiDisponibili();
}

/************************************************************
 * INIT
 ************************************************************/
document.getElementById("f_data").value = todayISO();
setVal("filtroPeriodo", "tutto");

(async function init() {
  if (!STATO.token) return;
  try {
    const user = await callAPI("getCurrentUser", { token: STATO.token });
    if (user && user.email) {
      STATO.user = user;
      mostraApp();
    } else {
      cancellaSessione();
      STATO.token = null;
    }
  } catch (e) {
    cancellaSessione();
    STATO.token = null;
  }
})();

/************************************************************
 * CARICAMENTI
 ************************************************************/
async function caricaFogli() {
  try {
    const fogli = await callAPI("getFogliDati");
    STATO.fogliMesi = fogli || [];
    const sel = document.getElementById("selettoreMese");
    if (!fogli || !fogli.length) {
      sel.innerHTML = '<option value="">— nessun foglio —</option>';
      return;
    }
    sel.innerHTML = fogli.map(function(f) {
      return '<option value="' + esc(f) + '">' + esc(f) + '</option>';
    }).join("");
    caricaDashboard();
  } catch (err) {
    toast("Errore caricamento fogli: " + err.message, "err");
  }
}

async function caricaDipendenti() {
  try {
    const dip = await callAPI("getDipendenti");
    STATO.dipendenti = dip || [];
    document.getElementById("dl_dipendenti").innerHTML =
      STATO.dipendenti.map(function(d) { return '<option value="' + esc(d) + '">'; }).join("");
    popolaFiltriDinamici();
  } catch (e) {}
}

async function caricaMesiDisponibili() {
  try {
    const mesi = await callAPI("getMesiDisponibili");
    STATO.mesiDisponibili = mesi || [];
    const sel = document.getElementById("nuovoMeseSelect");
    sel.innerHTML = mesi.map(function(m) {
      return '<option value="' + esc(m.nome) + '">' + esc(m.nome) + '</option>';
    }).join("");
    if (mesi.length) setVal("nuovoMeseNome", mesi[0].nome);
  } catch (e) {}
}

/************************************************************
 * FILTRI
 ************************************************************/
function onFiltroPeriodoChange() {
  const tipo = val("filtroPeriodo");
  const extra = document.getElementById("filtriExtra");
  const rigaDate = document.getElementById("rigaDateCustom");

  if (tipo === "tutto") {
    extra.style.display = "none";
    rigaDate.style.display = "none";
  } else if (tipo === "custom") {
    extra.style.display = "block";
    rigaDate.style.display = "grid";
  } else {
    extra.style.display = "block";
    rigaDate.style.display = "none";
  }
  document.getElementById("boxFiltroDip").style.display = isAdmin() ? "block" : "none";
  caricaDashboard();
}

function resetFiltri() {
  setVal("filtroPeriodo", "tutto");
  setVal("filtroDataInizio", "");
  setVal("filtroDataFine", "");
  setVal("filtroDipendente", "");
  setVal("filtroCommessa", "");
  document.getElementById("rigaDateCustom").style.display = "none";
  document.getElementById("filtriExtra").style.display = "none";
  caricaDashboard();
}

function getFiltroCorrente() {
  return {
    tipo: val("filtroPeriodo") || "tutto",
    dataInizio: val("filtroDataInizio"),
    dataFine: val("filtroDataFine"),
    dipendente: val("filtroDipendente"),
    commessa: val("filtroCommessa")
  };
}

/************************************************************
 * DASHBOARD
 ************************************************************/
async function caricaDashboard() {
  const nomeFoglio = val("selettoreMese") || STATO.foglioAttivo || null;
  const filtro = getFiltroCorrente();

  document.getElementById("kpi").innerHTML =
    '<div class="kpi" style="grid-column:1/-1;text-align:center"><div class="label">Caricamento</div><div class="value">…</div></div>';

  try {
    const res = await callAPI("getDashboard", {
      token: STATO.token,
      foglio: nomeFoglio,
      filtro: filtro
    });

    if (!res) { mostraErrore("Risposta vuota"); return; }
    if (res.error) {
      if (res.error.indexOf("Sessione") !== -1) {
        cancellaSessione();
        location.reload();
        return;
      }
      mostraErrore(res.error);
      return;
    }

    STATO.user = res.user;
    STATO.foglioAttivo = res.foglio;
    STATO.commesseConfig = res.commesseConfig || [];
    STATO.fogliMesi = res.fogliMesi || [];
    document.getElementById("foglioAttivoLabel").textContent = res.foglio || "—";

    aggiornaSelettoreFogli(STATO.fogliMesi, res.foglio);
    popolaFiltriDinamici();

    const r = res.riepilogo;
    document.getElementById("kpi").innerHTML = [
      kpiCard("Ore totali", r.totaleOre, ""),
      kpiCard("Ordinarie", r.ordinarie, "green"),
      kpiCard("Str. Feriale", r.straordFeriali, "orange"),
      kpiCard("Str. Festivo", r.straordFestivi, "orange"),
      kpiCard("Ore viaggio", r.oreViaggio || 0, "purple"),
      kpiCard("Km", r.km, "purple"),
      kpiCard("Spese", r.spese.toFixed(2), "slate", "€"),
      kpiCard("Ferie", r.ferie, "red"),
      kpiCard("Malattia", r.malattia, "red"),
      kpiCard("Giorni", r.numRighe, "")
    ].join("");

    renderTabellaVoci(res);
    renderDipendenti(res);
    renderCommesse(res);

    popolaSelectCommesse();
    aggiornaSelectFoglioForm(res.foglio);
  } catch (err) {
    mostraErrore("Errore: " + err.message);
  }
}

function kpiCard(label, value, cls, suffix) {
  return '<div class="kpi ' + (cls || "") + '">' +
    '<div class="label">' + esc(label) + '</div>' +
    '<div class="value">' + esc(value) + (suffix ? '<small>' + esc(suffix) + '</small>' : '') + '</div>' +
    '</div>';
}

function mostraErrore(msg) {
  document.getElementById("kpi").innerHTML =
    '<div class="kpi" style="grid-column:1/-1;border-left-color:#dc2626">' +
    '<div class="label" style="color:#dc2626">Errore</div>' +
    '<div class="value" style="font-size:.95rem;color:#dc2626;font-weight:600;line-height:1.4">' + esc(msg) + '</div>' +
    '</div>';
  toast(msg, "err");
}

function aggiornaSelettoreFogli(fogli, attivo) {
  const sel = document.getElementById("selettoreMese");
  if (!fogli || !fogli.length) {
    sel.innerHTML = '<option value="">— nessun foglio —</option>';
    return;
  }
  sel.innerHTML = fogli.map(function(f) {
    return '<option value="' + esc(f) + '"' + (f === attivo ? " selected" : "") + '>' + esc(f) + '</option>';
  }).join("");
  if (attivo) sel.value = attivo;
}

function aggiornaSelectFoglioForm(attivo) {
  const sel = document.getElementById("f_foglio");
  sel.innerHTML = STATO.fogliMesi.map(function(f) {
    return '<option value="' + esc(f) + '"' + (f === attivo ? " selected" : "") + '>' + esc(f) + '</option>';
  }).join("");
}

function popolaFiltriDinamici() {
  const selDip = document.getElementById("filtroDipendente");
  const curDip = selDip.value;
  const optsDip = ['<option value="">Tutti</option>'];
  (STATO.dipendenti || []).forEach(function(d) {
    optsDip.push('<option value="' + esc(d) + '">' + esc(d) + '</option>');
  });
  selDip.innerHTML = optsDip.join("");
  if (curDip) selDip.value = curDip;

  const selComm = document.getElementById("filtroCommessa");
  const curComm = selComm.value;
  const optsComm = ['<option value="">Tutte</option>'];
  (STATO.commesseConfig || []).forEach(function(c) {
    const propLabel = (isAdminPrincipale() && c.proprietario) ? ' [' + c.proprietario + ']' : '';
    optsComm.push('<option value="' + esc(c.numero) + '">#' + esc(c.numero) + ' — ' + esc(c.committente) + propLabel + '</option>');
  });
  selComm.innerHTML = optsComm.join("");
  if (curComm) selComm.value = curComm;
}

/************************************************************
 * TABELLA VOCI
 ************************************************************/
function renderTabellaVoci(res) {
  document.getElementById("countVoci").textContent = res.rows.length + " Giorni";
  const isAdminU = isAdmin();

  if (!res.rows.length) {
    document.getElementById("tabellaVoci").innerHTML =
      '<div class="empty"><div class="empty-icon">📊</div><div>Nessuna voce per questo periodo</div></div>';
    return;
  }

  const rowsSorted = res.rows.slice().sort(function(a, b) {
    return a.dataISO.localeCompare(b.dataISO);
  });

  function cellStyle(s) {
    if (!s) return "";
    const css = [];
    if (s.bg && s.bg.toLowerCase() !== "#ffffff") css.push("background:" + s.bg);
    if (s.fg && s.fg.toLowerCase() !== "#000000") css.push("color:" + s.fg);
    if (s.bold) css.push("font-weight:700");
    if (s.italic) css.push("font-style:italic");
    if (s.align) css.push("text-align:" + s.align);
    return css.join(";");
  }

  const headerTesti = res.headerTesti || [];
  const headerStili = res.headerStili || [];

  let html = '<table class="tabella"><thead><tr>';
  for (let j = 0; j < headerTesti.length; j++) {
    const st = cellStyle(headerStili[j]);
    html += '<th style="' + st + '">' + esc(headerTesti[j] || "") + '</th>';
  }
  html += '<th style="text-align:center">Azioni</th>';
  html += '</tr></thead><tbody>';

  rowsSorted.forEach(function(v) {
    html += "<tr>";
    for (let j = 0; j < 16; j++) {
      const displayVal = v.display ? (v.display[j] || "") : "";
      const st = cellStyle(v.stili && v.stili[j]);
      const cls = (v.stili && v.stili[j] && v.stili[j].align === "right") ? "num" : "";
      html += '<td class="' + cls + '" style="' + st + '">' + esc(displayVal) + '</td>';
    }
    html += '<td class="row-actions">';
    html += '<button class="edit" title="Modifica" onclick="modificaVoce(' + v.rowNum + ')">✏️</button>';
    if (isAdminU) {
      html += '<button class="del" title="Cancella" onclick="cancellaVoce(' + v.rowNum + ')">🗑️</button>';
    }
    html += '</td>';
    html += "</tr>";
  });

  const r = res.riepilogo;
  const totStyle = "font-weight:800;color:var(--accent-light);border-top:2px solid var(--accent);";
  html += '</tbody><tfoot><tr>' +
    '<td colspan="3" style="' + totStyle + '">TOTALI</td>' +
    '<td class="num" style="' + totStyle + '">' + r.ordinarie + '</td>' +
    '<td class="num" style="' + totStyle + '">' + r.straordFeriali + '</td>' +
    '<td class="num" style="' + totStyle + '">' + r.straordFestivi + '</td>' +
    '<td class="num" style="' + totStyle + '">' + r.totaleOre + '</td>' +
    '<td class="num" style="' + totStyle + '"></td>' +
    '<td class="num" style="' + totStyle + '">' + r.km + '</td>' +
    '<td class="num" style="' + totStyle + '">' + r.spese.toFixed(2) + '</td>' +
    '<td colspan="4" style="' + totStyle + '"></td>' +
    '<td class="num" style="' + totStyle + '">' + r.ferie + '</td>' +
    '<td class="num" style="' + totStyle + '">' + r.malattia + '</td>' +
    '<td style="' + totStyle + '"></td>' +
    '</tr></tfoot></table>';

  document.getElementById("tabellaVoci").innerHTML = html;
}

/************************************************************
 * RIEPILOGO DIPENDENTI
 ************************************************************/
function renderDipendenti(res) {
  if (!res.perDipendente.length) {
    document.getElementById("tblDipendenti").innerHTML =
      '<div class="empty"><div class="empty-icon">👥</div><div>Nessun dato</div></div>';
    return;
  }

  const dip = res.perDipendente;

  const tot = dip.reduce(function(acc, d) {
    acc.ordinario += d.ordinario;
    acc.straordFeriali += d.straordFeriali;
    acc.straordFestivi += d.straordFestivi;
    acc.totale += d.totale;
    acc.oreViaggio += d.oreViaggio;
    acc.km += d.km;
    acc.spese += d.spese;
    acc.ferie += d.ferie;
    acc.malattia += d.malattia;
    acc.voci += d.voci;
    return acc;
  }, { ordinario: 0, straordFeriali: 0, straordFestivi: 0, totale: 0,
       oreViaggio: 0, km: 0, spese: 0, ferie: 0, malattia: 0, voci: 0 });

  document.getElementById("tblDipendenti").innerHTML =
    '<div class="tabella-wrap">' +
    '<table class="tabella tabella-riepilogo">' +
    '<thead><tr>' +
      '<th>Dipendente</th>' +
      '<th style="text-align:right">Ordinarie</th>' +
      '<th style="text-align:right">Str. Feriale</th>' +
      '<th style="text-align:right">Str. Festivo</th>' +
      '<th style="text-align:right">Totale</th>' +
      '<th style="text-align:right">Ore viaggio</th>' +
      '<th style="text-align:right">Km</th>' +
      '<th style="text-align:right">Spese (€)</th>' +
      '<th style="text-align:right">Ferie</th>' +
      '<th style="text-align:right">Malattia</th>' +
      '<th style="text-align:right">Giorni</th>' +
    '</tr></thead>' +
    '<tbody>' +
    dip.map(function(d) {
      return '<tr>' +
        '<td class="dip-name">' + esc(d.dipendente) + '</td>' +
        '<td class="num">' + d.ordinario + '</td>' +
        '<td class="num">' + d.straordFeriali + '</td>' +
        '<td class="num">' + d.straordFestivi + '</td>' +
        '<td class="num" style="font-weight:800;color:var(--accent-light)">' + d.totale + '</td>' +
        '<td class="num">' + d.oreViaggio + '</td>' +
        '<td class="num">' + d.km + '</td>' +
        '<td class="num">' + d.spese.toFixed(2) + '</td>' +
        '<td class="num">' + d.ferie + '</td>' +
        '<td class="num">' + d.malattia + '</td>' +
        '<td class="num">' + d.voci + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody>' +
    '<tfoot><tr>' +
      '<td style="font-weight:800">TOTALE</td>' +
      '<td class="num">' + tot.ordinario + '</td>' +
      '<td class="num">' + tot.straordFeriali + '</td>' +
      '<td class="num">' + tot.straordFestivi + '</td>' +
      '<td class="num" style="font-weight:800">' + tot.totale + '</td>' +
      '<td class="num">' + tot.oreViaggio + '</td>' +
      '<td class="num">' + tot.km + '</td>' +
      '<td class="num">' + tot.spese.toFixed(2) + '</td>' +
      '<td class="num">' + tot.ferie + '</td>' +
      '<td class="num">' + tot.malattia + '</td>' +
      '<td class="num">' + tot.voci + '</td>' +
    '</tr></tfoot>' +
    '</table>' +
    '</div>' +
    '<div class="scroll-hint">← scorri lateralmente per vedere tutte le colonne →</div>';
}

/************************************************************
 * RIEPILOGO COMMESSE
 ************************************************************/
function renderCommesse(res) {
  if (!res.perCommessa.length) {
    document.getElementById("tblCommesse").innerHTML =
      '<div class="empty"><div class="empty-icon">🏷️</div><div>Nessun dato</div></div>';
    return;
  }

  const comm = res.perCommessa;

  const tot = comm.reduce(function(acc, c) {
    acc.ordinario += c.ordinario;
    acc.straordFeriali += c.straordFeriali;
    acc.straordFestivi += c.straordFestivi;
    acc.totale += c.totale;
    acc.oreViaggio += c.oreViaggio;
    acc.km += c.km;
    acc.spese += c.spese;
    acc.ferie += c.ferie;
    acc.malattia += c.malattia;
    acc.voci += c.voci;
    return acc;
  }, { ordinario: 0, straordFeriali: 0, straordFestivi: 0, totale: 0,
       oreViaggio: 0, km: 0, spese: 0, ferie: 0, malattia: 0, voci: 0 });

  document.getElementById("tblCommesse").innerHTML =
    '<div class="tabella-wrap">' +
    '<table class="tabella tabella-riepilogo">' +
    '<thead><tr>' +
      '<th>Commessa</th>' +
      '<th>Committente</th>' +
      '<th style="text-align:right">Ordinarie</th>' +
      '<th style="text-align:right">Str. Feriale</th>' +
      '<th style="text-align:right">Str. Festivo</th>' +
      '<th style="text-align:right">Totale</th>' +
      '<th style="text-align:right">Ore viaggio</th>' +
      '<th style="text-align:right">Km</th>' +
      '<th style="text-align:right">Spese (€)</th>' +
      '<th style="text-align:right">Ferie</th>' +
      '<th style="text-align:right">Malattia</th>' +
      '<th style="text-align:right">Giorni</th>' +
    '</tr></thead>' +
    '<tbody>' +
    comm.map(function(c) {
      return '<tr>' +
        '<td><strong style="color:var(--accent-light)">#' + esc(c.commessa) + '</strong></td>' +
        '<td>' + esc(c.committente || "—") + (c.cantiere ? ' <span class="comm-extra">' + esc(c.cantiere) + '</span>' : '') + '</td>' +
        '<td class="num">' + c.ordinario + '</td>' +
        '<td class="num">' + c.straordFeriali + '</td>' +
        '<td class="num">' + c.straordFestivi + '</td>' +
        '<td class="num" style="font-weight:800;color:var(--accent-light)">' + c.totale + '</td>' +
        '<td class="num">' + c.oreViaggio + '</td>' +
        '<td class="num">' + c.km + '</td>' +
        '<td class="num">' + c.spese.toFixed(2) + '</td>' +
        '<td class="num">' + c.ferie + '</td>' +
        '<td class="num">' + c.malattia + '</td>' +
        '<td class="num">' + c.voci + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody>' +
    '<tfoot><tr>' +
      '<td colspan="2" style="font-weight:800">TOTALE</td>' +
      '<td class="num">' + tot.ordinario + '</td>' +
      '<td class="num">' + tot.straordFeriali + '</td>' +
      '<td class="num">' + tot.straordFestivi + '</td>' +
      '<td class="num" style="font-weight:800">' + tot.totale + '</td>' +
      '<td class="num">' + tot.oreViaggio + '</td>' +
      '<td class="num">' + tot.km + '</td>' +
      '<td class="num">' + tot.spese.toFixed(2) + '</td>' +
      '<td class="num">' + tot.ferie + '</td>' +
      '<td class="num">' + tot.malattia + '</td>' +
      '<td class="num">' + tot.voci + '</td>' +
    '</tr></tfoot>' +
    '</table>' +
    '</div>' +
    '<div class="scroll-hint">← scorri lateralmente per vedere tutte le colonne →</div>';
}

/************************************************************
 * FORM RIGA
 ************************************************************/
function popolaSelectCommesse() {
  const sel = document.getElementById("f_commessa");
  if (!sel) return;
  const opts = ['<option value="">— seleziona —</option>'];
  STATO.commesseConfig.forEach(function(c) {
    const propLabel = (isAdminPrincipale() && c.proprietario) ? ' [' + c.proprietario + ']' : '';
    opts.push('<option value="' + esc(c.numero) +
      '" data-comm="' + esc(c.committente) +
      '" data-cant="' + esc(c.cantiere) + '">#' + esc(c.numero) +
      ' — ' + esc(c.committente) + propLabel +
      (c.descrizione ? " (" + esc(c.descrizione) + ")" : "") + '</option>');
  });
  opts.push('<option value="__libera__">— inserisci liberamente —</option>');
  sel.innerHTML = opts.join("");
}

function autoFillCommessa() {
  const sel = document.getElementById("f_commessa");
  const opt = sel.options[sel.selectedIndex];
  if (opt.dataset.comm !== undefined) {
    setVal("f_committente", opt.dataset.comm || "");
    if (!val("f_cantiere")) setVal("f_cantiere", opt.dataset.cant || "");
  } else if (sel.value === "__libera__") {
    const num = prompt("Inserisci numero commessa:");
    if (num) {
      const opt2 = document.createElement("option");
      opt2.value = num;
      opt2.textContent = "#" + num;
      sel.insertBefore(opt2, sel.firstChild);
      sel.value = num;
      setVal("f_committente", "");
    } else {
      sel.value = "";
    }
  }
}

function apriForm() {
  STATO.editRowNum = null;
  document.getElementById("modalFormTitle").textContent = "Nuova voce";
  resetForm();
  if (STATO.foglioAttivo) setVal("f_foglio", STATO.foglioAttivo);
  setVal("f_data", todayISO());

  const inputDip = document.getElementById("f_dipendente");
  const selectDip = document.getElementById("f_dipendente_select");

  if (isAdmin()) {
    inputDip.style.display = "none";
    inputDip.removeAttribute("required");
    selectDip.style.display = "block";
    selectDip.setAttribute("required", "required");

    let opts = ['<option value="">— scegli un dipendente —</option>'];
    (STATO.dipendenti || []).forEach(function(d) {
      opts.push('<option value="' + esc(d) + '">' + esc(d) + '</option>');
    });
    opts.push('<option value="__nuovo__">➕ Aggiungi nuovo dipendente…</option>');
    selectDip.innerHTML = opts.join("");
    selectDip.value = "";
  } else {
    inputDip.style.display = "block";
    inputDip.setAttribute("required", "required");
    selectDip.style.display = "none";
    selectDip.removeAttribute("required");
    if (STATO.user && STATO.user.nome) setVal("f_dipendente", STATO.user.nome);
  }

  document.getElementById("modalForm").classList.add("open");
  document.body.style.overflow = "hidden";
}
function chiudiForm() {
  document.getElementById("modalForm").classList.remove("open");
  document.body.style.overflow = "";
}

function onCambiaDipendente() {
  const sel = document.getElementById("f_dipendente_select");
  if (!sel) return;

  if (sel.value === "__nuovo__") {
    const nuovoNome = prompt("Inserisci il nome del nuovo dipendente (es. Mario Rossi):");
    if (nuovoNome && nuovoNome.trim()) {
      const nome = nuovoNome.trim();
      if (!STATO.dipendenti.includes(nome)) {
        STATO.dipendenti.push(nome);
        STATO.dipendenti.sort();
      }
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      const optNuovo = Array.from(sel.options).find(function(o) { return o.value === "__nuovo__"; });
      if (optNuovo) sel.insertBefore(opt, optNuovo);
      else sel.appendChild(opt);
      sel.value = nome;
    } else {
      sel.value = "";
    }
  }
}

async function modificaVoce(rowNum) {
  STATO.editRowNum = rowNum;
  document.getElementById("modalFormTitle").textContent = "Modifica voce";

  let nomeFoglio = val("selettoreMese") || STATO.foglioAttivo || "";
  if (!nomeFoglio) {
    toast("Nessun foglio selezionato", "err");
    return;
  }

  try {
    const d = await callAPI("getRigaDettaglio", {
      token: STATO.token, rowNum: Number(rowNum), foglio: nomeFoglio
    });
    if (!d) {
      toast("Voce non trovata", "err");
      STATO.editRowNum = null;
      return;
    }

    setVal("f_foglio", nomeFoglio);
    setVal("f_data", d.data);

    if (isAdmin()) {
      const sel = document.getElementById("f_dipendente_select");
      const exists = Array.from(sel.options).some(function(o) { return o.value === d.dipendente; });
      if (!exists && d.dipendente) {
        const opt = document.createElement("option");
        opt.value = d.dipendente;
        opt.textContent = d.dipendente;
        const optNuovo = Array.from(sel.options).find(function(o) { return o.value === "__nuovo__"; });
        if (optNuovo) sel.insertBefore(opt, optNuovo);
        else sel.appendChild(opt);
      }
      sel.value = d.dipendente;
    } else {
      setVal("f_dipendente", d.dipendente);
    }

    setVal("f_ordinario", valOrEmpty(d.ordinario));
    setVal("f_straordF", valOrEmpty(d.straordFeriali));
    setVal("f_straordFest", valOrEmpty(d.straordFestivi));
    setVal("f_oreViaggio", valOrEmpty(d.oreViaggio));
    setVal("f_km", valOrEmpty(d.km));
    setVal("f_spese", valOrEmpty(d.spese));
    setVal("f_ferie", valOrEmpty(d.ferie));
    setVal("f_malattia", valOrEmpty(d.malattia));

    setVal("f_cantiere", d.cantiere);
    setVal("f_note", d.note);

    const selComm = document.getElementById("f_commessa");
    const exists = Array.from(selComm.options).some(function(o) { return o.value === d.commessa; });
    if (exists) selComm.value = d.commessa;
    else if (d.commessa) {
      const opt = document.createElement("option");
      opt.value = d.commessa;
      opt.textContent = "#" + d.commessa;
      selComm.insertBefore(opt, selComm.firstChild);
      selComm.value = d.commessa;
    }
    setVal("f_committente", d.committente);

    document.getElementById("modalForm").classList.add("open");
    document.body.style.overflow = "hidden";
  } catch (err) {
    toast("Errore: " + err.message, "err");
    STATO.editRowNum = null;
  }
}

async function salva() {
  const data = val("f_data");

  let dip = "";
  if (isAdmin()) {
    dip = val("f_dipendente_select").trim();
    if (dip === "__nuovo__") dip = "";
  } else {
    dip = val("f_dipendente").trim();
  }

  if (!data) { toast("Inserisci la data", "err"); return; }
  if (!dip) { toast("Inserisci il dipendente", "err"); return; }

  let foglioDest = val("f_foglio") || val("selettoreMese") || STATO.foglioAttivo;
  if (!foglioDest) { toast("Nessun foglio selezionato", "err"); return; }

  const dati = {
    foglio: foglioDest,
    data: data,
    dipendente: dip,
    ordinario: numVal("f_ordinario"),
    straordFeriali: numVal("f_straordF"),
    straordFestivi: numVal("f_straordFest"),
    oreViaggio: numVal("f_oreViaggio"),
    km: numVal("f_km"),
    spese: numVal("f_spese"),
    commessa: val("f_commessa") === "__libera__" ? "" : val("f_commessa"),
    committente: val("f_committente"),
    cantiere: val("f_cantiere"),
    note: val("f_note"),
    ferie: numVal("f_ferie"),
    malattia: numVal("f_malattia")
  };

  const btn = document.getElementById("btnSalva");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span>Salvataggio...';

  const isEdit = STATO.editRowNum !== null;
  const rowNumSalvato = STATO.editRowNum;

  try {
    let res;
    if (isEdit) {
      res = await callAPI("modificaRiga", { token: STATO.token, rowNum: rowNumSalvato, dati: dati });
    } else {
      res = await callAPI("aggiungiRiga", { token: STATO.token, dati: dati });
    }

    if (res.ok) {
      toast("✅ " + res.msg, "ok");
      chiudiForm();
      const kpiEl = document.getElementById("kpi");
      kpiEl.style.opacity = "0.5";
      if (isEdit) { try { aggiornaRigaNelDom(rowNumSalvato, dati); } catch (e) {} }
      await caricaDashboard();
      kpiEl.style.opacity = "1";
      if (!isEdit) {
        const ds = val("f_data"), dsv = val("f_dipendente"), fs = val("f_foglio");
        resetForm();
        setVal("f_data", ds);
        setVal("f_dipendente", dsv);
        setVal("f_foglio", fs);
      }
    } else {
      toast("❌ " + res.msg, "err");
    }
  } catch (err) {
    toast("❌ " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
    STATO.editRowNum = null;
  }
}

function aggiornaRigaNelDom(rowNum, dati) {
  const editBtn = document.querySelector('.row-actions button[onclick*="modificaVoce(' + rowNum + ')"]');
  if (!editBtn) return;
  const tr = editBtn.closest('tr');
  if (!tr) return;

  const ordinario = Number(dati.ordinario) || 0;
  const straordFeriali = Number(dati.straordFeriali) || 0;
  const straordFestivi = Number(dati.straordFestivi) || 0;
  const totale = ordinario + straordFeriali + straordFestivi;

  let dataFormattata = dati.data;
  if (dati.data && dati.data.indexOf("-") !== -1) {
    const p = dati.data.split("-");
    if (p.length === 3) dataFormattata = p[2] + "/" + p[1] + "/" + p[0];
  }

  const mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  let meseNome = "";
  if (dati.data) {
    const p = dati.data.split("-");
    if (p.length === 3) meseNome = mesi[Number(p[1]) - 1];
  }

  const tds = tr.querySelectorAll('td');
  if (tds.length < 16) return;
  function setTd(idx, val) { if (tds[idx]) tds[idx].textContent = val; }
  setTd(0, meseNome); setTd(1, dataFormattata); setTd(2, dati.dipendente || "");
  setTd(3, ordinario); setTd(4, straordFeriali); setTd(5, straordFestivi); setTd(6, totale);
  setTd(7, dati.oreViaggio || ""); setTd(8, dati.km || ""); setTd(9, dati.spese || "");
  setTd(10, dati.commessa || ""); setTd(11, dati.committente || "");
  setTd(12, dati.cantiere || ""); setTd(13, dati.note || "");
  setTd(14, dati.ferie || ""); setTd(15, dati.malattia || "");

  ricalcolaKpiDaDom();
}

function ricalcolaKpiDaDom() {
  const rows = document.querySelectorAll('#tabellaVoci tbody tr');
  if (!rows.length) return;
  let ordinarie = 0, straordFeriali = 0, straordFestivi = 0;
  let oreViaggio = 0, km = 0, spese = 0, ferie = 0, malattia = 0;
  const numRighe = rows.length;
  rows.forEach(function(tr) {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 16) return;
    ordinarie += Number(tds[3].textContent) || 0;
    straordFeriali += Number(tds[4].textContent) || 0;
    straordFestivi += Number(tds[5].textContent) || 0;
    oreViaggio += Number(tds[7].textContent) || 0;   // ← colonna H
    km += Number(tds[8].textContent) || 0;
    spese += Number(tds[9].textContent) || 0;
    ferie += Number(tds[14].textContent) || 0;
    malattia += Number(tds[15].textContent) || 0;
  });
  const totaleOre = ordinarie + straordFeriali + straordFestivi;
  document.getElementById("kpi").innerHTML = [
    kpiCard("Ore totali", totaleOre, ""),
    kpiCard("Ordinarie", ordinarie, "green"),
    kpiCard("Str. Feriale", straordFeriali, "orange"),
    kpiCard("Str. Festivo", straordFestivi, "orange"),
    kpiCard("Ore viaggio", oreViaggio, "purple"),
    kpiCard("Km", km, "purple"),
    kpiCard("Spese", spese.toFixed(2), "slate", "€"),
    kpiCard("Ferie", ferie, "red"),
    kpiCard("Malattia", malattia, "red"),
    kpiCard("Giorni", numRighe, "")
  ].join("");
  ...
}

async function cancellaVoce(rowNum) {
  if (!confirm("Cancellare questa voce?")) return;
  const nomeFoglio = val("selettoreMese");
  try {
    const res = await callAPI("cancellaRiga", { token: STATO.token, rowNum: rowNum, foglio: nomeFoglio });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) caricaDashboard();
  } catch (err) {
    toast("❌ " + err.message, "err");
  }
}

function resetForm() {
  ["f_ordinario","f_straordF","f_straordFest","f_oreViaggio","f_km","f_spese",
   "f_commessa","f_committente","f_cantiere","f_note","f_ferie","f_malattia",
   "f_dipendente"].forEach(function(id) { setVal(id, ""); });

  const selDip = document.getElementById("f_dipendente_select");
  if (selDip) selDip.value = "";

  STATO.editRowNum = null;
}

/************************************************************
 * COMMESSE
 ************************************************************/
function apriCommesse() {
  document.getElementById("modalCommesse").classList.add("open");
  document.body.style.overflow = "hidden";
  caricaCommesse();
}
function chiudiCommesse() {
  document.getElementById("modalCommesse").classList.remove("open");
  document.body.style.overflow = "";
}
async function caricaCommesse() {
  try {
    const lista = await callAPI("getCommesse", { token: STATO.token });
    if (lista.error) { toast(lista.error, "err"); return; }
    STATO.commesseConfig = lista || [];
    if (!lista.length) {
      document.getElementById("listaCommesse").innerHTML =
        '<div class="empty" style="padding:20px"><div>Nessuna commessa configurata</div></div>';
      return;
    }
    document.getElementById("listaCommesse").innerHTML = lista.map(function(c) {
      const extra = [c.committente, c.cantiere].filter(Boolean).join(" • ");
      const propLabel = (isAdminPrincipale() && c.proprietario) ?
        ' <span class="badge-prop">👤 ' + esc(c.proprietario) + '</span>' : '';
      return '<div class="comm-item">' +
        '<div class="info">' +
          '<div class="num">#' + esc(c.numero) + propLabel + '</div>' +
          '<div class="desc">' + esc(extra || "—") + (c.descrizione ? " — " + esc(c.descrizione) : "") + '</div>' +
        '</div>' +
        '<button class="btn-trash" onclick="eliminaCommessa(\'' + esc(c.numero) + '\')" title="Elimina">🗑️</button>' +
      '</div>';
    }).join("");
  } catch (e) {}
}
async function salvaCommessa() {
  const c = {
    numero: val("c_numero").trim(),
    committente: val("c_committente").trim(),
    cantiere: val("c_cantiere").trim(),
    descrizione: val("c_descrizione").trim()
  };
  if (!c.numero) { toast("Numero obbligatorio", "err"); return; }
  try {
    const res = await callAPI("aggiungiCommessa", { token: STATO.token, dati: c });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) {
      ["c_numero","c_committente","c_cantiere","c_descrizione"].forEach(function(id) { setVal(id, ""); });
      caricaCommesse();
      caricaDashboard();
    }
  } catch (e) {}
}
async function eliminaCommessa(numero) {
  if (!confirm("Eliminare la commessa #" + numero + "?")) return;
  try {
    const res = await callAPI("eliminaCommessa", { token: STATO.token, numero: numero });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) { caricaCommesse(); caricaDashboard(); }
  } catch (e) {}
}

/************************************************************
 * MESI
 ************************************************************/
function apriMesi() {
  document.getElementById("modalMesi").classList.add("open");
  document.body.style.overflow = "hidden";
  caricaFogliMesi();
}
function chiudiMesi() {
  document.getElementById("modalMesi").classList.remove("open");
  document.body.style.overflow = "";
}
async function caricaFogliMesi() {
  try {
    const fogli = await callAPI("getFogliDati");
    STATO.fogliMesi = fogli || [];
    if (!fogli.length) {
      document.getElementById("listaFogli").innerHTML =
        '<div class="empty" style="padding:20px"><div>Nessun foglio</div></div>';
      return;
    }
    document.getElementById("listaFogli").innerHTML = fogli.map(function(f) {
      const isAttivo = (f === STATO.foglioAttivo);
      return '<div class="comm-item">' +
        '<div class="info">' +
          '<div class="num">' + esc(f) + (isAttivo ? ' <span style="color:#10b981;font-size:.75rem">●</span>' : '') + '</div>' +
          '<div class="desc">' + (isAttivo ? "Foglio attivo" : "Tocca per attivare") + '</div>' +
        '</div>' +
        (isAttivo ? "" : '<button class="btn btn-primary btn-sm" onclick="attivaFoglio(\'' + esc(f) + '\')">Attiva</button>') +
      '</div>';
    }).join("");
  } catch (e) {}
}
async function attivaFoglio(nome) {
  try {
    const res = await callAPI("setFoglioAttivo", { nome: nome });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) {
      STATO.foglioAttivo = nome;
      document.getElementById("foglioAttivoLabel").textContent = nome;
      caricaFogliMesi();
      caricaDashboard();
    }
  } catch (e) {}
}
async function creaNuovoMese() {
  const nome = val("nuovoMeseNome").trim() || val("nuovoMeseSelect");
  if (!nome) { toast("Seleziona o scrivi un nome", "err"); return; }
  if (!confirm("Creare il foglio '" + nome + "'?")) return;
  try {
    const res = await callAPI("creaFoglioMese", { nome: nome });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) { caricaFogliMesi(); caricaDashboard(); }
  } catch (e) {}
}

/************************************************************
 * ADMIN
 ************************************************************/
function apriAdmin() {
  if (!isAdmin()) return;

  document.getElementById("modalAdmin").classList.add("open");
  document.body.style.overflow = "hidden";

  if (isAdminPrincipale()) {
    const emailSection = document.getElementById("adminEmailSection");
    if (emailSection) emailSection.style.display = "block";

    callAPI("getEmailConfig", { token: STATO.token }).then(function(cfg) {
      if (cfg.error) { toast(cfg.error, "err"); return; }
      setVal("adm_email_dest", cfg.destinatari || "");
      setVal("adm_email_ogg", cfg.oggetto || "");
      setVal("adm_email_corpo", cfg.corpo || "");
    }).catch(function() {});
  } else {
    const emailSection = document.getElementById("adminEmailSection");
    if (emailSection) emailSection.style.display = "none";
  }

  aggiornaFormUtente();
  caricaUtenti();
}

function aggiornaFormUtente() {
  const selRuolo = document.getElementById("adm_user_ruolo");
  if (!selRuolo) return;

  if (isAdminPrincipale()) {
    selRuolo.innerHTML =
      '<option value="utente">Utente</option>' +
      '<option value="admin">Amministratore (secondario)</option>';
    selRuolo.disabled = false;
  } else {
    selRuolo.innerHTML = '<option value="utente">Utente</option>';
    selRuolo.value = "utente";
    selRuolo.disabled = true;
  }
}

function chiudiAdmin() {
  document.getElementById("modalAdmin").classList.remove("open");
  document.body.style.overflow = "";
}
async function salvaEmailAdmin() {
  const cfg = {
    destinatari: val("adm_email_dest").trim(),
    oggetto: val("adm_email_ogg").trim(),
    corpo: val("adm_email_corpo").trim()
  };
  try {
    const res = await callAPI("salvaEmailConfig", { token: STATO.token, cfg: cfg });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
  } catch (e) {}
}
async function caricaUtenti() {
  try {
    const utenti = await callAPI("getUtenti", { token: STATO.token });
    if (utenti.error) { toast(utenti.error, "err"); return; }
    if (!utenti.length) {
      document.getElementById("listaUtenti").innerHTML =
        '<div class="empty" style="padding:20px"><div>Nessun utente</div></div>';
      return;
    }
    document.getElementById("listaUtenti").innerHTML = utenti.map(function(u) {
      let badge = "";
      if (u.adminPrincipale) badge = ' <span class="badge-principale">👑 PRINCIPALE</span>';
      else if (u.ruolo === "admin") badge = ' <span class="badge-secondario">🔧 ADMIN</span>';

      const creatoDaLabel = (u.creatoDa && u.creatoDa !== STATO.user.email.toLowerCase() && u.creatoDa !== "system")
        ? ' <span style="font-size:.68rem;color:#94a3b8">· creato da ' + esc(u.creatoDa) + '</span>'
        : "";

      const puoEliminare = !u.adminPrincipale && u.email !== STATO.user.email.toLowerCase();

      return '<div class="comm-item">' +
        '<div class="info">' +
          '<div class="num">' + esc(u.nome) + badge + '</div>' +
          '<div class="desc">' + esc(u.email) + creatoDaLabel + '</div>' +
        '</div>' +
        (puoEliminare
          ? '<button class="btn-trash" onclick="eliminaUtenteAdmin(\'' + esc(u.email) + '\')" title="Elimina">🗑️</button>'
          : '') +
      '</div>';
    }).join("");
  } catch (e) {}
}
async function aggiungiUtenteAdmin() {
  const u = {
    email: val("adm_user_email").trim(),
    nome: val("adm_user_nome").trim(),
    password: val("adm_user_pwd"),
    ruolo: val("adm_user_ruolo")
  };

  if (!isAdminPrincipale()) {
    u.ruolo = "utente";
  }

  if (!u.email) { toast("Email obbligatoria", "err"); return; }
  if (!u.password || u.password.length < 6) { toast("Password min 6 caratteri", "err"); return; }

  try {
    const res = await callAPI("aggiungiUtente", { token: STATO.token, dati: u });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) {
      ["adm_user_email","adm_user_nome","adm_user_pwd"].forEach(function(id) { setVal(id, ""); });
      caricaUtenti();
      caricaDipendenti();
    }
  } catch (e) {}
}
async function eliminaUtenteAdmin(email) {
  if (!confirm("Eliminare l'utente " + email + "?")) return;
  try {
    const res = await callAPI("eliminaUtente", { token: STATO.token, email: email });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) caricaUtenti();
  } catch (e) {}
}

/************************************************************
 * LOG ATTIVITÀ
 ************************************************************/
function apriLog() {
  if (!isAdminPrincipale()) return;
  document.getElementById("modalLog").classList.add("open");
  document.body.style.overflow = "hidden";
  caricaLog();
}
function chiudiLog() {
  document.getElementById("modalLog").classList.remove("open");
  document.body.style.overflow = "";
}
async function caricaLog() {
  try {
    const lista = await callAPI("getLog", { token: STATO.token, limite: 200 });
    if (lista.error) { toast(lista.error, "err"); return; }
    if (!lista.length) {
      document.getElementById("listaLog").innerHTML =
        '<div class="empty" style="padding:20px"><div>Nessuna attività registrata</div></div>';
      return;
    }
    document.getElementById("listaLog").innerHTML = lista.map(function(l) {
      return '<div class="log-item">' +
        '<div class="log-header">' +
          '<span class="log-azione">' + esc(l.azione) + '</span>' +
          '<span class="log-time">' + esc(l.timestamp) + '</span>' +
        '</div>' +
        '<div class="log-body">' +
          '<div><strong>👤</strong> ' + esc(l.utente) + '</div>' +
          (l.foglio ? '<div><strong>📄</strong> ' + esc(l.foglio) + (l.riga ? ' (riga ' + esc(l.riga) + ')' : '') + '</div>' : '') +
          (l.dettagli ? '<div class="log-dettagli">' + esc(l.dettagli) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join("");
  } catch (e) {}
}

/************************************************************
 * EMAIL
 ************************************************************/
async function inviaEmail() {
  if (isAdminPrincipale()) {
    toast("L'admin principale non invia email, le riceve soltanto", "err");
    return;
  }

  // Leggi i destinatari configurati dal server
  let destinatariLabel = "amministratore";
  try {
    const cfg = await callAPI("getEmailDestinatari", { token: STATO.token });
    if (cfg && cfg.destinatari) {
      destinatariLabel = cfg.destinatari;
    }
  } catch (e) {
    // Se fallisce, usa un messaggio generico
  }

  if (!confirm("Inviare le tue ore a:\n\n" + destinatariLabel + "?")) return;

  EMAIL_STATO.mode = "proprie";
  apriEmailMese();
}

function apriEmailMese() {
  const fogli = STATO.fogliMesi || [];
  if (!fogli.length) { toast("Nessun foglio disponibile", "err"); return; }

  const foglioCorrente = val("selettoreMese") || STATO.foglioAttivo || fogli[0];
  EMAIL_STATO.foglioScelto = foglioCorrente;

  const container = document.getElementById("listaMesiEmail");
  container.innerHTML = fogli.map(function(f) {
    const isSelected = (f === foglioCorrente);
    const isCurrent = (f === foglioCorrente);
    return '<button type="button" class="mese-email-item ' + (isSelected ? 'selected' : '') + '" ' +
      'onclick="selezionaMeseEmail(\'' + esc(f).replace(/'/g, "\\'") + '\', this)">' +
      '<span class="radio-circle"></span>' +
      '<span class="mese-nome">' + esc(f) +
        (isCurrent ? ' <span class="badge-corrente">corrente</span>' : '') +
      '</span>' +
      '</button>';
  }).join("");

  document.getElementById("modalEmailMese").classList.add("open");
  document.body.style.overflow = "hidden";
}

function selezionaMeseEmail(nomeFoglio, el) {
  EMAIL_STATO.foglioScelto = nomeFoglio;
  document.querySelectorAll("#listaMesiEmail .mese-email-item").forEach(function(item) {
    item.classList.remove("selected");
  });
  if (el) el.classList.add("selected");
}

function chiudiEmailMese() {
  document.getElementById("modalEmailMese").classList.remove("open");
  document.body.style.overflow = "";
  EMAIL_STATO.mode = null;
  EMAIL_STATO.foglioScelto = null;
}

async function confermaInvioEmail() {
  if (!EMAIL_STATO.foglioScelto) { toast("Seleziona un mese", "err"); return; }

  const btn = document.getElementById("btnEmailConferma");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Invio...';

  try {
    const res = await callAPI("inviaEmail", {
      token: STATO.token,
      mode: EMAIL_STATO.mode,
      foglio: EMAIL_STATO.foglioScelto
    });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
    if (res.ok) chiudiEmailMese();
  } catch (err) {
    toast("❌ " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

/************************************************************
 * EVENTI
 ************************************************************/
document.getElementById("nuovoMeseSelect").addEventListener("change", function(e) {
  setVal("nuovoMeseNome", e.target.value);
});

document.querySelectorAll(".modal-overlay").forEach(function(ov) {
  ov.addEventListener("click", function(e) {
    if (e.target === ov) {
      ov.classList.remove("open");
      document.body.style.overflow = "";
    }
  });
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach(function(ov) {
      ov.classList.remove("open");
    });
    document.body.style.overflow = "";
  }
});

document.getElementById("login_password").addEventListener("keypress", function(e) {
  if (e.key === "Enter") faiLogin();
});
document.getElementById("login_email").addEventListener("keypress", function(e) {
  if (e.key === "Enter") document.getElementById("login_password").focus();
});


/************************************************************
 * PULSANTE INSTALLA APP (PWA)
 ************************************************************/
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", function(e) {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("btnInstall");
  if (btn) btn.style.display = "inline-flex";
});

async function installaApp() {
  if (!deferredPrompt) {
    alert("L'app è già installata oppure il browser non supporta l'installazione automatica.\n\nSu iPhone/iPad: apri il sito in Safari, tocca Condividi (⬆️) e scegli 'Aggiungi a schermata Home'.");
    return;
  }
  deferredPrompt.prompt();
  const choiceResult = await deferredPrompt.userChoice;
  console.log("Scelta utente:", choiceResult.outcome);
  deferredPrompt = null;
  const btn = document.getElementById("btnInstall");
  if (btn) btn.style.display = "none";
}

window.addEventListener("appinstalled", function() {
  const btn = document.getElementById("btnInstall");
  if (btn) btn.style.display = "none";
  deferredPrompt = null;
});

if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
  const btn = document.getElementById("btnInstall");
  if (btn) btn.style.display = "none";
}

/************************************************************
 * TOGGLE TEMA CHIARO/SCURO
 ************************************************************/
(function initTheme() {
  const savedTheme = localStorage.getItem("ore_theme") || "dark";
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
  }
  updateThemeIcon(savedTheme);
})();

function toggleTheme() {
  const isLight = document.body.classList.toggle("light-theme");
  const newTheme = isLight ? "light" : "dark";
  try { localStorage.setItem("ore_theme", newTheme); } catch (e) {}
  updateThemeIcon(newTheme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", newTheme === "light" ? "#f1f5f9" : "#0f1420");
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("iconTheme");
  if (!icon) return;
  if (theme === "light") {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

/************************************************************
 * REFRESH AUTOMATICO
 ************************************************************/
let ULTIMO_REFRESH = 0;
const INTERVALLO_MIN_REFRESH = 5000;

function refreshDashboard() {
  const btn = document.getElementById("btnRefresh");
  if (btn) {
    const icon = btn.querySelector("svg");
    if (icon) {
      icon.style.transition = "transform 0.6s ease";
      icon.style.transform = "rotate(360deg)";
      setTimeout(function() { icon.style.transition = ""; icon.style.transform = ""; }, 600);
    }
  }
  ULTIMO_REFRESH = Date.now();
  const kpiEl = document.getElementById("kpi");
  if (kpiEl) kpiEl.style.opacity = "0.5";
  caricaDashboard().then(function() {
    if (kpiEl) kpiEl.style.opacity = "1";
    toast("🔄 Dati aggiornati", "ok");
  }).catch(function(err) {
    if (kpiEl) kpiEl.style.opacity = "1";
    toast("❌ " + err.message, "err");
  });
}

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    const ora = Date.now();
    if (ora - ULTIMO_REFRESH > INTERVALLO_MIN_REFRESH) {
      ULTIMO_REFRESH = ora;
      setTimeout(function() {
        if (STATO.token && document.getElementById("appScreen").style.display !== "none") {
          caricaDashboard();
        }
      }, 300);
    }
  }
});

window.addEventListener("focus", function() {
  const ora = Date.now();
  if (ora - ULTIMO_REFRESH > INTERVALLO_MIN_REFRESH) {
    ULTIMO_REFRESH = ora;
    if (STATO.token && document.getElementById("appScreen").style.display !== "none") {
      caricaDashboard();
    }
  }
});


/************************************************************
 * AUTO-UPDATE SERVICE WORKER
 * Rileva quando c'è una nuova versione e ricarica la pagina
 ************************************************************/
if ("serviceWorker" in navigator) {
  // Registra il service worker e gestisci gli aggiornamenti
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("/Ore/sw.js").then(function(registration) {
      // Controlla aggiornamenti ogni 60 secondi
      setInterval(function() {
        registration.update();
      }, 60000);

      // Quando trova un aggiornamento...
      registration.addEventListener("updatefound", function() {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", function() {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // C'è una nuova versione pronta
            console.log("[SW] Nuova versione disponibile, ricarico...");

            // Mostra un toast all'utente
            if (typeof toast === "function") {
              toast("🔄 Aggiornamento in corso...", "ok");
            }

            // Ricarica dopo 1 secondo
            setTimeout(function() {
              window.location.reload();
            }, 1000);
          }
        });
      });
    }).catch(function(err) {
      console.warn("[SW] Errore registrazione:", err);
    });

    // Quando il SW prende il controllo, ricarica (una sola volta)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", function() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}




