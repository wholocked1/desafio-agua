// Desafio da Água: lógica do app.
// A configuração (URL, chaves) fica no config.js. O visual fica no app.css.
// Este arquivo é carregado no fim do index.html, depois da biblioteca do Supabase e do config.js.

// ====== LEITURA DA CONFIGURAÇÃO ======
// Os valores vêm do config.js. É lá que você edita, nunca aqui.
// Estas linhas não são uma segunda configuração: elas só pegam o que está no config.js
// e preparam para o resto do app, cobrindo os casos em que algo falta ou veio errado:
//   - URL ou chave faltando: fica o texto "COLE_AQUI...", e o app mostra no rodapé o que falta preencher;
//   - GOAL faltando, zero ou com texto: usa 2000 ml;
//   - REQUIRE_PHOTO_ALL: só vale se for exatamente true;
//   - TURNSTILE_SITE_KEY vazia: o CAPTCHA fica desligado.
const CFG = window.APP_CONFIG || {};
const SUPABASE_URL = String(CFG.SUPABASE_URL || "COLE_AQUI_A_PROJECT_URL");
const SUPABASE_ANON_KEY = String(CFG.SUPABASE_ANON_KEY || "COLE_AQUI_A_ANON_KEY");
const VAPID_PUBLIC_KEY = String(CFG.VAPID_PUBLIC_KEY || "COLE_AQUI_A_CHAVE_PUBLICA_VAPID");
const GOAL = parseInt(CFG.GOAL, 10) > 0 ? parseInt(CFG.GOAL, 10) : 2000;
const REQUIRE_PHOTO_ALL = CFG.REQUIRE_PHOTO_ALL === true;
const TURNSTILE_SITE_KEY = String(CFG.TURNSTILE_SITE_KEY || "").trim();
// ==============================================================

const $ = id => document.getElementById(id);

// ---------- Janela do app (no lugar das janelas simples do navegador) ----------
// askDialog({ title, text, okText, danger, input: { type, value, placeholder, inputmode, validate } })
// devolve: true (confirmou), o texto digitado (com input) ou null (cancelou)
let dlgDone = null;
function askDialog(o) {
  if (dlgDone) dlgDone(null); // fecha uma janela que tenha ficado aberta
  return new Promise(resolve => {
    const box = $("dlg"), inp = $("dlgInput"), err = $("dlgErr"), yes = $("dlgYes");
    $("dlgTitle").textContent = o.title || "";
    $("dlgText").textContent = o.text || ""; $("dlgText").hidden = !o.text;
    yes.textContent = o.okText || "Confirmar";
    yes.classList.toggle("danger", !!o.danger);
    err.hidden = true; err.textContent = "";
    inp.hidden = !o.input;
    if (o.input) {
      inp.type = o.input.type || "text"; inp.value = o.input.value || "";
      inp.placeholder = o.input.placeholder || ""; inp.inputMode = o.input.inputmode || "";
    }
    const finish = v => {
      box.hidden = true; dlgDone = null;
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const submit = () => {
      if (!o.input) return finish(true);
      const v = inp.value;
      const msg = o.input.validate ? o.input.validate(v) : null;
      if (msg) { err.textContent = msg; err.hidden = false; inp.focus(); return; }
      finish(v);
    };
    const onKey = e => {
      if (e.key === "Escape") finish(null);
      else if (e.key === "Enter" && (o.input ? document.activeElement === inp : true)) { e.preventDefault(); submit(); }
    };
    dlgDone = finish;
    yes.onclick = submit;
    $("dlgNo").onclick = () => finish(null);
    box.onclick = e => { if (e.target === box) finish(null); }; // tocar fora fecha
    document.addEventListener("keydown", onKey);
    box.hidden = false;
    setTimeout(() => (o.input ? inp : yes).focus(), 30);
  });
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
// aviso flutuante: some sozinho (confirmações em 4 s, erros em 8 s) ou ao tocar; "Enviando…" fica até terminar
let noteTimer = null;
const note = (t, ok) => {
  const n = $("note"); n.textContent = t || ""; n.className = ok ? "ok" : "";
  clearTimeout(noteTimer);
  if (t && !t.endsWith("…")) noteTimer = setTimeout(() => { if (n.textContent === t) n.textContent = ""; }, ok ? 4000 : 8000);
};
$("note").onclick = () => note("");
// "Script error." = erro dentro de um script de outro site (CAPTCHA, biblioteca): o navegador esconde os detalhes
// e não é algo que a pessoa possa resolver, então não aparece na tela (fica só no console)
window.addEventListener("error", e => {
  if (!e.filename || /^script error\.?$/i.test(e.message || "") || !e.filename.startsWith(location.origin)) {
    console.warn("Erro em script externo:", e.message); return;
  }
  note("Erro: " + (e.message || "desconhecido"));
});
window.addEventListener("unhandledrejection", e => note("Erro: " + ((e.reason && e.reason.message) || "desconhecido")));

// Link do e-mail de "Esqueci minha senha": o Supabase volta com #...type=recovery (ou ?redefinir=1, que o app pede)
const urlHash = new URLSearchParams(location.hash.replace(/^#/, ""));
let recoveryLink = urlHash.get("type") === "recovery" || /[?&]redefinir=1\b/.test(location.search);
const linkError = urlHash.get("error_code") || urlHash.get("error") || "";

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

let day = today(), me = null, myName = "", myGoal = GOAL, myEmailFreq = "none", myReminder = 0, myHours = [], winnerKey = "", logs = [], pending = 500, started = null, signup = false, channel = null;
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

const showDate = () => { $("date").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); };
showDate();

// Virada do dia: o celular costuma "congelar" o app aberto em segundo plano. Ao voltar para ele (ou à meia-noite
// com ele aberto), o app passa para o dia de hoje e recarrega o placar, a semana e o mês.
function syncDay() {
  const d = today();
  if (d === day) return false;
  day = d; showDate(); winnerKey = ""; histKey = "";
  if (me && group && !$("app").hidden) { logs = []; hist = []; render(); load(); }
  return true;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncDay(); });
window.addEventListener("focus", syncDay);
setInterval(syncDay, 60000);

// convite pelo link (?convite=CODIGO): guarda até a pessoa entrar/criar conta
const inviteParam = (new URLSearchParams(location.search).get("convite") || "").trim().toLowerCase();
if (inviteParam) lsSet("agua-invite", inviteParam);

let lastScreen = "groups";
function screen(name) {
  ["auth", "reset", "groups", "app", "history", "profile", "install"].forEach(s => $(s).hidden = s !== name);
  if (name !== "profile" && name !== "install") lastScreen = name;
  $("profileBtn").hidden = name === "auth" || name === "reset" || name === "profile" || name === "install";
  updateInstallBtn(name);
  window.scrollTo(0, 0);
}

// ---------- Login ----------
// Mensagens do Supabase traduzidas (o texto original vem em inglês)
function authMsg(e) {
  const code = String((e && (e.code || e.error_code)) || ""), m = String((e && e.message) || e || "");
  const has = (...k) => k.some(x => code === x || m.toLowerCase().includes(x.toLowerCase()));
  if (has("invalid_credentials", "Invalid login credentials")) return "E-mail ou senha incorretos. Confira e tente de novo, ou use \"Esqueci minha senha\".";
  if (has("user_already_exists", "email_exists", "User already registered", "already been registered")) return "Este e-mail já tem conta. Toque em \"Já tenho conta\" para entrar, ou em \"Esqueci minha senha\".";
  if (has("email_not_confirmed", "Email not confirmed")) return "Falta confirmar o e-mail: abra o link que enviamos (confira o spam) e depois entre.";
  if (has("same_password", "should be different from the old")) return "A nova senha precisa ser diferente da anterior.";
  if (has("weak_password", "Password should be at least", "Password should contain")) { const n = (m.match(/\d+/) || ["8"])[0]; return "Senha muito fraca: use pelo menos " + n + " caracteres, misturando letras e números."; }
  if (has("over_email_send_rate_limit", "email rate limit")) return "Muitos e-mails enviados agora. Espere alguns minutos e tente de novo.";
  if (has("over_request_rate_limit", "only request this after", "rate limit")) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (has("email_address_invalid", "invalid format", "Unable to validate email")) return "Esse e-mail não parece válido. Confira se digitou certo.";
  if (has("signup_disabled", "Signups not allowed", "signups are disabled")) return "Cadastros estão fechados no momento. Fale com quem organiza o desafio.";
  if (has("captcha_failed", "captcha")) return "Não conseguimos confirmar que você não é um robô. Espere a verificação terminar e tente de novo.";
  if (has("otp_expired", "expired", "invalid or has expired", "session_not_found", "Auth session missing")) return "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".";
  if (has("Failed to fetch", "NetworkError", "Load failed")) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  return "Algo deu errado: " + (m || "erro desconhecido") + ".";
}

// ----- CAPTCHA (Cloudflare Turnstile). Só liga se TURNSTILE_SITE_KEY estiver no config.js -----
let captchaToken = "", captchaId = null, captchaLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!captchaLoading) captchaLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = res;
    s.onerror = () => { captchaLoading = null; rej(new Error("captcha")); };
    document.head.appendChild(s);
  });
  return captchaLoading;
}
async function setupCaptcha() {
  if (!TURNSTILE_SITE_KEY) return;
  $("captcha").hidden = false;
  try { await loadTurnstile(); }
  catch (e) { $("aMsg").textContent = "Não consegui carregar a verificação anti-robô. Confira a internet ou desative bloqueadores de anúncios."; return; }
  if (captchaId !== null) return;
  captchaId = window.turnstile.render("#captcha", {
    sitekey: TURNSTILE_SITE_KEY, language: "pt-br", theme: "auto", size: "flexible",
    appearance: "interaction-only", // só aparece quando precisa que a pessoa toque
    callback: t => { captchaToken = t; },
    "expired-callback": () => { captchaToken = ""; },
    "error-callback": () => { captchaToken = ""; }
  });
}
function resetCaptcha() {
  captchaToken = "";
  if (window.turnstile && captchaId !== null) { try { window.turnstile.reset(captchaId); } catch (e) {} }
}
function captchaMissing() {
  if (!TURNSTILE_SITE_KEY || captchaToken) return false;
  $("aMsg").textContent = "Só um instante: estamos confirmando que você não é um robô. Tente de novo em alguns segundos.";
  return true;
}
const withCaptcha = o => (TURNSTILE_SITE_KEY ? Object.assign(o, { captchaToken }) : o);

