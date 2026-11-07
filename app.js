// Desafio da Água: lógica do app.
// A configuração (URL, chaves) fica no config.js. O visual fica no app.css.
// Este arquivo é carregado no fim do index.html, depois da biblioteca do Supabase e do config.js.

// ====== CONFIGURAÇÃO: fica no config.js (não edite aqui) ======
const CFG = window.APP_CONFIG || {};
const SUPABASE_URL = String(CFG.SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL");
const SUPABASE_ANON_KEY = String(CFG.SUPABASE_ANON_KEY || "COLE_AQUI_A_ANON_KEY");
const VAPID_PUBLIC_KEY = String(CFG.VAPID_PUBLIC_KEY || "COLE_AQUI_A_CHAVE_PUBLICA_VAPID");
const GOAL = parseInt(CFG.GOAL, 10) > 0 ? parseInt(CFG.GOAL, 10) : 2000;
const REQUIRE_PHOTO_ALL = CFG.REQUIRE_PHOTO_ALL === true;
// ==============================================================

const $ = id => document.getElementById(id);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const note = (t, ok) => { const n = $("note"); n.textContent = t || ""; n.className = ok ? "ok" : ""; };
window.addEventListener("error", e => note("Erro: " + (e.message || "desconhecido")));
window.addEventListener("unhandledrejection", e => note("Erro: " + ((e.reason && e.reason.message) || "desconhecido")));

let sb = null, configError = "";
if (!window.APP_CONFIG) {
  configError = "Não encontrei o config.js. Envie o arquivo config.js (preenchido) junto com o index.html.";
} else if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim())) {
  configError = "A SUPABASE_URL parece errada. Ela deve ser parecida com https://abcdxyz.supabase.co (a Project URL, sem nada depois).";
} else if (SUPABASE_ANON_KEY.trim().length < 20 || /COLE_AQUI/.test(SUPABASE_ANON_KEY)) {
  configError = "A SUPABASE_ANON_KEY parece errada ou vazia. Cole a chave publishable (sb_publishable_...) ou a anon.";
} else if (typeof supabase === "undefined") {
  configError = "Não consegui carregar a biblioteca do Supabase. Verifique a internet ou desative bloqueadores de anúncios.";
} else {
  try { sb = supabase.createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim()); }
  catch (e) { configError = "Erro ao iniciar o Supabase: " + (e && e.message ? e.message : e); }
}

const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

let day = today(), me = null, myName = "", myGoal = GOAL, myEmailFreq = "none", myReminder = 0, winnerKey = "", logs = [], pending = 500, started = null, signup = false, channel = null;
let myGroups = [], group = null, members = [], reacts = {}, openLogs = {}, hist = [], period = "day", histKey = "";
function cleanBottles(list) {
  if (!Array.isArray(list)) return null;
  const out = list.map(b => ({ name: String((b && b.name) || "").trim().slice(0, 20), ml: parseInt(b && b.ml, 10) }))
    .filter(b => b.name && b.ml >= 50 && b.ml <= 5000).slice(0, 6);
  return out.length ? out : null;
}
let bottles = (() => {
  try { const c = cleanBottles(JSON.parse(lsGet("agua-bottles") || "null")); if (c) return c; } catch (e) {}
  return [{ name: "Garrafinha", ml: parseInt(lsGet("agua-bottle"), 10) || 500 }];
})();

$("date").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

// convite pelo link (?convite=CODIGO): guarda até a pessoa entrar/criar conta
const inviteParam = (new URLSearchParams(location.search).get("convite") || "").trim().toLowerCase();
if (inviteParam) lsSet("agua-invite", inviteParam);

let lastScreen = "groups";
function screen(name) {
  ["auth", "groups", "app", "profile", "install"].forEach(s => $(s).hidden = s !== name);
  if (name !== "profile" && name !== "install") lastScreen = name;
  $("profileBtn").hidden = name === "auth" || name === "profile" || name === "install";
  updateInstallBtn(name);
  window.scrollTo(0, 0);
}

// ---------- Login ----------
function setMode(isSignup) {
  signup = isSignup;
  $("authTitle").textContent = isSignup ? "Criar conta" : "Entrar";
  $("aName").hidden = !isSignup;
  $("aGo").textContent = isSignup ? "Criar conta" : "Entrar";
  $("aSwitch").textContent = isSignup ? "Já tenho conta" : "Não tenho conta";
  $("aPass").autocomplete = isSignup ? "new-password" : "current-password";
  $("aMsg").textContent = "";
}
$("aSwitch").onclick = () => setMode(!signup);

$("aGo").onclick = async () => {
  const email = $("aEmail").value.trim(), pass = $("aPass").value, name = $("aName").value.trim();
  if (!email || !pass || (signup && (!name || pass.length < 8))) { $("aMsg").textContent = "Preencha tudo (a senha de uma conta nova precisa de 8+ caracteres)."; return; }
  $("aGo").disabled = true; $("aMsg").textContent = "";
  try {
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: {
          data: { name },
          // o link do e-mail volta para este mesmo endereço (e mantém o convite, se houver)
          emailRedirectTo: location.origin + location.pathname + (lsGet("agua-invite") ? "?convite=" + encodeURIComponent(lsGet("agua-invite")) : "")
        } });
      if (error) throw error;
      if (!data.session) $("aMsg").textContent = "Conta criada! Confirme pelo e-mail que enviamos e depois entre.";
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    }
  } catch (e) { $("aMsg").textContent = e.message || "Erro ao entrar."; }
  $("aGo").disabled = false;
};

const logout = () => sb.auth.signOut();
$("logout").onclick = logout;

function showAuth() {
  started = null; group = null; myGroups = [];
  if (channel) { sb.removeChannel(channel); channel = null; }
  screen("auth");
  const hasInvite = !!lsGet("agua-invite");
  setMode(hasInvite);
  if (hasInvite) $("aMsg").textContent = "Você foi convidado! Crie sua conta (ou entre, se já tiver) para participar do grupo.";
}

if (sb) sb.auth.onAuthStateChange((_ev, session) => {
  if (session && session.user) {
    if (started === session.user.id) return;
    me = session.user; started = me.id;
    setTimeout(afterLogin, 0); // evita chamar o Supabase dentro do callback de auth
  } else { me = null; showAuth(); }
});

// ---------- Grupos ----------
async function afterLogin() {
  let data = null;
  // tenta do mais completo ao mais simples (bancos sem alguma migração continuam funcionando)
  for (const cols of ["name,goal_ml,email_freq,reminder_every,avatar_emoji,avatar_color,avatar_path,bottles", "name,goal_ml,email_freq,reminder_every,avatar_emoji,avatar_color,avatar_path", "name,goal_ml,email_freq,reminder_every", "name,goal_ml"]) {
    const r = await sb.from("profiles").select(cols).eq("id", me.id).maybeSingle();
    if (!r.error) { data = r.data; break; }
  }
  const bs = cleanBottles(data && data.bottles);
  if (bs) { bottles = bs; lsSet("agua-bottles", JSON.stringify(bottles)); }
  myAvatar = { emoji: (data && data.avatar_emoji) || null, color: (data && data.avatar_color) || null, path: (data && data.avatar_path) || null };
  myName = (data && data.name) || me.email.split("@")[0];
  myGoal = (data && data.goal_ml) || GOAL;
  myEmailFreq = (data && data.email_freq) || "none";
  myReminder = (data && data.reminder_every) || 0;
  await usePendingInvite();
  await loadGroups();
  const saved = lsGet("agua-group");
  const g = myGroups.find(x => x.id === saved) || (myGroups.length === 1 ? myGroups[0] : null);
  if (g) openGroup(g); else showGroups();
  maybeShowInstallOnce();
}

