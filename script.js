/************************************************************
 * CONFIGURAZIONE
 * ⚠️ SOSTITUISCI L'URL QUI SOTTO CON IL TUO URL /exec
 ************************************************************/
const API_URL = "https://script.google.com/macros/s/AKfycbx_FuxRsRlXwuNryKtaLxcTD5THZV7qDjBmUfyaPKpho-YvZPKKN9TxCaUf-wfNAuFsUQ/exec?authuser=elettimp@gmail.com";

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
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function switchInner(name, el) {
  document.querySelectorAll(".segment").forEach(function(t) { t.classList.remove("active"); });
  el.classList.add("active");
  ["voci", "dip", "comm"].forEach(function(n) {
    document.getElementById("inner-" + n).style.display = (n === name) ? "block" : "none";
  });
}

/************************************************************
 * API CALL — JSONP (bypassa CORS)
 ************************************************************/
function callAPI(action, params) {
  params = params || {};
  return new Promise(function(resolve, reject) {
    const callbackName = "jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

    const timeout = setTimeout(function() {
      cleanup();
      reject(new Error("Timeout: il server non risponde"));
    }, 30000);

    const script = document.createElement("script");

    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };

    function cleanup() {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
    }

    const queryParams = new URLSearchParams();
    queryParams.append("action", action);
    queryParams.append("callback", callbackName);
    queryParams.append("payload", JSON.stringify(params));

    script.src = API_URL + "?" + queryParams.toString();
    script.onerror = function() {
      cleanup();
      reject(new Error("Errore di rete"));
    };

    document.body.appendChild(script);
  });
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

  if (STATO.user.ruolo === "admin") document.body.classList.add("is-admin");

  document.getElementById("userBadge").textContent =
    STATO.user.nome + " • " + (STATO.user.ruolo === "admin" ? "Amministratore" : "Utente");

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
  document.getElementById("boxFiltroDip").style.display =
    (STATO.user && STATO.user.ruolo === "admin") ? "block" : "none";
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
      kpiCard("Straordinarie", r.straordFeriali + r.straordFestivi, "orange"),
      kpiCard("Km", r.km, "purple"),
      kpiCard("Spese", r.spese.toFixed(2), "slate", "€"),
      kpiCard("Ferie", r.ferie, "red"),
      kpiCard("Malattia", r.malattia, "red"),
      kpiCard("Voci", r.numRighe, "")
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
    optsComm.push('<option value="' + esc(c.numero) + '">#' + esc(c.numero) + ' — ' + esc(c.committente) + '</option>');
  });
  selComm.innerHTML = optsComm.join("");
  if (curComm) selComm.value = curComm;
}

/************************************************************
 * TABELLA VOCI
 ************************************************************/
function renderTabellaVoci(res) {
  document.getElementById("countVoci").textContent = res.rows.length + " voci";
  const isAdmin = res.user && res.user.ruolo === "admin";

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
    if (isAdmin) {
      html += '<button class="del" title="Cancella" onclick="cancellaVoce(' + v.rowNum + ')">🗑️</button>';
    }
    html += '</td>';
    html += "</tr>";
  });

  const r = res.riepilogo;
  const totStyle = "background:#f8fafc;font-weight:800;color:#1e40af;border-top:2px solid #e2e8f0;";
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
 * DIPENDENTI / COMMESSE
 ************************************************************/