// ----- Telas: entrar, criar conta, esqueci a senha -----
let authMode = "login", resendTimer = null;
function setMode(mode) {
  if (mode !== "forgot" && resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  authMode = mode; signup = mode === "signup";
  const forgot = mode === "forgot";
  $("authTitle").textContent = signup ? "Criar conta" : forgot ? "Esqueci minha senha" : "Entrar";
  $("authHint").textContent = forgot ? "Digite o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova." : "";
  $("authHint").hidden = !forgot;
  $("aName").hidden = !signup;
  $("aPass").hidden = forgot;
  $("aPass").placeholder = signup ? "Senha (mín. 8 caracteres)" : "Senha";
  $("aPass").autocomplete = signup ? "new-password" : "current-password";
  $("aGo").textContent = signup ? "Criar conta" : forgot ? "Enviar link" : "Entrar";
  $("aSwitch").textContent = signup ? "Já tenho conta" : forgot ? "Voltar para Entrar" : "Não tenho conta";
  $("aForgotRow").hidden = mode !== "login";
  $("aMsg").textContent = ""; $("aMsg").className = "mut";
  if (!resendTimer) $("aGo").disabled = false;
}
$("aSwitch").onclick = () => setMode(authMode === "login" ? "signup" : "login");
$("aForgot").onclick = () => { setMode("forgot"); $("aEmail").focus(); };

function authOk(t) { $("aMsg").textContent = t; $("aMsg").className = "mut authok"; }

$("aGo").onclick = async () => {
  const email = $("aEmail").value.trim(), pass = $("aPass").value, name = $("aName").value.trim();
  if (!email) { $("aMsg").textContent = "Digite o seu e-mail."; return; }
  if (authMode !== "forgot" && !pass) { $("aMsg").textContent = "Digite a sua senha."; return; }
  if (signup && !name) { $("aMsg").textContent = "Digite o seu nome: é ele que aparece no placar."; return; }
  if (signup && pass.length < 8) { $("aMsg").textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
  if (captchaMissing()) return;
  $("aGo").disabled = true; $("aMsg").textContent = ""; $("aMsg").className = "mut";
  try {
    if (authMode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, withCaptcha({ redirectTo: location.origin + location.pathname + "?redefinir=1" }));
      if (error) throw error;
      authOk("Pronto! Se existir uma conta com " + email + ", enviamos um link para criar uma senha nova. Confira a caixa de entrada e o spam.");
      startResendCooldown();
      return;
    }
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: withCaptcha({
          data: { name },
          // o link do e-mail volta para este mesmo endereço (e mantém o convite, se houver)
          emailRedirectTo: location.origin + location.pathname + (lsGet("agua-invite") ? "?convite=" + encodeURIComponent(lsGet("agua-invite")) : "")
        }) });
      if (error) throw error;
      if (!data.session) authOk("Conta criada! Confirme pelo e-mail que enviamos (confira o spam) e depois entre.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass, options: withCaptcha({}) });
      if (error) throw error;
    }
  } catch (e) { $("aMsg").textContent = authMsg(e); }
  finally { resetCaptcha(); if (!resendTimer) $("aGo").disabled = false; }
};