async function usePendingInvite() {
  const code = lsGet("agua-invite");
  if (!code) return;
  const { data, error } = await sb.rpc("join_group", { code });
  lsDel("agua-invite");
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  if (error) { note("Esse convite não é válido (ou foi trocado). Peça um link novo."); return; }
  lsSet("agua-group", data.id);
}

async function loadGroups() {
  let { data, error } = await sb.from("members").select("groups(id,name,invite_code,owner_id,require_photo,goal_ml)").eq("user_id", me.id);
  if (error) ({ data, error } = await sb.from("members").select("groups(id,name,invite_code,owner_id)").eq("user_id", me.id)); // banco sem a migração de regras
  if (error) { note("Erro ao carregar grupos: " + error.message); return; }
  myGroups = (data || []).map(r => r.groups).filter(Boolean);
}

function showGroups() {
  group = null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  screen("groups");
  const list = $("gList"); list.textContent = "";
  $("gListCard").hidden = !myGroups.length;
  myGroups.forEach(g => {
    const b = document.createElement("button"); b.className = "alt gitem"; b.textContent = g.name;
    b.onclick = () => openGroup(g); list.appendChild(b);
  });
}

$("gCreate").onclick = async () => {
  const name = $("gName").value.trim();
  if (!name) { note("Dê um nome ao grupo."); return; }
  $("gCreate").disabled = true;
  const { data, error } = await sb.rpc("create_group", { gname: name });
  $("gCreate").disabled = false;
  if (error) { note("Não consegui criar o grupo: " + error.message); return; }
  note(""); $("gName").value = ""; myGroups.push(data); openGroup(data, true);
};

$("gJoin").onclick = async () => {
  const code = $("gCode").value.trim().toLowerCase();
  if (!code) { note("Digite o código do convite."); return; }
  const { data, error } = await sb.rpc("join_group", { code });
  if (error) { note("Código inválido. Confira com quem te convidou."); return; }
  note(""); $("gCode").value = "";
  await loadGroups(); openGroup(myGroups.find(x => x.id === data.id) || data);
};

$("switchGroup").onclick = showGroups;

function inviteUrl() { return location.origin + location.pathname + "?convite=" + group.invite_code; }

$("invite").onclick = () => {
  const box = $("invBox"); box.hidden = !box.hidden;
  $("invLink").textContent = inviteUrl();
  $("invNew").hidden = group.owner_id !== me.id;
};
$("invShare").onclick = async () => {
  const url = inviteUrl(), text = "Entra no meu grupo do Desafio da Água: " + group.name;
  try {
    if (navigator.share) { await navigator.share({ title: "Desafio da Água", text, url }); return; }
    await navigator.clipboard.writeText(url); note("Link copiado! Cole numa conversa.", true);
  } catch (e) { note("Copie o link manualmente: " + url); }
};
$("invNew").onclick = async () => {
  if (!confirm("Gerar um novo código? O link antigo deixa de funcionar.")) return;
  const { data, error } = await sb.rpc("regenerate_invite", { gid: group.id });
  if (error) { note("Não consegui gerar o código: " + error.message); return; }
  group.invite_code = data; $("invLink").textContent = inviteUrl(); note("Novo link gerado.", true);
};

function openGroup(g) {
  group = g; lsSet("agua-group", g.id); logs = []; members = []; reacts = {}; openLogs = {}; hist = []; histKey = ""; $("membersCard").hidden = true; note("");
  screen("app"); $("invBox").hidden = true;
  $("gTitle").textContent = g.name; $("who").textContent = myName;
  $("goal").value = myGoal; $("winner").hidden = true; winnerKey = "";
  $("rulesCard").hidden = true; renderBottleButtons(); renderRules();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("logs-" + g.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "logs", filter: "group_id=eq." + g.id }, load)
    .subscribe();
  render(); load();
}

// ---------- Placar ----------
// ---------- Garrafinhas ----------
function renderBottleButtons() {
  const box = $("btBox"); box.textContent = "";
  box.classList.toggle("two", bottles.length > 1);
  bottles.forEach(b => {
    const bt = document.createElement("button");
    bt.textContent = "📸 " + (bottles.length > 1 ? b.name : "Terminei a garrafinha");
    const sm = document.createElement("small"); sm.textContent = b.ml + " ml"; bt.appendChild(sm);
    bt.onclick = () => { pending = b.ml; $("shot").click(); };
    box.appendChild(bt);
  });
}

function renderBottleEditor() {
  const box = $("bList"); box.textContent = "";
  bottles.forEach((b, i) => {
    const row = document.createElement("div"); row.className = "nm";
    const tx = document.createElement("span"); tx.textContent = b.name + " · " + b.ml + " ml";
    const del = document.createElement("button"); del.className = "chip danger"; del.textContent = "🗑️ Remover";
    del.disabled = bottles.length === 1; del.title = bottles.length === 1 ? "Você precisa ter pelo menos uma" : "Remover";
    del.onclick = () => saveBottles(bottles.filter((_, k) => k !== i));
    row.append(tx, del); box.appendChild(row);
  });
  $("bAdd").disabled = bottles.length >= 6;
}

async function saveBottles(list) {
  const clean = cleanBottles(list);
  if (!clean) return;
  const { error } = await sb.from("profiles").update({ bottles: clean }).eq("id", me.id);
  if (error) {
    note(/bottles/.test(error.message) ? "Para guardar as garrafinhas na conta, rode o migracao-garrafinhas-regras.sql. Por enquanto ficaram só neste aparelho."
      : "Não consegui salvar: " + error.message);
    if (!/bottles/.test(error.message)) return;
  } else note("Garrafinhas salvas!", true);
  bottles = clean; lsSet("agua-bottles", JSON.stringify(bottles));
  renderBottleEditor(); renderBottleButtons();
}

$("bAdd").onclick = () => {
  const name = $("bName").value.trim(), ml = parseInt($("bMl").value, 10);
  if (!name) { note("Dê um nome para a garrafinha."); return; }
  if (!(ml >= 50 && ml <= 5000)) { note("O tamanho deve ficar entre 50 e 5000 ml."); return; }
  if (bottles.length >= 6) { note("Você já tem 6 garrafinhas. Remova uma para adicionar outra."); return; }
  $("bName").value = ""; $("bMl").value = "";
  saveBottles(bottles.concat([{ name, ml }]));
};

// ---------- Regras do grupo ----------
const effGoal = personal => (group && group.goal_ml) ? group.goal_ml : personal;
const photoRequired = () => REQUIRE_PHOTO_ALL || !!(group && group.require_photo);

function renderRules() {
  if (!group) return;
  $("rulesRow").hidden = group.owner_id !== me.id;
  const parts = [];
  if (group.require_photo) parts.push("foto obrigatória em todo registro");
  if (group.goal_ml) parts.push("meta de " + group.goal_ml + " ml para todos");
  $("rulesLine").textContent = parts.length ? "📏 Regras do grupo: " + parts.join(" · ") : "";
  $("rulesLine").hidden = !parts.length;
  $("photoHint").textContent = photoRequired()
    ? "Neste grupo, todo registro precisa de foto com a garrafinha de cabeça para baixo."
    : "Tire uma foto com a garrafinha de cabeça para baixo para valer.";
}

