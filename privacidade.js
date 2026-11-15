// Página de privacidade: aplica o tema escolhido no app e mostra o e-mail de contato do config.js.
(function () {
  try {
    const t = localStorage.getItem("agua-tema");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) {}
  const c = (window.APP_CONFIG && String(window.APP_CONFIG.CONTACT_EMAIL || "").trim()) || "";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) {
    const el = document.getElementById("contato");
    el.textContent = "";
    const a = document.createElement("a");
    a.href = "mailto:" + c; a.textContent = c;
    el.appendChild(a);
  }
})();