// evita pedir vários e-mails seguidos (o Supabase só aceita um a cada 60 s)
function startResendCooldown() {
  let s = 60;
  const tick = () => {
    if (authMode !== "forgot") { clearInterval(resendTimer); resendTimer = null; $("aGo").disabled = false; return; }
    if (s <= 0) { clearInterval(resendTimer); resendTimer = null; $("aGo").disabled = false; $("aGo").textContent = "Enviar de novo"; return; }
    $("aGo").disabled = true; $("aGo").textContent = "Enviar de novo em " + s-- + " s";
  };
  tick(); resendTimer = setInterval(tick, 1000);
}

// ----- Nova senha (depois de tocar no link do e-mail) -----
let noteAfterLogin = "";
function showReset() { screen("reset"); note(""); $("npMsg").textContent = ""; $("npPass").focus(); }
$("npGo").onclick = async () => {
  const a = $("npPass").value, b = $("npPass2").value;
  if (a.length < 8) { $("npMsg").textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
  if (a !== b) { $("npMsg").textContent = "As duas senhas não são iguais."; return; }
  $("npGo").disabled = true; $("npMsg").textContent = "";
  try {
    const { data, error } = await sb.auth.updateUser({ password: a });
    if (error) throw error;
    recoveryLink = false;
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    $("npPass").value = $("npPass2").value = "";
    noteAfterLogin = "Senha alterada! Você já está dentro do app."; // mostrado quando o grupo terminar de abrir
    enterApp(data && data.user);
  } catch (e) { $("npMsg").textContent = authMsg(e); }
  $("npGo").disabled = false;
};

// ----- Sair: desliga os lembretes DESTE aparelho antes de sair da conta -----
async function forgetThisDevice() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  } catch (e) { /* sem lembretes neste aparelho: segue */ }
}
// apaga os dados guardados para o modo sem internet (nomes, placar) ao sair da conta
function clearCaches() {
  try { Object.keys(localStorage).filter(k => k.startsWith("agua-cache-")).forEach(lsDel); } catch (e) {}
}
const logout = async () => { $("logout").disabled = true; await forgetThisDevice(); clearCaches(); await sb.auth.signOut(); $("logout").disabled = false; };
$("logout").onclick = logout;

// aviso de link vencido ou já usado, mostrado uma vez, na primeira vez que a tela de login abrir
let linkMsgPending = !!linkError;
function linkProblemMsg() {
  if (linkMsgPending) {
    linkMsgPending = false; recoveryLink = false;
    try { history.replaceState(null, "", location.pathname + location.search.replace(/[?&]redefinir=1\b/, "")); } catch (e) {}
    return authMsg({ code: linkError, message: urlHash.get("error_description") || "" });
  }
  if (recoveryLink) { // link de redefinição sem sessão válida = vencido
    recoveryLink = false;
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    return "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".";
  }
  return "";
}

function showAuth(msg) {
  msg = msg || linkProblemMsg();
  if (!msg && !$("auth").hidden && $("aMsg").textContent) msg = $("aMsg").textContent; // não apaga um aviso que já está na tela
  started = null; group = null; myGroups = [];
  if (channel) { sb.removeChannel(channel); channel = null; }
  // depois de sair, ninguém pode entrar de novo só tocando em "Entrar": a senha é apagada do campo
  $("aPass").value = ""; $("npPass").value = ""; $("npPass2").value = "";
  screen("auth");
  const hasInvite = !!lsGet("agua-invite");
  setMode(hasInvite ? "signup" : "login");
  if (msg) $("aMsg").textContent = msg;
  else if (hasInvite) authOk("Você foi convidado! Crie sua conta (ou entre, se já tiver) para participar do grupo.");
  setupCaptcha();
}

function enterApp(user) {
  if (!user || started === user.id) return;
  me = user; started = me.id;
  setTimeout(afterLogin, 0); // evita chamar o Supabase dentro do callback de auth
}

if (sb) sb.auth.onAuthStateChange((ev, session) => {
  if (ev === "PASSWORD_RECOVERY" || (recoveryLink && session)) {
    recoveryLink = true;
    if (session && session.user) { me = session.user; showReset(); }
    return;
  }
  if (session && session.user) enterApp(session.user);
  else { me = null; showAuth(); }
});

// ---------- Grupos ----------
async function afterLogin() {
  let data = null;
  // tenta do mais completo ao mais simples (bancos sem alguma migração continuam funcionando)
  for (const cols of ["name,goal_ml,email_freq,reminder_every,reminder_hours,avatar_emoji,avatar_color,avatar_path,bottles", "name,goal_ml,email_freq,reminder_every,avatar_emoji,avatar_color,avatar_path,bottles", "name,goal_ml,email_freq,reminder_every,avatar_emoji,avatar_color,avatar_path", "name,goal_ml,email_freq,reminder_every", "name,goal_ml"]) {
    const r = await sb.from("profiles").select(cols).eq("id", me.id).maybeSingle();
    if (!r.error) { data = r.data; break; }
    if (isNetErr(r.error)) break; // sem internet: não adianta tentar as outras
  }
  const pKey = "agua-cache-profile-" + me.id;
  if (data) lsSet(pKey, JSON.stringify(data));
  else { try { data = JSON.parse(lsGet(pKey) || "null"); } catch (e) { data = null; } }
  const bs = cleanBottles(data && data.bottles);
  if (bs) { bottles = bs; lsSet("agua-bottles", JSON.stringify(bottles)); }
  myAvatar = { emoji: (data && data.avatar_emoji) || null, color: (data && data.avatar_color) || null, path: (data && data.avatar_path) || null };
  myName = (data && data.name) || me.email.split("@")[0];
  myGoal = (data && data.goal_ml) || GOAL;
  myEmailFreq = (data && data.email_freq) || "none";
  myReminder = (data && data.reminder_every) || 0;
  myHours = (data && Array.isArray(data.reminder_hours)) ? data.reminder_hours.slice().sort((a, b) => a - b) : [];
  await usePendingInvite();
  await loadGroups();
  const saved = lsGet("agua-group");
  const g = myGroups.find(x => x.id === saved) || (myGroups.length === 1 ? myGroups[0] : null);
  if (g) openGroup(g); else showGroups();
  if (noteAfterLogin) { note(noteAfterLogin, true); noteAfterLogin = ""; }
  maybeShowInstallOnce();
  flushQueue();
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
  const gKey = "agua-cache-groups-" + me.id;
  if (error) {
    const cached = isNetErr(error) && readCache(gKey);
    if (cached) { myGroups = cached; offlineNote(); return; }
    note(isNetErr(error) ? OFFLINE_MSG : "Erro ao carregar grupos: " + error.message); return;
  }
  myGroups = (data || []).map(r => r.groups).filter(Boolean);
  lsSet(gKey, JSON.stringify(myGroups));
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
  let code = $("gCode").value.trim().toLowerCase();
  const m = code.match(/convite=([a-z0-9]+)/); if (m) code = m[1]; // aceita o link inteiro também
  if (!code) { note("Digite o código do convite."); return; }
  const { data, error } = await sb.rpc("join_group", { code });
  if (error) { note("Código inválido. Confira com quem te convidou."); return; }
  note(""); $("gCode").value = "";
  await loadGroups(); openGroup(myGroups.find(x => x.id === data.id) || data);
};