$("rulesBtn").onclick = () => {
  const c = $("rulesCard"); c.hidden = !c.hidden;
  $("rPhoto").checked = !!group.require_photo;
  $("rGoalMode").value = group.goal_ml ? "group" : "personal";
  $("rGoal").value = group.goal_ml || myGoal; $("rGoal").hidden = !group.goal_ml;
};
$("rGoalMode").onchange = () => { $("rGoal").hidden = $("rGoalMode").value !== "group"; };
$("rSave").onclick = async () => {
  const goal = $("rGoalMode").value === "group" ? parseInt($("rGoal").value, 10) : null;
  if (goal !== null && !(goal >= 500 && goal <= 10000)) { note("A meta do grupo deve ficar entre 500 e 10000 ml."); return; }
  const { data, error } = await sb.rpc("set_group_rules", { gid: group.id, p_require_photo: $("rPhoto").checked, p_goal_ml: goal });
  if (error) { note(/set_group_rules/.test(error.message) ? "Regras indisponíveis: rode o migracao-garrafinhas-regras.sql no Supabase." : "Não consegui salvar as regras: " + error.message); return; }
  group.require_photo = data.require_photo; group.goal_ml = data.goal_ml;
  const mg = myGroups.find(x => x.id === group.id); if (mg) { mg.require_photo = data.require_photo; mg.goal_ml = data.goal_ml; }
  $("rulesCard").hidden = true; renderRules(); render(); note("Regras salvas!", true);
};

async function refreshRules() {
  if (!group) return;
  const gid = group.id;
  const { data, error } = await sb.from("groups").select("require_photo,goal_ml,owner_id").eq("id", gid).maybeSingle();
  if (error || !data || !group || group.id !== gid) return;
  const changed = data.require_photo !== group.require_photo || data.goal_ml !== group.goal_ml || data.owner_id !== group.owner_id;
  Object.assign(group, data);
  if (changed) { renderRules(); render(); }
}

async function load() {
  if (!me || !group) return;
  const gid = group.id, d = today(); if (d !== day) day = d;
  const { data, error } = await sb.from("logs")
    .select("id,user_id,ml,photo_path,created_at,profiles!user_id(name,goal_ml)")
    .eq("group_id", gid).eq("day", day).order("created_at", { ascending: false });
  if (error) { note("Erro ao carregar: " + error.message); return; }
  if (!group || group.id !== gid) return; // trocou de grupo no meio do caminho
  note(""); logs = data || []; render(); loadMembers(); loadWinner(); loadHistory(); loadReactions();
}

const signed = {};
async function signPhotos(paths) {
  const now = Date.now();
  paths.forEach(p => { signed[p] = { url: "", exp: now + 20000 }; }); // evita repetir enquanto carrega
  const { data, error } = await sb.storage.from("proofs").createSignedUrls(paths, 3600);
  if (!error && data) data.forEach(d => { if (d.signedUrl && d.path) signed[d.path] = { url: d.signedUrl, exp: Date.now() + 3300000 }; });
  render();
}

function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(isoDay, n) { const [y, m, d] = isoDay.split("-").map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); }
function periodStart(p) {
  const [y, m, d] = day.split("-").map(Number), x = new Date(y, m - 1, d);
  if (p === "month") { x.setDate(1); return iso(x); }
  if (p === "week") { x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); } // semana começa na segunda
  return day;
}

// ---------- Avatares ----------
const AV_COLORS = ["#1d6fb8", "#0f7a70", "#6a4fc4", "#a8418f", "#b4511a", "#3a7329", "#7d6311", "#475569"];
const AV_EMOJIS = ["🐳", "🐬", "🐙", "🦦", "🐧", "🐸", "🦊", "🐼", "🐨", "🦁", "🐯", "🐰", "🌵", "🌻", "🍉", "🍋", "⚡", "🔥", "🌊", "💧", "🚀", "🎧", "⚽", "🏃"];
let avatars = {}, myAvatar = { emoji: null, color: null, path: null };
const avSigned = {}, avQueue = new Set();
let avTimer = null;

function hashColor(uid) { let h = 0; for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function avatarOf(uid) { return me && uid === me.id ? myAvatar : (avatars[uid] || {}); }

function queueAvatar(path) {
  const sg = avSigned[path];
  if (sg && sg.exp > Date.now()) return;
  avSigned[path] = { url: "", exp: Date.now() + 30000 }; // evita repetir enquanto carrega (ou se falhar)
  avQueue.add(path);
  if (!avTimer) avTimer = setTimeout(signAvatars, 0);
}
async function signAvatars() {
  avTimer = null;
  const paths = [...avQueue]; avQueue.clear();
  if (!paths.length) return;
  const { data, error } = await sb.storage.from("avatars").createSignedUrls(paths, 3600);
  if (!error && data) data.forEach(d => { if (d.signedUrl && d.path) avSigned[d.path] = { url: d.signedUrl, exp: Date.now() + 3300000 }; });
  if (group && !$("app").hidden) render();
  if (!$("profile").hidden) renderAvatarPicker();
}

function avatarEl(uid, name, size) {
  size = size || 28;
  const a = avatarOf(uid), el = document.createElement("span");
  el.className = "av"; el.style.width = el.style.height = size + "px"; el.setAttribute("aria-hidden", "true");
  el.style.background = a.color || hashColor(uid);
  if (a.path) {
    const sg = avSigned[a.path];
    if (sg && sg.url && sg.exp > Date.now()) {
      const im = document.createElement("img"); im.src = sg.url; im.alt = ""; el.appendChild(im); return el;
    }
    queueAvatar(a.path); // enquanto a foto carrega, mostra emoji ou inicial
  }
  if (a.emoji) { el.textContent = a.emoji; el.style.fontSize = Math.round(size * 0.58) + "px"; return el; }
  el.textContent = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
  el.style.fontSize = Math.round(size * 0.46) + "px";
  return el;
}

// nome e meta de cada pessoa (membros + registros de hoje)
function people() {
  const ppl = {};
  members.forEach(m => { ppl[m.user_id] = { name: (m.profiles && m.profiles.name) || "?", goal: effGoal((m.profiles && m.profiles.goal_ml) || GOAL) }; });
  logs.forEach(l => { if (!ppl[l.user_id]) ppl[l.user_id] = { name: (l.profiles && l.profiles.name) || "?", goal: effGoal((l.profiles && l.profiles.goal_ml) || GOAL) }; });
  if (me && ppl[me.id]) { ppl[me.id].name = myName; ppl[me.id].goal = effGoal(myGoal); }
  return ppl;
}

// total por pessoa e dia: histórico do banco, com o dia de hoje sempre atualizado pelos registros ao vivo
function dailyTotals() {
  const t = {};
  hist.forEach(h => { if (h.day !== day) (t[h.user_id] || (t[h.user_id] = {}))[h.day] = h.ml; });
  logs.forEach(l => { const u = t[l.user_id] || (t[l.user_id] = {}); u[day] = (u[day] || 0) + l.ml; });
  return t;
}

// dias seguidos batendo a meta; se hoje ainda não bateu, conta a partir de ontem (não zera no meio do dia)
function streakOf(uid, totals, goal) {
  const u = totals[uid] || {};
  let d = (u[day] || 0) >= goal ? day : addDays(day, -1), n = 0;
  while ((u[d] || 0) >= goal && n < 62) { n++; d = addDays(d, -1); }
  return n;
}

async function loadHistory() {
  if (!me || !group) return;
  const gid = group.id, key = gid + "|" + day;
  const since = [periodStart("month"), addDays(day, -62)].sort()[0];
  const { data, error } = await sb.rpc("group_totals", { gid, since });
  if (error) { if (histKey !== key) note("Ranking da semana/mês indisponível: rode o migracao-ranking.sql no Supabase."); return; }
  if (!group || group.id !== gid) return;
  histKey = key; hist = data || []; render();
}

document.querySelectorAll("#tabs button").forEach(btn => btn.onclick = () => {
  period = btn.dataset.p;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === btn));
  render();
});

// vencedor(es) de um período fechado: quem bebeu mais (empates aparecem juntos)
function winnersOf(start, end, ppl, totals) {
  let top = 0, names = [], uids = [];
  Object.keys(totals).forEach(uid => {
    let ml = 0;
    Object.keys(totals[uid]).forEach(d => { if (d >= start && d <= end) ml += totals[uid][d]; });
    if (ml <= 0) return;
    const nm = (ppl[uid] || {}).name || "?";
    if (ml > top) { top = ml; names = [nm]; uids = [uid]; } else if (ml === top) { names.push(nm); uids.push(uid); }
  });
  return top ? { names, uids, ml: top } : null;
}

