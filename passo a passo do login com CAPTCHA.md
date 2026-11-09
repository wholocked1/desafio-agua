# Login: "Esqueci minha senha" e CAPTCHA

Os nomes dos menus podem variar um pouco conforme a versão dos painéis.

## 1. Publicar o app
Envie para o GitHub, no mesmo commit: `index.html`, `app.js`, `app.css` e `vercel.json`.
**Não troque o seu `config.js`**: só acrescente a linha nova do passo 3 nele.

## 2. "Esqueci minha senha" (funciona sem mais nada)
1. Supabase → **Authentication → URL Configuration**: confira se **Redirect URLs** tem `https://desafio-agua-jbo9.vercel.app/**`.
2. Opcional, mas recomendado: deixe o e-mail em português em **Authentication → Emails → Reset Password**:
   - Assunto: `Crie uma nova senha no Desafio da Água`
   - Corpo:
     ```html
     <h2>💧 Desafio da Água</h2>
     <p>Recebemos um pedido para criar uma nova senha para a sua conta.</p>
     <p><a href="{{ .ConfirmationURL }}">Criar nova senha</a></p>
     <p>Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
     ```
3. Se ainda não fez: ative o Gmail do app em **Authentication → Emails → SMTP Settings** (host `smtp.gmail.com`, porta `465`, usuário e remetente = o Gmail do app, senha = a senha de app). Sem isso, o Supabase manda só 2 e-mails por hora.

Para testar: na tela de login, toque em **Esqueci minha senha**, digite seu e-mail, abra o link que chegar no celular e crie a senha nova.

## 3. CAPTCHA (Cloudflare Turnstile)
**A ordem importa.** Se ligar o CAPTCHA no Supabase antes de o app estar pronto, ninguém consegue entrar.

1. Crie uma conta grátis em **dash.cloudflare.com** e abra **Turnstile → Add widget**.
2. Preencha:
   - Nome: `Desafio da Água`
   - Hostname: `desafio-agua-jbo9.vercel.app`
   - Modo: **Managed**
3. Copie a **Site Key** (pública) e a **Secret Key** (secreta). Guarde as duas no seu `.env`.
4. No `config.js`, acrescente a linha abaixo dentro do `APP_CONFIG`, depois do `REQUIRE_PHOTO_ALL: false,` (com vírgula no fim da linha anterior):
   ```js
   TURNSTILE_SITE_KEY: "sua-site-key"
   ```
5. Envie o `config.js` para o GitHub, espere o Vercel e abra o app: a tela de login deve funcionar normalmente.
6. **Só agora**, no Supabase: **Authentication → Bot and Abuse Protection** (ou Attack Protection) → **Enable CAPTCHA protection** → provedor **Turnstile** → cole a **Secret Key** → **Save**.
7. Teste: saia da conta, entre de novo, crie uma conta de teste e peça "Esqueci minha senha".

Se o login parar de funcionar com a mensagem "Não conseguimos confirmar que você não é um robô", desligue o CAPTCHA no Supabase (passo 6) e confira se a Site Key do `config.js` e a Secret Key do Supabase são do mesmo widget.

## Onde fica cada chave
| Chave | Onde vai |
|---|---|
| Turnstile Site Key (pública) | `config.js` |
| Turnstile Secret Key | só no Supabase (Bot and Abuse Protection) e no seu `.env` |