$("switchGroup").onclick = showGroups;

function inviteUrl() { return location.origin + location.pathname + "?convite=" + group.invite_code; }

// ---------- QR code do convite ----------
// Sempre preto no branco (mesmo no tema escuro), que é o que as câmeras leem melhor.
function qrSvg(text) {
  const q = window.QRLib.make(text), n = q.size, b = 2, N = n + b * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.dark(r, c)) d += "M" + (c + b) + " " + (r + b) + "h1v1h-1z";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + " " + N + '" shape-rendering="crispEdges"><rect width="' + N + '" height="' + N + '" fill="#fff"/><path d="' + d + '" fill="#10212e"/></svg>';
}

function renderInviteQR() {
  const box = $("invQr");
  try { box.innerHTML = qrSvg(inviteUrl()); } // o SVG é gerado pelo app a partir do link, sem dados digitados por ninguém
  catch (e) { box.textContent = ""; $("invQrShare").hidden = true; }
}

// imagem pronta para mandar no WhatsApp ou postar: QR + nome do grupo
function inviteQrPng() {
  return new Promise((res, rej) => {
    const q = window.QRLib.make(inviteUrl()), W = 720, H = 900, cell = Math.floor(520 / (q.size + 4));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#1d8fe0"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.textAlign = "center";
    g.font = "bold 46px system-ui, sans-serif"; g.fillText("💧 Desafio da Água", W / 2, 90);
    g.font = "30px system-ui, sans-serif"; g.fillText(String(group.name).slice(0, 34), W / 2, 140);
    const side = cell * (q.size + 4), x0 = (W - side) / 2, y0 = 190;
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect ? g.roundRect(x0 - 10, y0 - 10, side + 20, side + 20, 24) : g.rect(x0 - 10, y0 - 10, side + 20, side + 20); g.fill();
    g.fillStyle = "#10212e";
    for (let r = 0; r < q.size; r++) for (let k = 0; k < q.size; k++) if (q.dark(r, k)) g.fillRect(x0 + (k + 2) * cell, y0 + (r + 2) * cell, cell, cell);
    g.fillStyle = "#fff"; g.font = "28px system-ui, sans-serif";
    g.fillText("Aponte a câmera para entrar no grupo", W / 2, y0 + side + 70);
    c.toBlob(b => b ? res(b) : rej(new Error("falha ao gerar a imagem")), "image/png");
  });
}

$("invQrShare").onclick = async () => {
  try {
    const blob = await inviteQrPng(), file = new File([blob], "convite-desafio-da-agua.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Desafio da Água", text: "Entra no meu grupo do Desafio da Água: " + group.name });
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    note("Imagem do convite baixada.", true);
  } catch (e) { if (e && e.name !== "AbortError") note("Não consegui gerar a imagem: " + (e.message || e)); }
};

$("invite").onclick = () => {
  const box = $("invBox"); box.hidden = !box.hidden;
  $("invLink").textContent = inviteUrl(); $("invCode").textContent = group.invite_code;
  $("invNew").hidden = group.owner_id !== me.id;
  $("invNewRow").hidden = group.owner_id !== me.id;
  if (!box.hidden) renderInviteQR();
};
$("invShare").onclick = async () => {
  const url = inviteUrl(), text = "Entra no meu grupo do Desafio da Água: " + group.name;
  try {
    if (navigator.share) { await navigator.share({ title: "Desafio da Água", text, url }); return; }
    await navigator.clipboard.writeText(url); note("Link copiado! Cole numa conversa.", true);
  } catch (e) { note("Copie o link manualmente: " + url); }
};
// só o código, para quem já tem conta colar em "Entrar com um código"
$("invCopy").onclick = async () => {
  const c = group.invite_code;
  try { await navigator.clipboard.writeText(c); note("Código copiado! Quem já tem conta cola em Trocar de grupo → Entrar com um código.", true); }
  catch (e) { note("Seu código: " + c, true); }
};
$("invNew").onclick = async () => {
  if (!(await askDialog({ title: "Gerar um novo código?", text: "O link e o QR code de convite antigos deixam de funcionar. Quem já entrou continua no grupo.", okText: "Gerar novo código" }))) return;
  const { data, error } = await sb.rpc("regenerate_invite", { gid: group.id });
  if (error) { note("Não consegui gerar o código: " + error.message); return; }
  group.invite_code = data; $("invLink").textContent = inviteUrl(); $("invCode").textContent = data; renderInviteQR(); note("Novo link gerado: o QR code também mudou.", true);
};

function openGroup(g) {
  group = g; lsSet("agua-group", g.id); logs = []; members = []; reacts = {}; openLogs = {}; hist = []; histKey = ""; dayGoals = {}; $("membersCard").hidden = true; note("");
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

// ---------- Histórico do grupo (calendário, estilo GymRats) ----------
let hMonth = "", hSel = "", hRows = {}, hDayLogs = null, hDayKey = "";

function addMonths(first, n) { const [y, m] = first.split("-").map(Number); return iso(new Date(y, m - 1 + n, 1)); }
const longDate = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); };

function showHistory() {
  if (!group) return;
  screen("history"); note("");
  $("hGroup").textContent = "📅 " + group.name;
  hMonth = periodStart("month"); hSel = day;
  renderCalendar(); loadMonth();
}

async function loadMonth() {
  const gid = group.id, m = hMonth, key = gid + "|" + m, next = addMonths(m, 1);
  if (!hRows[key] || m === periodStart("month")) { // o mês atual sempre recarrega (ainda está mudando)
    const { data, error } = await sb.rpc("group_totals", { gid, since: m });
    if (error) { note("Histórico indisponível: rode o migracao-novidades.sql no Supabase."); return; }
    hRows[key] = (data || []).filter(r => r.day < next);
  }
  if (!group || group.id !== gid || hMonth !== m) return;
  renderCalendar(); loadDay();
}

function monthRows() { return (group && hRows[group.id + "|" + hMonth]) || []; }

// a meta que valia para uma pessoa num dia (guardada no registro; hoje = a atual)
function histGoal(r) {
  const ppl = people(), cur = (ppl[r.user_id] || {}).goal || effGoal(GOAL);
  return r.day === day ? cur : (r.goal > 0 ? r.goal : cur);
}