function renderWinners(ppl, totals) {
  const box = $("winner");
  if (!histKey) return; // sem histórico: fica o vencedor de ontem do jeito antigo
  const br = d => d.slice(8, 10) + "/" + d.slice(5, 7);
  const yday = addDays(day, -1);
  const wStart = addDays(periodStart("week"), -7), wEnd = addDays(periodStart("week"), -1);
  const mEnd = addDays(periodStart("month"), -1), mStart = mEnd.slice(0, 8) + "01";
  const [my, mm] = mEnd.split("-").map(Number);
  const monthName = new Date(my, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  const items = [
    ["Ontem", winnersOf(yday, yday, ppl, totals)],
    ["Semana passada (" + br(wStart) + " a " + br(wEnd) + ")", winnersOf(wStart, wEnd, ppl, totals)],
    ["Mês passado (" + monthName + ")", winnersOf(mStart, mEnd, ppl, totals)]
  ].filter(x => x[1]);
  box.textContent = "";
  if (!items.length) { box.hidden = true; return; }
  const list = document.createElement("div"); list.className = "wins";
  items.forEach(([label, w]) => {
    const row = document.createElement("div"); row.className = "win";
    const a = document.createElement("span");
    const avs = document.createElement("span"); avs.className = "avs";
    w.uids.slice(0, 3).forEach((u, k) => avs.appendChild(avatarEl(u, w.names[k], 22)));
    const tx = document.createElement("span"); tx.textContent = "🏆 " + label + ": " + w.names.join(" e ");
    a.append(avs, tx);
    const b = document.createElement("span"); b.textContent = w.ml.toLocaleString("pt-BR") + " ml";
    row.append(a, b); list.appendChild(row);
  });
  box.appendChild(list); box.hidden = false;
}

function render() {
  const ppl = people(), totals = dailyTotals(), start = periodStart(period);
  renderWinners(ppl, totals);
  const rows = Object.keys(ppl).map(uid => {
    const u = totals[uid] || {}, p = ppl[uid];
    let ml = 0, hit = 0;
    Object.keys(u).forEach(d => { if (d >= start && d <= day) { ml += u[d]; if (u[d] >= p.goal) hit++; } });
    return { uid, name: p.name, goal: p.goal, ml, hit, streak: streakOf(uid, totals, p.goal) };
  }).filter(r => r.ml > 0).sort((a, b) => b.ml - a.ml || b.streak - a.streak);
  const b = $("board"); b.textContent = "";
  if (!rows.length) {
    const p = document.createElement("p"); p.className = "mut";
    p.textContent = period === "day" ? "Ninguém bebeu nada ainda. Seja o primeiro!" : "Nenhum registro neste período ainda.";
    b.appendChild(p);
  }
  const medals = ["🥇", "🥈", "🥉"], max = rows.length ? Math.max(rows[0].ml, period === "day" ? GOAL : 1) : 1;
  rows.forEach((r, i) => {
    const w = document.createElement("div"); w.className = "row2";
    const pos = document.createElement("div"); pos.className = "pos"; pos.textContent = medals[i] || String(i + 1);
    const mid = document.createElement("div"); mid.style.flex = "1";
    const nm = document.createElement("div"); nm.className = "nm";
    const a = document.createElement("span");
    a.textContent = r.name + (period === "day" && r.ml >= r.goal ? " ✅" : "") + (r.streak >= 2 ? " 🔥" + r.streak : "");
    const c = document.createElement("span"); c.className = "mut";
    c.textContent = period === "day" ? r.ml + " / " + r.goal + " ml" : r.ml.toLocaleString("pt-BR") + " ml · ✅ " + r.hit + (r.hit === 1 ? " dia" : " dias");
    nm.append(a, c);
    const bar = document.createElement("div"); bar.className = "bar";
    const fill = document.createElement("i"); fill.style.width = Math.min(100, Math.round(r.ml / max * 100)) + "%";
    bar.appendChild(fill); mid.append(nm, bar); w.append(pos, avatarEl(r.uid, r.name, 30), mid); b.appendChild(w);
  });
  const mineMl = logs.filter(l => l.user_id === me.id).reduce((s, l) => s + l.ml, 0);
  const gGoal = effGoal(myGoal);
  const pct = Math.min(100, Math.round(mineMl / gGoal * 100));
  $("mine").textContent = mineMl + " ml";
  $("goalLine").textContent = (group && group.goal_ml ? "Meta do grupo: " : "Sua meta: ") + gGoal + " ml · " + pct + "%" + (mineMl >= gGoal ? " ✅" : "");
  $("goalBar").style.width = pct + "%";

  const box = $("proofs"); box.textContent = "";
  const shots = logs.filter(l => l.photo_path).slice(0, 12);
  const need = shots.map(l => l.photo_path).filter(p => !signed[p] || signed[p].exp < Date.now());
  if (need.length) signPhotos(need);
  if (!shots.length) { const e = document.createElement("p"); e.className = "mut"; e.textContent = "Nenhuma prova ainda."; box.appendChild(e); }
  shots.forEach(l => {
    const f = document.createElement("figure"); f.className = "pf";
    const im = document.createElement("img");
    im.alt = "Prova de " + ((l.profiles && l.profiles.name) || ""); im.loading = "lazy";
    const sg = signed[l.photo_path]; if (sg && sg.url) im.src = sg.url;
    const cap = document.createElement("figcaption");
    cap.textContent = ((l.profiles && l.profiles.name) || "?") + " · " + l.ml + " ml · " +
      new Date(l.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    cap.prepend(avatarEl(l.user_id, (l.profiles && l.profiles.name) || "?", 18));
    const chips = document.createElement("div"); chips.className = "chips";
    const rs = reacts[l.id] || [];
    EMOJIS.forEach(e => {
      const n = rs.filter(r => r.emoji === e).length, mine = rs.some(r => r.emoji === e && r.user_id === me.id);
      const bt = document.createElement("button"); bt.className = "chip" + (mine ? " on" : "");
      bt.textContent = e + (n ? " " + n : ""); bt.title = mine ? "Tirar reação" : "Reagir";
      bt.onclick = () => toggleReact(l.id, e, mine);
      chips.appendChild(bt);
    });
    if (l.user_id === me.id || group.owner_id === me.id) {
      const del = document.createElement("button"); del.className = "chip danger"; del.textContent = "🗑️"; del.title = "Remover registro";
      del.onclick = () => removeLog(l); chips.appendChild(del);
    }
    f.append(im, cap, chips); box.appendChild(f);
  });
  renderMembers();
}

// ---------- Vencedor de ontem, meta e sair do grupo ----------
async function loadWinner() {
  if (!me || !group) return;
  const gid = group.id, key = gid + "|" + day;
  if (winnerKey === key) return;
  winnerKey = key;
  const d = new Date(); d.setDate(d.getDate() - 1);
  const y = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const { data, error } = await sb.from("logs").select("user_id,ml,profiles!user_id(name)").eq("group_id", gid).eq("day", y);
  const box = $("winner");
  if (histKey) return; // com o histórico carregado, os vencedores vêm de renderWinners()
  if (error) { winnerKey = ""; box.hidden = true; return; }
  if (!group || group.id !== gid) return;
  if (!data || !data.length) { box.hidden = true; return; }
  const tot = {};
  data.forEach(l => {
    const t = tot[l.user_id] || (tot[l.user_id] = { name: (l.profiles && l.profiles.name) || "?", ml: 0 });
    t.ml += l.ml;
  });
  const arr = Object.values(tot), top = Math.max.apply(null, arr.map(t => t.ml));
  box.textContent = "🏆 Vencedor de ontem: " + arr.filter(t => t.ml === top).map(t => t.name).join(" e ") + " (" + top + " ml)";
  box.hidden = false;
}

$("saveGoal").onclick = async () => {
  const v = parseInt($("goal").value, 10);
  if (!(v >= 500 && v <= 10000)) { note("A meta deve ficar entre 500 e 10000 ml."); $("goal").value = myGoal; return; }
  const { error } = await sb.from("profiles").update({ goal_ml: v }).eq("id", me.id);
  if (error) { note("Não consegui salvar a meta: " + error.message); return; }
  myGoal = v; await load(); note("Meta salva!", true);
};

$("leave").onclick = async () => {
  if (!group) return;
  const owner = group.owner_id === me.id, gid = group.id;
  const msg = 'Sair do grupo "' + group.name + '"?\n\nSeus registros e fotos neste grupo serão apagados.' + (owner ? "\n\nVocê é o dono: a posse passa para o membro mais antigo (se não houver outros, o grupo é excluído)." : "");
  if (!confirm(msg)) return;
  const { data, error } = await sb.rpc("leave_group", { gid });
  if (error) { note("Não consegui sair do grupo."); return; }
  if (data && data.length) sb.storage.from("proofs").remove(data);
  myGroups = myGroups.filter(x => x.id !== gid);
  if (lsGet("agua-group") === gid) lsDel("agua-group");
  showGroups(); note("Você saiu do grupo.", true);
};

async function deleteAccount() {
  const t = prompt("Isso apaga sua conta, seus registros e suas fotos para sempre.\n\nDigite EXCLUIR para confirmar.");
  if (!t || t.trim().toUpperCase() !== "EXCLUIR") return;
  note("Apagando…", true);
  try {
    for (const name of ["proofs", "avatars"]) {
      const bucket = sb.storage.from(name);
      for (let i = 0; i < 50; i++) {
        const { data: files, error: e1 } = await bucket.list(me.id, { limit: 100 });
        if (e1 || !files || !files.length) break;
        const { error: e2 } = await bucket.remove(files.map(f => me.id + "/" + f.name));
        if (e2) break;
      }
    }
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
    ["agua-group", "agua-invite", "agua-bottle", "agua-bottles"].forEach(lsDel);
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    note("Conta excluída.", true);
  } catch (e) { note("Não consegui excluir a conta: " + (e.message || e)); }
}
$("delAcc").onclick = deleteAccount;

// ---------- Perfil ----------
function showProfile() {
  screen("profile"); note("");
  loadProfileStats();
  $("pEmail").textContent = me.email;
  $("pName").value = myName;
  avMode = myAvatar.path ? "photo" : myAvatar.emoji ? "emoji" : "initial";
  renderAvatarPicker();
  $("goal").value = myGoal;
  renderBottleEditor();
  $("emailFreq").value = myEmailFreq;
  $("reminder").value = String(myReminder);
  $("pushHint").textContent = pushHintText();
  const box = $("pGroups"); box.textContent = "";
  if (!myGroups.length) {
    const p = document.createElement("p"); p.className = "mut"; p.textContent = "Você ainda não está em nenhum grupo."; box.appendChild(p);
  }
  myGroups.forEach(g => {
    const b = document.createElement("button"); b.className = "alt gitem";
    b.textContent = g.name + (g.owner_id === me.id ? " 👑" : "");
    b.onclick = () => openGroup(g); box.appendChild(b);
  });
}
$("profileBtn").onclick = showProfile;

// ---------- Histórico e conquistas ----------
async function loadProfileStats() {
  $("hStats").textContent = ""; $("hChart").textContent = ""; $("hDays").textContent = ""; $("badges").textContent = "";
  const { data, error } = await sb.rpc("my_daily_totals");
  if (error) { $("hInfo").textContent = "Histórico indisponível: rode o migracao-perfil.sql no Supabase."; return; }
  renderProfileStats(data || []);
}

function renderProfileStats(rows) {
  const t = {}; rows.forEach(r => { t[r.day] = r; });
  const goal = myGoal, ml = d => (t[d] ? t[d].ml : 0);
  const fmtL = v => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " L";
  const dayLabel = d => { const [y, m, dd] = d.split("-"); return dd + "/" + m; };

  // números gerais
  let sum30 = 0, hit30 = 0;
  for (let i = 0; i < 30; i++) { const d = addDays(day, -i); sum30 += ml(d); if (ml(d) >= goal) hit30++; }
  const days = Object.keys(t).sort();
  const totalMl = rows.reduce((s, r) => s + r.ml, 0), totalPhotos = rows.reduce((s, r) => s + r.photos, 0);
  const hitDays = days.filter(d => t[d].ml >= goal).length;
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    if (t[d].ml >= goal) { run = (prev && addDays(prev, 1) === d) ? run + 1 : 1; prev = d; best = Math.max(best, run); }
  });
  let cur = 0, d0 = ml(day) >= goal ? day : addDays(day, -1);
  while (ml(d0) >= goal && cur < 3650) { cur++; d0 = addDays(d0, -1); }

  const tiles = [
    [Math.round(sum30 / 30).toLocaleString("pt-BR") + " ml", "média por dia (30 dias)"],
    [hit30 + " de 30", "dias com meta batida"],
    ["🔥 " + cur + (cur === 1 ? " dia" : " dias"), "sequência atual (recorde: " + best + ")"],
    [fmtL(totalMl), "bebidos desde o início"]
  ];
  tiles.forEach(([v, l]) => {
    const el = document.createElement("div"); el.className = "stat";
    const b = document.createElement("b"); b.textContent = v;
    const sp = document.createElement("span"); sp.textContent = l;
    el.append(b, sp); $("hStats").appendChild(el);
  });

  // gráfico dos últimos 14 dias (uma série; barras mais claras = abaixo da meta)
  const last = []; for (let i = 13; i >= 0; i--) last.push(addDays(day, -i));
  const top = Math.max(goal, ...last.map(ml)) * 1.1;
  const chart = $("hChart");
  const gl = document.createElement("div"); gl.className = "goal"; gl.style.bottom = (goal / top * 100) + "%"; chart.appendChild(gl);
  last.forEach((d, i) => {
    const v = ml(d), col = document.createElement("button");
    col.className = "col" + (v >= goal ? "" : " low");
    col.setAttribute("aria-label", dayLabel(d) + ": " + v + " ml" + (v >= goal ? ", meta batida" : ""));
    const bar = document.createElement("i"); bar.style.height = (v ? Math.max(2, v / top * 100) : 0) + "%";
    col.appendChild(bar);
    const show = () => {
      chart.querySelectorAll(".col").forEach(c => c.classList.remove("sel")); col.classList.add("sel");
      $("hInfo").textContent = dayLabel(d) + (d === day ? " (hoje)" : "") + ": " + v.toLocaleString("pt-BR") + " ml" + (v >= goal ? " · meta batida ✅" : " · meta de " + goal + " ml");
    };
    col.onclick = show; col.onmouseenter = show;
    chart.appendChild(col);
    const lb = document.createElement("span"); lb.textContent = (i % 2 === 1) ? dayLabel(d).slice(0, 2) : ""; $("hDays").appendChild(lb);
  });

  // conquistas
  const badges = [
    ["💧", "Primeiro gole", totalMl > 0, ""],
    ["📸", "Prova real", totalPhotos >= 1, totalPhotos + "/1 foto"],
    ["✅", "Meta batida", hitDays >= 1, hitDays + "/1 dia"],
    ["🔥", "3 dias seguidos", best >= 3, best + "/3"],
    ["⚡", "7 dias seguidos", best >= 7, best + "/7"],
    ["🏅", "30 dias seguidos", best >= 30, best + "/30"],
    ["📅", "Meta 30 vezes", hitDays >= 30, hitDays + "/30"],
    ["🌊", "10 litros", totalMl >= 10000, fmtL(totalMl) + "/10 L"],
    ["🐳", "100 litros", totalMl >= 100000, fmtL(totalMl) + "/100 L"],
    ["🎞️", "50 provas", totalPhotos >= 50, totalPhotos + "/50"]
  ];
  $("bCount").textContent = "(" + badges.filter(b => b[2]).length + " de " + badges.length + ")";
  badges.forEach(([ic, name, ok, prog]) => {
    const el = document.createElement("div"); el.className = "badge" + (ok ? "" : " off");
    const i = document.createElement("span"); i.className = "ic"; i.textContent = ic;
    const n = document.createElement("div"); n.textContent = name;
    const p = document.createElement("div"); p.className = "mut"; p.textContent = ok ? "Conquistada!" : prog;
    el.append(i, n, p); $("badges").appendChild(el);
  });
}
$("pBack").onclick = goBack;
function goBack() {
  if (lastScreen === "app" && group) openGroup(group);
  else if (lastScreen === "auth" || !me) screen("auth");
  else showGroups();
}