function renderDipendenti(res) {
  if (!res.perDipendente.length) {
    document.getElementById("tblDipendenti").innerHTML =
      '<div class="empty"><div class="empty-icon">👥</div><div>Nessun dato</div></div>';
    return;
  }
  document.getElementById("tblDipendenti").innerHTML =
    '<table class="agg"><thead><tr>' +
    '<th>Dipendente</th><th style="text-align:right">Ore</th>' +
    '<th style="text-align:right">Km</th><th style="text-align:right">Spese</th>' +
    '<th style="text-align:right">Ferie</th><th style="text-align:right">Malattia</th>' +
    '</tr></thead><tbody>' +
    res.perDipendente.map(function(d) {
      return '<tr>' +
        '<td class="dip-name">' + esc(d.dipendente) + '</td>' +
        '<td class="num">' + d.ore + '</td>' +
        '<td class="num">' + d.km + '</td>' +
        '<td class="num">' + d.spese.toFixed(2) + ' €</td>' +
        '<td class="num">' + d.ferie + '</td>' +
        '<td class="num">' + d.malattia + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody></table>';
}

function renderCommesse(res) {
  if (!res.perCommessa.length) {
    document.getElementById("tblCommesse").innerHTML =
      '<div class="empty"><div class="empty-icon">🏷️</div><div>Nessun dato</div></div>';
    return;
  }
  document.getElementById("tblCommesse").innerHTML =
    '<table class="agg"><thead><tr>' +
    '<th>Commessa</th><th style="text-align:right">Ore</th>' +
    '<th style="text-align:right">Km</th><th style="text-align:right">Spese</th>' +
    '<th style="text-align:right">Voci</th>' +
    '</tr></thead><tbody>' +
    res.perCommessa.map(function(c) {
      const extra = [c.committente, c.cantiere].filter(Boolean).join(" • ");
      return '<tr>' +
        '<td><div style="font-weight:700;color:#1e40af">#' + esc(c.commessa) + '</div>' +
        (extra ? '<div class="comm-extra">' + esc(extra) + '</div>' : '') + '</td>' +
        '<td class="num">' + c.ore + '</td>' +
        '<td class="num">' + c.km + '</td>' +
        '<td class="num">' + c.spese.toFixed(2) + ' €</td>' +
        '<td class="num">' + c.voci + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody></table>';
}

/************************************************************
 * FORM
 ************************************************************/
function popolaSelectCommesse() {
  const sel = document.getElementById("f_commessa");
  if (!sel) return;
  const opts = ['<option value="">— seleziona —</option>'];
  STATO.commesseConfig.forEach(function(c) {
    opts.push('<option value="' + esc(c.numero) +
      '" data-comm="' + esc(c.committente) +
      '" data-cant="' + esc(c.cantiere) + '">#' + esc(c.numero) +
      ' — ' + esc(c.committente) +
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
  document.getElementById("modalFormTitle").textContent = "➕ Nuova voce";
  resetForm();
  if (STATO.foglioAttivo) setVal("f_foglio", STATO.foglioAttivo);
  setVal("f_data", todayISO());
  if (STATO.user && STATO.user.nome) setVal("f_dipendente", STATO.user.nome);
  document.getElementById("modalForm").classList.add("open");
  document.body.style.overflow = "hidden";
}
function chiudiForm() {
  document.getElementById("modalForm").classList.remove("open");
  document.body.style.overflow = "";
}

async function modificaVoce(rowNum) {
  STATO.editRowNum = rowNum;
  document.getElementById("modalFormTitle").textContent = "✏️ Modifica voce";
  const nomeFoglio = val("selettoreMese");

  try {
    const d = await callAPI("getRigaDettaglio", {
      token: STATO.token, rowNum: rowNum, foglio: nomeFoglio
    });
    if (!d) { toast("Voce non trovata", "err"); return; }

    setVal("f_foglio", nomeFoglio);
    setVal("f_data", d.data);
    setVal("f_dipendente", d.dipendente);
    setVal("f_ordinario", d.ordinario);
    setVal("f_straordF", d.straordFeriali);
    setVal("f_straordFest", d.straordFestivi);
    setVal("f_oreViaggio", d.oreViaggio);
    setVal("f_km", d.km);
    setVal("f_spese", d.spese);
    setVal("f_cantiere", d.cantiere);
    setVal("f_note", d.note);
    setVal("f_ferie", d.ferie);
    setVal("f_malattia", d.malattia);

    const sel = document.getElementById("f_commessa");
    const exists = Array.from(sel.options).some(function(o) { return o.value === d.commessa; });
    if (exists) sel.value = d.commessa;
    else if (d.commessa) {
      const opt = document.createElement("option");
      opt.value = d.commessa;
      opt.textContent = "#" + d.commessa;
      sel.insertBefore(opt, sel.firstChild);
      sel.value = d.commessa;
    }
    setVal("f_committente", d.committente);

    document.getElementById("modalForm").classList.add("open");
    document.body.style.overflow = "hidden";
  } catch (err) {
    toast("Errore: " + err.message, "err");
  }
}

async function salva() {
  const data = val("f_data");
  const dip = val("f_dipendente").trim();
  if (!data) { toast("Inserisci la data", "err"); return; }
  if (!dip) { toast("Inserisci il dipendente", "err"); return; }

  const dati = {
    foglio: val("f_foglio"),
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

  try {
    let res;
    if (STATO.editRowNum !== null) {
      res = await callAPI("modificaRiga", { token: STATO.token, rowNum: STATO.editRowNum, dati: dati });
    } else {
      res = await callAPI("aggiungiRiga", { token: STATO.token, dati: dati });
    }
    if (res.ok) {
      toast("✅ " + res.msg, "ok");
      chiudiForm();
      caricaDashboard();
    } else {
      toast("❌ " + res.msg, "err");
    }
  } catch (err) {
    toast("❌ " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
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
  setVal("f_ordinario", 8);
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
    const lista = await callAPI("getCommesse");
    STATO.commesseConfig = lista || [];
    if (!lista.length) {
      document.getElementById("listaCommesse").innerHTML =
        '<div class="empty" style="padding:20px"><div>Nessuna commessa configurata</div></div>';
      return;
    }
    document.getElementById("listaCommesse").innerHTML = lista.map(function(c) {
      const extra = [c.committente, c.cantiere].filter(Boolean).join(" • ");
      return '<div class="comm-item">' +
        '<div class="info">' +
          '<div class="num">#' + esc(c.numero) + '</div>' +
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
          '<div class="num">' + esc(f) + (isAttivo ? ' <span style="color:#059669;font-size:.75rem">●</span>' : '') + '</div>' +
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
  if (!STATO.user || STATO.user.ruolo !== "admin") return;
  document.getElementById("modalAdmin").classList.add("open");
  document.body.style.overflow = "hidden";

  callAPI("getEmailConfig", { token: STATO.token }).then(function(cfg) {
    if (cfg.error) { toast(cfg.error, "err"); return; }
    setVal("adm_email_dest", cfg.destinatari || "");
    setVal("adm_email_ogg", cfg.oggetto || "");
    setVal("adm_email_corpo", cfg.corpo || "");
  }).catch(function() {});

  caricaUtenti();
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
      return '<div class="comm-item">' +
        '<div class="info">' +
          '<div class="num">' + esc(u.nome) + ' <span style="font-size:.7rem;color:#64748b">(' + esc(u.ruolo) + ')</span></div>' +
          '<div class="desc">' + esc(u.email) + '</div>' +
        '</div>' +
        '<button class="btn-trash" onclick="eliminaUtenteAdmin(\'' + esc(u.email) + '\')" title="Elimina">🗑️</button>' +
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
 * EMAIL
 ************************************************************/
async function inviaEmail() {
  const isAdmin = STATO.user && STATO.user.ruolo === "admin";
  let mode;
  if (isAdmin) {
    const scelta = confirm("OK = invia a TUTTI i destinatari configurati\nAnnulla = invia solo a te");
    mode = scelta ? "admin" : "proprie";
  } else {
    if (!confirm("Inviare le tue ore via email?")) return;
    mode = "proprie";
  }

  const btn = document.getElementById("btnEmail");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Invio in corso...';

  try {
    const res = await callAPI("inviaEmail", { token: STATO.token, mode: mode });
    toast(res.ok ? "✅ " + res.msg : "❌ " + res.msg, res.ok ? "ok" : "err");
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
 * SERVICE WORKER (PWA)
 ************************************************************/
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./sw.js").catch(function(err) {
      console.warn("SW non registrato:", err);
    });
  });
}