function renderCalendar() {
  if (!group || !hMonth) return;
  const [y, m] = hMonth.split("-").map(Number);
  const ml = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("hMonthLabel").textContent = ml.charAt(0).toUpperCase() + ml.slice(1); // "Novembro de 2026"
  $("hPrev").disabled = hMonth <= addMonths(periodStart("month"), -12);
  $("hNext").disabled = hMonth >= periodStart("month");
  const rows = monthRows(), grid = $("hGrid"); grid.textContent = "";
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // semana começa na segunda
  for (let i = 0; i < offset; i++) { const e = document.createElement("span"); e.className = "cal-blank"; grid.appendChild(e); }
  let anyDays = 0, myHits = 0;
  for (let d = hMonth; d < addMonths(hMonth, 1); d = addDays(d, 1)) {
    const dayRows = rows.filter(r => r.day === d), mine = dayRows.find(r => r.user_id === me.id);
    const hit = mine && mine.ml >= histGoal(mine);
    if (dayRows.length) anyDays++;
    if (hit) myHits++;
    const b = document.createElement("button");
    b.className = "cal-day" + (dayRows.length ? " has" : "") + (d === day ? " today" : "") + (d === hSel ? " sel" : "");
    b.disabled = d > day;
    const n = document.createElement("span"); n.textContent = String(Number(d.slice(8)));
    const mk = document.createElement("small"); mk.textContent = hit ? "✅" : mine ? "💧" : "";
    b.append(n, mk);
    b.setAttribute("aria-label", longDate(d) + (hit ? ", você bateu a meta" : mine ? ", você registrou" : "") + (dayRows.length ? ", " + dayRows.length + (dayRows.length === 1 ? " pessoa registrou" : " pessoas registraram") : ""));
    b.onclick = () => { hSel = d; renderCalendar(); loadDay(); };
    grid.appendChild(b);
  }
  const [yy, mm] = hMonth.split("-").map(Number);
  const mName = new Date(yy, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  $("hSummary").textContent = anyDays
    ? "Em " + mName + ": o grupo registrou água em " + anyDays + (anyDays === 1 ? " dia" : " dias") + "; você bateu a meta em " + myHits + "."
    : "Ninguém registrou água em " + mName + ".";
}

async function loadDay() {
  if (!group || !hSel) return;
  const gid = group.id, d = hSel, key = gid + "|" + d;
  $("hDayTitle").textContent = longDate(d) + (d === day ? " (hoje)" : "");
  if (hDayKey !== key) { hDayLogs = null; renderDay(); }
  const { data, error } = await sb.from("logs").select("id,user_id,ml,photo_path,created_at,profiles!user_id(name)")
    .eq("group_id", gid).eq("day", d).order("created_at", { ascending: false });
  if (error || !group || group.id !== gid || hSel !== d) return;
  hDayKey = key; hDayLogs = data || []; renderDay();
  const need = hDayLogs.filter(l => l.photo_path).map(l => l.photo_path).filter(p => !signed[p] || signed[p].exp < Date.now());
  if (need.length) { await signPhotos(need); renderDay(); }
}

function renderDay() {
  const board = $("hDayBoard"), proofs = $("hDayProofs"), win = $("hDayWinner");
  board.textContent = ""; proofs.textContent = ""; win.textContent = "";
  if (!hDayLogs) { win.textContent = "Carregando…"; return; }
  if (!hDayLogs.length) { win.textContent = "Ninguém registrou água neste dia."; return; }
  const goalRow = {}; monthRows().filter(r => r.day === hSel).forEach(r => { goalRow[r.user_id] = histGoal(r); });
  const ppl = people(), tot = {};
  hDayLogs.forEach(l => {
    const t = tot[l.user_id] || (tot[l.user_id] = { uid: l.user_id, name: (l.profiles && l.profiles.name) || (ppl[l.user_id] || {}).name || "?", ml: 0 });
    t.ml += l.ml;
  });
  const rows = Object.values(tot).sort((a, b) => b.ml - a.ml);
  const top = rows[0].ml, champs = rows.filter(r => r.ml === top).map(r => r.name).join(" e ");
  win.textContent = (hSel === day ? "🏆 Liderando hoje: " : "🏆 Vencedor do dia: ") + champs + " (" + top.toLocaleString("pt-BR") + " ml)";
  const medals = ["🥇", "🥈", "🥉"], max = Math.max(top, 1);
  rows.forEach((r, i) => {
    const goal = goalRow[r.uid] || (ppl[r.uid] || {}).goal || GOAL;
    const w = document.createElement("div"); w.className = "row2";
    const pos = document.createElement("div"); pos.className = "pos"; pos.textContent = medals[i] || String(i + 1);
    const mid = document.createElement("div"); mid.style.flex = "1";
    const nm = document.createElement("div"); nm.className = "nm";
    const a = document.createElement("span"); a.textContent = r.name + (r.ml >= goal ? " ✅" : "");
    const c = document.createElement("span"); c.className = "mut"; c.textContent = r.ml + " / " + goal + " ml";
    nm.append(a, c);
    const bar = document.createElement("div"); bar.className = "bar";
    const fill = document.createElement("i"); fill.style.width = Math.round(r.ml / max * 100) + "%";
    bar.appendChild(fill); mid.append(nm, bar); w.append(pos, avatarEl(r.uid, r.name, 30), mid); board.appendChild(w);
  });
  hDayLogs.filter(l => l.photo_path).forEach(l => {
    const f = document.createElement("figure"); f.className = "pf";
    const im = document.createElement("img"); im.alt = "Prova de " + ((l.profiles && l.profiles.name) || ""); im.loading = "lazy";
    const sg = signed[l.photo_path]; if (sg && sg.url) im.src = sg.url;
    const cap = document.createElement("figcaption");
    cap.textContent = ((l.profiles && l.profiles.name) || "?") + " · " + l.ml + " ml · " +
      new Date(l.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    cap.prepend(avatarEl(l.user_id, (l.profiles && l.profiles.name) || "?", 18));
    f.append(im, cap); proofs.appendChild(f);
  });
}

$("histBtn").onclick = showHistory;
$("hBack").onclick = () => { if (group) openGroup(group); else showGroups(); };
$("hPrev").onclick = () => { hMonth = addMonths(hMonth, -1); hSel = ""; renderCalendar(); $("hDayTitle").textContent = "Toque num dia para ver o ranking e as fotos"; hDayLogs = []; renderDay(); $("hDayWinner").textContent = ""; loadMonth(); };
$("hNext").onclick = () => { hMonth = addMonths(hMonth, 1); hSel = hMonth === periodStart("month") ? day : ""; renderCalendar(); if (!hSel) { $("hDayTitle").textContent = "Toque num dia para ver o ranking e as fotos"; hDayLogs = []; renderDay(); $("hDayWinner").textContent = ""; } loadMonth(); };

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

let bEditing = -1; // garrafinha sendo editada (-1 = nenhuma)

function renderBottleEditor() {
  const box = $("bList"); box.textContent = "";
  bottles.forEach((b, i) => {
    const row = document.createElement("div"); row.className = "nm";
    const tx = document.createElement("span"); tx.textContent = b.name + " · " + b.ml + " ml";
    const acts = document.createElement("span"); acts.className = "chips"; acts.style.marginTop = "0";
    const ed = document.createElement("button"); ed.className = "chip"; ed.textContent = "✏️ Editar";
    ed.onclick = () => startEditBottle(i);
    const del = document.createElement("button"); del.className = "chip danger"; del.textContent = "🗑️ Remover";
    del.disabled = bottles.length === 1; del.title = bottles.length === 1 ? "Você precisa ter pelo menos uma" : "Remover";
    del.onclick = () => { stopEditBottle(); saveBottles(bottles.filter((_, k) => k !== i)); };
    acts.append(ed, del); row.append(tx, acts); box.appendChild(row);
  });
  $("bAdd").disabled = bEditing < 0 && bottles.length >= 6;
}

function startEditBottle(i) {
  bEditing = i;
  $("bName").value = bottles[i].name; $("bMl").value = bottles[i].ml;
  $("bAdd").textContent = "Salvar alteração"; $("bCancel").hidden = false;
  renderBottleEditor(); $("bName").focus();
}

function stopEditBottle() {
  bEditing = -1; $("bName").value = ""; $("bMl").value = "";
  $("bAdd").textContent = "+ Adicionar garrafinha"; $("bCancel").hidden = true;
}

$("bCancel").onclick = () => { stopEditBottle(); renderBottleEditor(); };

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
  if (bEditing >= 0) {
    const list = bottles.slice(); list[bEditing] = { name, ml };
    stopEditBottle(); saveBottles(list); return;
  }
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
  const lKey = "agua-cache-logs-" + gid;
  if (error) {
    if (!isNetErr(error)) { note("Erro ao carregar: " + error.message); return; }
    const c = readCache(lKey); // sem internet: mostra o último placar salvo de hoje
    if (c && c.day === day && group && group.id === gid) { logs = c.logs || []; render(); }
    offlineNote(); renderQueue(); return;
  }
  if (!group || group.id !== gid) return; // trocou de grupo no meio do caminho
  lsSet(lKey, JSON.stringify({ day, logs: (data || []).map(l => Object.assign({}, l, { photo_path: null })) })); // sem fotos: os links vencem
  // limpa o aviso de erro de carregamento e os de "em andamento" ("Enviando…");
  // os demais (ex.: "Senha alterada!") continuam na tela
  const nt = $("note").textContent;
  if (nt.startsWith("Erro ao carregar") || nt.endsWith("…") || nt === OFFLINE_MSG) note("");
  logs = data || []; render(); loadMembers(); loadWinner(); loadHistory(); loadReactions();
  renderQueue(); if (queueCount) flushQueue();
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
// meta de cada pessoa em cada dia passado, como estava guardada no registro (dayGoals[uid][dia])
let dayGoals = {};

// a meta que vale para uma pessoa num dia: hoje usa a meta atual; dias passados, a guardada naquele dia
function goalFor(uid, d, current) {
  if (d === day) return current;
  const g = dayGoals[uid] && dayGoals[uid][d];
  return g > 0 ? g : current; // registros de antes da atualização não têm meta guardada
}

function dailyTotals() {
  const t = {};
  hist.forEach(h => { if (h.day !== day) (t[h.user_id] || (t[h.user_id] = {}))[h.day] = h.ml; });
  logs.forEach(l => { const u = t[l.user_id] || (t[l.user_id] = {}); u[day] = (u[day] || 0) + l.ml; });
  return t;
}

// dias seguidos batendo a meta; se hoje ainda não bateu, conta a partir de ontem (não zera no meio do dia)
function streakOf(uid, totals, goal) {
  const u = totals[uid] || {}, hit = d => (u[d] || 0) >= goalFor(uid, d, goal);
  let d = hit(day) ? day : addDays(day, -1), n = 0;
  while (hit(d) && n < 62) { n++; d = addDays(d, -1); }
  return n;
}

async function loadHistory() {
  if (!me || !group) return;
  const gid = group.id, key = gid + "|" + day;
  const since = [periodStart("month"), addDays(day, -62)].sort()[0];
  const { data, error } = await sb.rpc("group_totals", { gid, since });
  if (error) { if (histKey !== key) note("Ranking da semana/mês indisponível: rode o migracao-ranking.sql no Supabase."); return; }
  if (!group || group.id !== gid) return;
  histKey = key; hist = data || [];
  dayGoals = {}; hist.forEach(h => { if (h.goal) (dayGoals[h.user_id] || (dayGoals[h.user_id] = {}))[h.day] = h.goal; });
  render();
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
    Object.keys(u).forEach(d => { if (d >= start && d <= day) { ml += u[d]; if (u[d] >= goalFor(uid, d, p.goal)) hit++; } });
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
  const msg = "Seus registros e fotos neste grupo serão apagados." + (owner ? "\n\nVocê é o dono: a posse passa para o membro mais antigo (se não houver outros, o grupo é excluído)." : "");
  if (!(await askDialog({ title: 'Sair do grupo "' + group.name + '"?', text: msg, okText: "Sair do grupo", danger: true }))) return;
  const { data, error } = await sb.rpc("leave_group", { gid });
  if (error) { note("Não consegui sair do grupo."); return; }
  if (data && data.length) sb.storage.from("proofs").remove(data);
  myGroups = myGroups.filter(x => x.id !== gid);
  if (lsGet("agua-group") === gid) lsDel("agua-group");
  showGroups(); note("Você saiu do grupo.", true);
};

async function deleteAccount() {
  const t = await askDialog({
    title: "Excluir sua conta?",
    text: "Isso apaga sua conta, seus registros e suas fotos para sempre. Não dá para desfazer.\n\nPara confirmar, digite EXCLUIR.",
    okText: "Excluir conta", danger: true,
    input: { placeholder: "EXCLUIR", validate: v => v.trim().toUpperCase() === "EXCLUIR" ? null : "Digite EXCLUIR para confirmar." }
  });
  if (!t) return;
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
    clearCaches();
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
  stopEditBottle(); renderBottleEditor();
  $("emailFreq").value = myEmailFreq;
  $("reminder").value = String(myReminder);
  pickHours = myHours.length ? myHours.slice() : [9, 12, 15, 18]; renderHours();
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
  // hoje vale a meta atual; nos dias passados, a meta pessoal guardada naquele dia
  const gOf = d => (d !== day && t[d] && t[d].goal > 0) ? t[d].goal : goal;
  const hitOn = d => ml(d) > 0 && ml(d) >= gOf(d);
  const fmtL = v => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " L";
  const dayLabel = d => { const [y, m, dd] = d.split("-"); return dd + "/" + m; };

  // números gerais
  let sum30 = 0, hit30 = 0;
  for (let i = 0; i < 30; i++) { const d = addDays(day, -i); sum30 += ml(d); if (hitOn(d)) hit30++; }
  const days = Object.keys(t).sort();
  const totalMl = rows.reduce((s, r) => s + r.ml, 0), totalPhotos = rows.reduce((s, r) => s + r.photos, 0);
  const hitDays = days.filter(hitOn).length;
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    if (hitOn(d)) { run = (prev && addDays(prev, 1) === d) ? run + 1 : 1; prev = d; best = Math.max(best, run); }
  });
  let cur = 0, d0 = hitOn(day) ? day : addDays(day, -1);
  while (hitOn(d0) && cur < 3650) { cur++; d0 = addDays(d0, -1); }

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
    const met = hitOn(d);
    col.className = "col" + (met ? "" : " low");
    col.setAttribute("aria-label", dayLabel(d) + ": " + v + " ml" + (met ? ", meta batida" : ""));
    const bar = document.createElement("i"); bar.style.height = (v ? Math.max(2, v / top * 100) : 0) + "%";
    col.appendChild(bar);
    const show = () => {
      chart.querySelectorAll(".col").forEach(c => c.classList.remove("sel")); col.classList.add("sel");
      $("hInfo").textContent = dayLabel(d) + (d === day ? " (hoje)" : "") + ": " + v.toLocaleString("pt-BR") + " ml" + (met ? " · meta de " + gOf(d) + " ml batida ✅" : " · meta de " + gOf(d) + " ml");
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
  else if (lastScreen === "history" && group) { screen("history"); renderCalendar(); renderDay(); }
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

const BLOCKED_MSG = "As notificações estão bloqueadas para este app. iPhone: Ajustes → Notificações → Desafio da Água → Permitir. Android: toque no cadeado ao lado do endereço (ou segure o ícone do app → Informações) → Notificações → Permitir.";
async function enablePush() {
  if (!vapidReady()) throw new Error("Falta preencher a VAPID_PUBLIC_KEY no config.js.");
  if (isIOS && !isStandalone) throw new Error("No iPhone, instale o app na Tela de Início e abra pelo ícone para ativar os lembretes.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este navegador não aceita notificações.");
  // o pedido de permissão precisa ser a 1ª espera depois do toque, senão o iPhone não mostra a janela
  if (Notification.permission === "denied") throw new Error(BLOCKED_MSG);
  const perm = await Notification.requestPermission();
  if (perm === "denied") throw new Error(BLOCKED_MSG);
  if (perm !== "granted") throw new Error("Você não permitiu as notificações. Toque de novo e escolha Permitir.");
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

// horários escolhidos (7h às 22h), marcados na grade
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
let pickHours = [];
function renderHours() {
  $("hoursBox").hidden = $("reminder").value !== "1";
  const g = $("hoursGrid"); g.textContent = "";
  HOURS.forEach(h => {
    const b = document.createElement("button"); b.textContent = h + "h";
    b.className = pickHours.includes(h) ? "on" : "";
    b.setAttribute("aria-pressed", pickHours.includes(h) ? "true" : "false");
    b.onclick = () => { pickHours = pickHours.includes(h) ? pickHours.filter(x => x !== h) : pickHours.concat([h]).sort((a, z) => a - z); renderHours(); };
    g.appendChild(b);
  });
}
$("reminder").onchange = renderHours;

$("saveReminder").onclick = async () => {
  const v = parseInt($("reminder").value, 10);
  if (v === 1 && !pickHours.length) { note("Escolha pelo menos um horário."); return; }
  try {
    if (v > 0) { note("Ativando…", true); await enablePush(); }
    const patch = { reminder_every: v };
    if (v === 1) patch.reminder_hours = pickHours;
    const { error } = await sb.from("profiles").update(patch).eq("id", me.id);
    if (error) throw new Error(/reminder/.test(error.message) && v === 1 ? "Horários escolhidos indisponíveis: rode o migracao-novidades.sql no Supabase." : "Não consegui salvar: " + error.message);
    myReminder = v; if (v === 1) myHours = pickHours.slice();
    note(v === 1 ? "Lembretes ativados às " + pickHours.map(h => h + "h").join(", ") + "!" : v ? "Lembretes ativados a cada " + v + " horas!" : "Lembretes desligados.", true);
  } catch (e) { $("reminder").value = String(myReminder); renderHours(); note(e.message || String(e)); }
  $("pushHint").textContent = pushHintText();
};

$("testPush").onclick = async () => {
  try {
    await enablePush(); // pede a permissão (se ainda não tiver) e cadastra este aparelho
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
  if (!(await askDialog({ title: "Remover registro?", text: "Remover " + who + " de " + l.ml + " ml" + (l.photo_path ? ", junto com a foto" : "") + "?", okText: "Remover", danger: true }))) return;
  if (l.photo_path) await sb.storage.from("proofs").remove([l.photo_path]); // a foto sai antes do registro
  const { error } = await sb.from("logs").delete().eq("id", l.id);
  if (error) { note("Não consegui remover: " + error.message); return; }
  note("Registro removido.", true); await load();
}

async function removeMember(m) {
  const name = (m.profiles && m.profiles.name) || "esta pessoa";
  if (!(await askDialog({ title: "Remover " + name + " do grupo?", text: "Todos os registros, fotos e reações dessa pessoa neste grupo serão apagados.\n\nPara ela não voltar com o mesmo link, gere um novo código de convite depois.", okText: "Remover do grupo", danger: true }))) return;
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

function logErrMsg(m) {
  return /limite_diario/.test(m) ? "Limite diário de 6000 ml neste grupo atingido. Por segurança, o app não registra mais que isso por dia."
    : /dia_invalido/.test(m) ? "Data inválida. Confira a data e a hora do seu aparelho."
    : /foto_obrigatoria/.test(m) ? "Neste grupo, todo registro precisa de foto. Use um dos botões 📸."
    : "Não consegui salvar: " + m;
}

async function addLog(ml, blob) {
  if (!me || !group || !(ml > 0)) return;
  syncDay(); // registro sempre no dia de hoje, mesmo se o app ficou aberto desde ontem
  const item = { user_id: me.id, group_id: group.id, ml, day, blob: blob || null, photo_path: null, created: Date.now() };
  if (!navigator.onLine) return enqueue(item);
  const r = await sendLog(item);
  if (r === "net") return enqueue(item);
  if (r) { note(r); return; }
  await load();
}

// envia um registro (foto primeiro). Devolve "" (deu certo), "net" (sem internet) ou a mensagem de erro.
async function sendLog(it) {
  if (it.blob && !it.photo_path) {
    const path = it.user_id + "/" + it.created + ".jpg";
    const up = await sb.storage.from("proofs").upload(path, it.blob, { contentType: "image/jpeg" });
    // "já existe" = a foto subiu numa tentativa anterior, mas a resposta se perdeu no caminho
    if (up.error && !/already exists|duplicate/i.test(up.error.message || "")) return isNetErr(up.error) ? "net" : "Não consegui enviar a foto: " + up.error.message;
    it.photo_path = path;
  }
  const { error } = await sb.from("logs").insert({ group_id: it.group_id, ml: it.ml, day: it.day, photo_path: it.photo_path });
  if (!error) return "";
  if (isNetErr(error)) return "net";
  if (it.photo_path) sb.storage.from("proofs").remove([it.photo_path]);
  return logErrMsg(error.message);
}

// ---------- Modo sem internet ----------
// Sem conexão, o app mostra os últimos dados salvos neste aparelho e guarda os registros
// (com a foto) numa fila. Quando a internet volta, a fila é enviada sozinha, na ordem.
const OFFLINE_MSG = "Sem internet: mostrando os últimos dados salvos neste aparelho.";
const QUEUE_MAX = 20;
let queueCount = 0, queueMl = 0, flushing = false;
function isNetErr(e) {
  if (!navigator.onLine) return true;
  const m = String((e && (e.message || e.name)) || e || "");
  return /failed to fetch|networkerror|network error|load failed|network request failed|fetch failed/i.test(m);
}
function readCache(k) { try { return JSON.parse(lsGet(k) || "null"); } catch (e) { return null; } }
function offlineNote() { const t = $("note").textContent; if (!t || t.startsWith("Erro ao carregar")) note(OFFLINE_MSG); }

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("sem IndexedDB"));
    const op = indexedDB.open("desafio-agua", 1);
    op.onupgradeneeded = () => op.result.createObjectStore("fila", { keyPath: "id", autoIncrement: true });
    op.onerror = () => reject(op.error);
    op.onsuccess = () => {
      const db = op.result, tx = db.transaction("fila", mode), st = tx.objectStore("fila");
      let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
const queueAll = () => idb("readonly", st => st.getAll()).then(l => (l || []).filter(x => me && x.user_id === me.id)).catch(() => []);

async function enqueue(it) {
  const list = await queueAll();
  if (list.length >= QUEUE_MAX) { note("Sem internet e a fila já tem " + QUEUE_MAX + " registros. Espere a conexão voltar."); return; }
  const rec = Object.assign({}, it);
  if (rec.blob) { rec.photo = await rec.blob.arrayBuffer(); } // guardado como bytes (funciona em todos os celulares)
  delete rec.blob;
  try { await idb("readwrite", st => st.add(rec)); }
  catch (e) { note("Sem internet e não consegui guardar o registro neste aparelho. Tente de novo quando a conexão voltar."); return; }
  note("Sem internet: registro guardado. Ele será enviado sozinho quando a conexão voltar.", true);
  renderQueue();
}

async function renderQueue() {
  const list = me ? await queueAll() : [];
  queueCount = list.length; queueMl = 0;
  const here = list.filter(x => group && x.group_id === group.id);
  here.forEach(x => { queueMl += x.ml; });
  const el = $("queueLine");
  el.hidden = !here.length;
  el.textContent = here.length ? "⏳ " + (here.length === 1 ? "1 registro esperando" : here.length + " registros esperando") + " internet (" + queueMl + " ml)" : "";
}

async function flushQueue() {
  if (flushing || !me || !sb || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  const problems = [];
  try {
    const list = (await queueAll()).sort((a, b) => a.created - b.created);
    for (const it of list) {
      const item = Object.assign({}, it, { blob: it.photo ? new Blob([it.photo], { type: "image/jpeg" }) : null });
      const r = await sendLog(item);
      if (r === "net") { // caiu de novo: guarda o que já subiu (a foto) e tenta depois
        if (item.photo_path && !it.photo_path) await idb("readwrite", st => st.put(Object.assign({}, it, { photo_path: item.photo_path }))).catch(() => {});
        break;
      }
      await idb("readwrite", st => st.delete(it.id)).catch(() => {});
      if (r) problems.push(r); else sent++;
    }
  } finally { flushing = false; }
  await renderQueue();
  if (problems.length) note("Um registro feito sem internet não entrou: " + problems[0]);
  else if (sent) note(sent === 1 ? "Registro feito sem internet enviado! ✅" : sent + " registros feitos sem internet enviados! ✅", true);
  if (sent && group) load();
}

window.addEventListener("online", () => { flushQueue(); if (group) load(); });
window.addEventListener("offline", () => { if (me) note(OFFLINE_MSG); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flushQueue(); });

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
$("custom").onclick = async () => {
  const v = await askDialog({
    title: "Outro valor", text: "Quantos ml você bebeu?", okText: "Registrar",
    input: { type: "number", value: "250", inputmode: "numeric", placeholder: "ml",
             validate: v => { const n = parseInt(v, 10); return n >= 1 && n <= 5000 ? null : "Digite um valor entre 1 e 5000 ml."; } }
  });
  if (v) ask(parseInt(v, 10));
};
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

// ---------- Atualização automática ----------
// A versão deste app é o número do "?v=" do app.js no index.html. Ao voltar para o app (e a cada 30 min),
// ele confere a versão publicada no site; se mudou, recarrega sozinho e avisa "App atualizado".
// Nunca recarrega no meio de algo: janela aberta, envio em andamento ou sem internet.
const APP_VERSION = ((document.currentScript && document.currentScript.src.match(/[?&]v=(\d+)/)) || [])[1] || "";
let lastVersionCheck = 0;
function busyNow() {
  return !$("dlg").hidden || flushing || $("note").textContent.endsWith("…") || !navigator.onLine;
}
async function checkForUpdate(force) {
  if (!APP_VERSION || (!force && Date.now() - lastVersionCheck < 60000)) return;
  lastVersionCheck = Date.now();
  try {
    const r = await fetch("/?checar-versao=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const m = (await r.text()).match(/app\.js\?v=(\d+)/);
    if (!m || m[1] === APP_VERSION) return;
    // trava contra recarregar sem parar, caso o site ainda esteja publicando
    if (sessionStorage.getItem("agua-recarregou") === m[1]) return;
    if (busyNow()) { lastVersionCheck = 0; return; } // tenta de novo na próxima vez
    sessionStorage.setItem("agua-recarregou", m[1]);
    const reg = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update().catch(() => {});
    location.reload();
  } catch (e) { /* sem internet ou site fora do ar: tenta depois */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
setInterval(() => { if (document.visibilityState === "visible") checkForUpdate(true); }, 30 * 60000);
try {
  if (sessionStorage.getItem("agua-recarregou") === APP_VERSION) {
    sessionStorage.removeItem("agua-recarregou");
    setTimeout(() => note("App atualizado ✅", true), 1500);
  }
} catch (e) {}
setTimeout(() => checkForUpdate(true), 5000); // também confere logo depois de abrir

// ---------- Início ----------
if (configError) {
  note(configError);
} else {
  sb.auth.getSession().then(({ data }) => { if (!data.session) showAuth(); });
}