// ---------- Notificações ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

// ---------- Tutorial de instalação ----------
const UA = navigator.userAgent;
const isAndroid = /android/i.test(UA);
const isMobile = isIOS || isAndroid;
const inAppBrowser = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp/i.test(UA);
const iosSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(UA) && !inAppBrowser;
const samsung = /SamsungBrowser/i.test(UA);
let deferredInstall = null, installOs = isIOS ? "ios" : isAndroid ? "android" : "desktop";

const IC = {
  share: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg></span>',
  plus: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>',
  dots: '<span class="ic">⋯</span>',
  kebab: '<span class="ic">⋮</span>',
  burger: '<span class="ic">☰</span>',
  monitor: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 7v6M9 10l3 3 3-3M8 20h8"/></svg></span>'
};

// textos fixos do app (não contêm dados de usuário)
const INSTALL_STEPS = {
  ios: [
    "Abra este link no <b>Safari</b>.",
    "Toque no botão <b>Compartilhar</b> " + IC.share + ". Ele fica na barra de baixo ou dentro do menu " + IC.dots + " ao lado do endereço.",
    "Role a lista e toque em <b>Adicionar à Tela de Início</b> " + IC.plus + ".",
    "Deixe ligada a opção <b>Abrir como App Web</b>, se aparecer, e toque em <b>Adicionar</b>.",
    "Abra o app sempre pelo ícone da gota 💧 na Tela de Início."
  ],
  android: samsung ? [
    "Toque no menu " + IC.burger + " na barra de baixo.",
    "Toque em <b>Adicionar página a</b> e escolha <b>Tela inicial</b>.",
    "Confirme em <b>Adicionar</b>.",
    "Abra o app pelo ícone da gota 💧 na tela inicial."
  ] : [
    "Abra este link no <b>Chrome</b>.",
    "Toque no menu " + IC.kebab + " no canto de cima.",
    "Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).",
    "Confirme em <b>Instalar</b>.",
    "Abra o app pelo ícone da gota 💧 na tela inicial."
  ],
  desktop: [
    "O app foi feito para o celular: o melhor é instalar lá (escolha iPhone ou Android acima).",
    "No computador, use o <b>Chrome</b> ou o <b>Edge</b> e clique no ícone de instalar " + IC.monitor + " no fim da barra de endereço.",
    "Se o ícone não aparecer, abra o menu " + IC.kebab + " e procure <b>Instalar Desafio da Água</b> (no Edge: <b>Aplicativos → Instalar este site</b>).",
    "No Safari do Mac, use o menu <b>Arquivo → Adicionar ao Dock</b>."
  ]
};

