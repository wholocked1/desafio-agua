// ====== CONFIGURAÇÃO DO DESAFIO DA ÁGUA ======
// Preencha UMA vez. Nas próximas atualizações do app, troque só o index.html e mantenha este arquivo.
// Tudo aqui é público por design (vai para o navegador). NUNCA coloque aqui a senha do banco,
// a chave secret/service_role, a senha do Gmail ou a chave PRIVADA das notificações.
window.APP_CONFIG = {
  // Supabase → Project Settings → API (Project URL)
  SUPABASE_URL: "https://nwiqiaqeiwmvkylcjwrb.supabase.co",

  // Supabase → Project Settings → API Keys (publishable "sb_publishable_..." ou a anon)
  SUPABASE_ANON_KEY: "sb_publishable_AUg94ROop6o5h3387WoKmQ_u_STvhdf",

  // Chave PÚBLICA gerada no gerar-chaves-vapid.html (a mesma do segredo VAPID_PUBLIC_KEY)
  VAPID_PUBLIC_KEY: "BBVhevWiQF2Yt2XzBkNkJbeeSkf7DzFAw4dAbWsJFLWKlVIm4VrBNFuhostPlbCUH_VpMjKhviHUNlMFId1Xpno",

  // Meta diária padrão (ml) para quem ainda não escolheu a própria
  GOAL: 2000,

  // true = exige foto também nos botões +200/+300/+500/Outro valor
  REQUIRE_PHOTO_ALL: false,

  //chave pública do CAPTCHA
  TURNSTILE_SITE_KEY: "0x4AAAAAAF6F7HPNO6uaksFm"
};