function updateInstallBtn(name) {
  $("installBtn").hidden = isStandalone || !isMobile || name === "install" || name === "profile";
}

function renderInstall() {
  document.querySelectorAll("#iTabs button").forEach(b => b.classList.toggle("on", b.dataset.os === installOs));
  const here = installOs === (isIOS ? "ios" : isAndroid ? "android" : "desktop");
  let warn = "";
  if (here && inAppBrowser) warn = "Você abriu o link dentro de outro app (Instagram, Facebook...). Toque no menu " + (isIOS ? IC.dots : IC.kebab) + " e escolha <b>Abrir no " + (isIOS ? "Safari" : "navegador") + "</b>, ou copie o link e cole no " + (isIOS ? "Safari" : "Chrome") + ".";
  else if (here && isIOS && !iosSafari) warn = "No iPhone, a instalação funciona melhor pelo <b>Safari</b> (em outros navegadores o ícone pode aparecer como uma letra). Copie o link e abra no Safari.";
  $("iWarn").innerHTML = warn; $("iWarn").hidden = !warn;
  $("iCopyRow").hidden = !(warn || !here);
  $("iNowRow").hidden = !(here && deferredInstall);
  $("iDone").hidden = !(here && isStandalone);
  $("iSteps").innerHTML = INSTALL_STEPS[installOs].map(t => "<li>" + t + "</li>").join("");
  $("iSteps").hidden = here && isStandalone;
}

function showInstall() { screen("install"); note(""); renderInstall(); }

document.querySelectorAll("#iTabs button").forEach(b => b.onclick = () => { installOs = b.dataset.os; renderInstall(); });
$("installBtn").onclick = showInstall;
$("pInstall").onclick = showInstall;
$("iBack").onclick = goBack;
$("iCopy").onclick = async () => {
  const url = location.origin + location.pathname + location.search;
  try { await navigator.clipboard.writeText(url); note("Link copiado! Cole no " + (installOs === "ios" ? "Safari" : "navegador") + ".", true); }
  catch (e) { note("Copie este link: " + url); }
};
$("iNow").onclick = async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (e) {}
  deferredInstall = null; renderInstall();
};
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredInstall = e;
  if (!$("install").hidden) renderInstall();
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null; lsSet("agua-install-seen", "1");
  note("App instalado! Abra pelo ícone da gota 💧 na tela inicial.", true);
  if (!$("install").hidden) renderInstall();
});

// mostra o tutorial uma vez, na primeira entrada pelo navegador do celular
function maybeShowInstallOnce() {
  if (isStandalone || !isMobile || lsGet("agua-install-seen")) return;
  lsSet("agua-install-seen", "1");
  setTimeout(showInstall, 400);
}
const vapidReady = () => VAPID_PUBLIC_KEY.length > 40 && !/COLE_AQUI/.test(VAPID_PUBLIC_KEY);

function pushHintText() {
  if (isIOS && !isStandalone) return "No iPhone, os lembretes só funcionam com o app instalado na Tela de Início e aberto pelo ícone. Veja como em Conta → Como instalar o app.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "Este navegador não aceita notificações.";
  if (Notification.permission === "denied") return "As notificações estão bloqueadas para este app. Libere nos ajustes do celular/navegador.";
  return "Os lembretes chegam em cada aparelho onde você ativar.";
}

function b64uToBytes(s) {
  const pad = "=".repeat((4 - s.length % 4) % 4), b = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

async function enablePush() {
  if (!vapidReady()) throw new Error("Falta preencher a VAPID_PUBLIC_KEY no config.js.");
  if (isIOS && !isStandalone) throw new Error("No iPhone, instale o app na Tela de Início e abra pelo ícone para ativar os lembretes.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este navegador não aceita notificações.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Você não permitiu as notificações.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY.trim()) });
  const j = sub.toJSON();
  const { error } = await sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw new Error("Não consegui salvar este aparelho: " + error.message);
}

async function callNotify(type) {
  const { data } = await sb.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new Error("Faça login de novo.");
  const r = await fetch(SUPABASE_URL.trim().replace(/\/$/, "") + "/functions/v1/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY.trim() },
    body: JSON.stringify({ type })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("a função de envio respondeu com erro " + r.status));
  return j;
}

$("saveEmailFreq").onclick = async () => {
  const v = $("emailFreq").value;
  const { error } = await sb.from("profiles").update({ email_freq: v }).eq("id", me.id);
  if (error) { note("Não consegui salvar: " + error.message); return; }
  myEmailFreq = v; note(v === "none" ? "Você não vai receber e-mails de resumo." : "Preferência de e-mail salva!", true);
};

$("saveReminder").onclick = async () => {
  const v = parseInt($("reminder").value, 10);
  try {
    if (v > 0) { note("Ativando…", true); await enablePush(); }
    const { error } = await sb.from("profiles").update({ reminder_every: v }).eq("id", me.id);
    if (error) throw new Error("Não consegui salvar: " + error.message);
    myReminder = v; note(v ? "Lembretes ativados a cada " + v + " horas!" : "Lembretes desligados.", true);
  } catch (e) { $("reminder").value = String(myReminder); note(e.message || String(e)); }
  $("pushHint").textContent = pushHintText();
};

$("testPush").onclick = async () => {
  try {
    note("A notificação chega em uns 5 segundos. Saia do app (volte para a Tela de Início) para ver o aviso.", true);
    const r = await callNotify("test-push");
    note("Enviada para " + r.sent + (r.sent === 1 ? " aparelho." : " aparelhos.") + " Se não apareceu, confira as permissões do app nos Ajustes.", true);
  }
  catch (e) { note(e.message || String(e)); }
};

$("testEmail").onclick = async () => {
  try { note("Enviando…", true); await callNotify("test-email"); note("Resumo enviado para " + me.email + ". Confira também o spam.", true); }
  catch (e) { note(e.message || String(e)); }
};

// ---------- Seletor de avatar ----------
let avMode = "initial";

function renderAvatarPicker() {
  const pv = $("avPreview"); pv.textContent = ""; pv.appendChild(avatarEl(me.id, myName, 64));
  $("avName").textContent = myName;
  document.querySelectorAll("#avTabs button").forEach(b => b.classList.toggle("on", b.dataset.m === avMode));
  $("avEmojiBox").hidden = avMode !== "emoji";
  $("avColorBox").hidden = avMode === "photo";
  $("avPhotoBox").hidden = avMode !== "photo";
  $("avPick").textContent = myAvatar.path ? "📷 Trocar foto" : "📷 Escolher foto";
  const eg = $("avEmojis"); eg.textContent = "";
  AV_EMOJIS.forEach(e => {
    const b = document.createElement("button"); b.textContent = e; b.className = myAvatar.emoji === e && !myAvatar.path ? "on" : "";
    b.setAttribute("aria-label", "Usar " + e);
    b.onclick = () => saveAvatar({ avatar_emoji: e, avatar_path: null });
    eg.appendChild(b);
  });
  const sw = $("avColors"); sw.textContent = "";
  const cur = myAvatar.color || hashColor(me.id);
  AV_COLORS.forEach(c => {
    const b = document.createElement("button"); b.style.background = c; b.className = c === cur ? "on" : "";
    b.setAttribute("aria-label", "Cor " + c);
    b.onclick = () => saveAvatar({ avatar_color: c });
    sw.appendChild(b);
  });
}

async function saveAvatar(patch) {
  const old = myAvatar.path;
  const { error } = await sb.from("profiles").update(patch).eq("id", me.id);
  if (error) {
    note(/avatar_/.test(error.message) ? "Avatar indisponível: rode o migracao-avatar.sql no Supabase." : "Não consegui salvar o avatar: " + error.message);
    return false;
  }
  if ("avatar_emoji" in patch) myAvatar.emoji = patch.avatar_emoji;
  if ("avatar_color" in patch) myAvatar.color = patch.avatar_color;
  if ("avatar_path" in patch) myAvatar.path = patch.avatar_path;
  if (old && old !== myAvatar.path) sb.storage.from("avatars").remove([old]); // apaga a foto antiga
  renderAvatarPicker(); note("Avatar salvo!", true);
  return true;
}

document.querySelectorAll("#avTabs button").forEach(b => b.onclick = () => {
  avMode = b.dataset.m;
  if (avMode === "initial" && (myAvatar.emoji || myAvatar.path)) saveAvatar({ avatar_emoji: null, avatar_path: null });
  else renderAvatarPicker();
});
$("avPick").onclick = () => $("avFile").click();

// corta no centro em quadrado e reduz para 256 px
function squareAvatar(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const side = Math.min(im.width, im.height), sx = (im.width - side) / 2, sy = (im.height - side) / 2;
      const c = document.createElement("canvas"); c.width = c.height = 256;
      c.getContext("2d").drawImage(im, sx, sy, side, side, 0, 0, 256, 256); URL.revokeObjectURL(url);
      c.toBlob(bl => bl ? res(bl) : rej(new Error("falha ao processar a foto")), "image/jpeg", 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("imagem inválida")); };
    im.src = url;
  });
}

$("avFile").onchange = async function () {
  const f = this.files && this.files[0]; this.value = "";
  if (!f) return;
  try {
    note("Enviando foto…", true);
    const blob = await squareAvatar(f), path = me.id + "/" + Date.now() + ".jpg";
    const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw new Error(/bucket/i.test(up.error.message) ? "rode o migracao-avatar.sql no Supabase" : up.error.message);
    if (!(await saveAvatar({ avatar_path: path, avatar_emoji: null }))) sb.storage.from("avatars").remove([path]);
  } catch (e) { note("Não consegui enviar a foto: " + (e.message || e)); }
};

$("saveName").onclick = async () => {
  const v = $("pName").value.trim();
  if (!v || v.length > 30) { note("O nome precisa ter de 1 a 30 caracteres."); $("pName").value = myName; return; }
  const { error } = await sb.from("profiles").update({ name: v }).eq("id", me.id);
  if (error) { note("Não consegui salvar o nome: " + error.message); return; }
  myName = v; if (!$("profile").hidden) renderAvatarPicker(); note("Nome salvo!", true);
};

// ---------- Reações e moderação ----------
const EMOJIS = ["👏", "💦", "🔥", "😂"];

async function loadReactions() {
  if (!me || !group) return;
  const gid = group.id, ids = logs.filter(l => l.photo_path).slice(0, 12).map(l => l.id);
  if (!ids.length) { reacts = {}; return; }
  const { data, error } = await sb.from("reactions").select("log_id,user_id,emoji").in("log_id", ids);
  if (error || !group || group.id !== gid) return;
  const r = {}; (data || []).forEach(x => (r[x.log_id] || (r[x.log_id] = [])).push(x));
  reacts = r; render();
}

async function toggleReact(logId, emoji, mine) {
  const list = reacts[logId] || (reacts[logId] = []);
  if (mine) {
    const { error } = await sb.from("reactions").delete().eq("log_id", logId).eq("user_id", me.id).eq("emoji", emoji);
    if (error) { note("Não consegui tirar a reação."); return; }
    reacts[logId] = list.filter(x => !(x.emoji === emoji && x.user_id === me.id));
  } else {
    const { error } = await sb.from("reactions").insert({ log_id: logId, emoji });
    if (error) { note("Não consegui reagir."); return; }
    list.push({ log_id: logId, user_id: me.id, emoji });
  }
  render();
}

async function removeLog(l) {
  const who = l.user_id === me.id ? "seu registro" : "o registro de " + (((l.profiles && l.profiles.name)) || "outra pessoa");
  if (!confirm("Remover " + who + " de " + l.ml + " ml" + (l.photo_path ? " (e a foto)" : "") + "?")) return;
  if (l.photo_path) await sb.storage.from("proofs").remove([l.photo_path]); // a foto sai antes do registro
  const { error } = await sb.from("logs").delete().eq("id", l.id);
  if (error) { note("Não consegui remover: " + error.message); return; }
  note("Registro removido.", true); await load();
}

async function removeMember(m) {
  const name = (m.profiles && m.profiles.name) || "esta pessoa";
  if (!confirm("Remover " + name + " do grupo?\n\nTodos os registros, fotos e reações dela neste grupo serão apagados. Para ela não voltar com o mesmo link, gere um novo código de convite depois.")) return;
  const gid = group.id;
  note("Removendo…", true);
  const { data: ph } = await sb.from("logs").select("photo_path").eq("group_id", gid).eq("user_id", m.user_id).not("photo_path", "is", null);
  const paths = (ph || []).map(x => x.photo_path);
  for (let i = 0; i < paths.length; i += 100) await sb.storage.from("proofs").remove(paths.slice(i, i + 100));
  const { error } = await sb.rpc("remove_member", { gid, uid: m.user_id });
  if (error) { note("Não consegui remover: " + error.message); return; }
  members = members.filter(x => x.user_id !== m.user_id);
  note(name + " foi removido(a) do grupo.", true); await load();
}

// ---------- Membros ----------
async function loadMembers() {
  if (!me || !group) return;
  refreshRules();
  const gid = group.id;
  let { data, error } = await sb.from("members").select("user_id,joined_at,profiles!user_id(name,goal_ml,avatar_emoji,avatar_color,avatar_path)").eq("group_id", gid);
  if (error) ({ data, error } = await sb.from("members").select("user_id,joined_at,profiles!user_id(name,goal_ml)").eq("group_id", gid)); // banco sem a migração de avatar
  if (error || !group || group.id !== gid) return;
  members = data || [];
  members.forEach(m => { const p = m.profiles || {}; avatars[m.user_id] = { emoji: p.avatar_emoji || null, color: p.avatar_color || null, path: p.avatar_path || null }; });
  render();
}

function renderMembers() {
  if (!group) return;
  const open = !$("membersCard").hidden;
  $("membersBtn").textContent = open ? "Esconder membros" : "Ver membros" + (members.length ? " (" + members.length + ")" : "");
  $("mCount").textContent = members.length ? "(" + members.length + ")" : "";
  const box = $("mList"); box.textContent = "";
  if (!open) return;
  const ml = {}, totals = dailyTotals(), ppl = people();
  logs.forEach(l => { ml[l.user_id] = (ml[l.user_id] || 0) + l.ml; });
  const nameOf = m => (m.profiles && m.profiles.name) || "Sem nome";
  members.slice()
    .sort((a, b) => (ml[b.user_id] || 0) - (ml[a.user_id] || 0) || nameOf(a).localeCompare(nameOf(b), "pt-BR"))
    .forEach(m => {
      const row = document.createElement("div"); row.className = "row2";
      const mid = document.createElement("div"); mid.style.flex = "1";
      const nm = document.createElement("div"); nm.className = "nm";
      const a = document.createElement("span");
      a.textContent = nameOf(m) + (group.owner_id === m.user_id ? " 👑" : "") + (m.user_id === me.id ? " (você)" : "");
      const st = streakOf(m.user_id, totals, (ppl[m.user_id] || {}).goal || GOAL);
      if (st >= 1) a.textContent += " 🔥" + st;
      const c = document.createElement("span"); c.className = "mut"; c.textContent = (ml[m.user_id] || 0) + " ml hoje";
      nm.append(a, c);
      const sub = document.createElement("div"); sub.className = "mut";
      sub.textContent = "No grupo desde " + new Date(m.joined_at).toLocaleDateString("pt-BR");
      mid.append(nm, sub);
      if (group.owner_id === me.id && m.user_id !== me.id) {
        const mine = logs.filter(l => l.user_id === m.user_id);
        const acts = document.createElement("div"); acts.className = "chips";
        if (mine.length) {
          const t = document.createElement("button"); t.className = "chip";
          t.textContent = (openLogs[m.user_id] ? "Esconder" : "Registros de hoje") + " (" + mine.length + ")";
          t.onclick = () => { openLogs[m.user_id] = !openLogs[m.user_id]; renderMembers(); };
          acts.appendChild(t);
        }
        const rm = document.createElement("button"); rm.className = "chip danger"; rm.textContent = "Remover do grupo";
        rm.onclick = () => removeMember(m); acts.appendChild(rm);
        mid.appendChild(acts);
        if (openLogs[m.user_id]) mine.forEach(l => {
          const li = document.createElement("div"); li.className = "nm mut"; li.style.marginTop = "4px";
          const tx = document.createElement("span");
          tx.textContent = new Date(l.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " · " + l.ml + " ml" + (l.photo_path ? " · 📸" : "");
          const del = document.createElement("button"); del.className = "chip danger"; del.textContent = "🗑️ Remover";
          del.onclick = () => removeLog(l);
          li.append(tx, del); mid.appendChild(li);
        });
      }
      row.append(avatarEl(m.user_id, nameOf(m), 32), mid); box.appendChild(row);
    });
}

$("membersBtn").onclick = () => {
  $("membersCard").hidden = !$("membersCard").hidden;
  renderMembers();
  if (!$("membersCard").hidden) loadMembers();
};

// ---------- Registros ----------
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, 800 / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(bl => bl ? res(bl) : rej(new Error("falha ao processar a foto")), "image/jpeg", 0.7);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("imagem inválida")); };
    im.src = url;
  });
}

async function addLog(ml, blob) {
  if (!me || !group || !(ml > 0)) return;
  let path = null;
  if (blob) {
    path = me.id + "/" + Date.now() + ".jpg";
    const up = await sb.storage.from("proofs").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) { note("Não consegui enviar a foto: " + up.error.message); return; }
  }
  const { error } = await sb.from("logs").insert({ group_id: group.id, ml, day, photo_path: path });
  if (error) {
    if (path) sb.storage.from("proofs").remove([path]);
    note(/limite_diario/.test(error.message) ? "Limite diário de 6000 ml atingido. Por segurança, o app não registra mais que isso por dia."
      : /dia_invalido/.test(error.message) ? "Data inválida. Confira a data e a hora do seu aparelho."
      : /foto_obrigatoria/.test(error.message) ? "Neste grupo, todo registro precisa de foto. Use um dos botões 📸."
      : "Não consegui salvar: " + error.message);
    return;
  }
  await load();
}

function ask(ml) {
  if (photoRequired()) { pending = ml; $("shot").click(); } else addLog(ml, null);
}

$("shot").onchange = async function () {
  const f = this.files && this.files[0]; this.value = "";
  if (!f) return;
  try { note("Enviando…", true); await addLog(pending, await shrink(f)); }
  catch (e) { note("Não consegui ler a foto. Tente de novo."); }
};
document.querySelectorAll("[data-ml]").forEach(btn => btn.onclick = () => ask(parseInt(btn.dataset.ml, 10)));
$("custom").onclick = () => { const v = parseInt(prompt("Quantos ml?", "250"), 10); if (v > 0 && v <= 5000) ask(v); };
$("undo").onclick = async () => {
  const last = logs.find(l => l.user_id === me.id); // lista vem do mais novo para o mais antigo
  if (!last) return;
  const { error } = await sb.from("logs").delete().eq("id", last.id);
  if (error) { note("Não consegui desfazer: " + error.message); return; }
  if (last.photo_path) await sb.storage.from("proofs").remove([last.photo_path]);
  await load();
};

// atualiza o placar de tempos em tempos (e vira o dia sozinho)
setInterval(load, 30000);

// ---------- App instalável (PWA) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

// ---------- Início ----------
if (configError) {
  note(configError);
} else {
  sb.auth.getSession().then(({ data }) => { if (!data.session) showAuth(); });
}
