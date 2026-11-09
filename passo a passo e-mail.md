# E-mails do Supabase: Gmail e textos em português

Três partes, todas no painel do Supabase. Leva uns 10 minutos.
Os nomes dos botões podem variar um pouco conforme a versão do painel.

Você vai precisar do **Gmail do app** e da **senha de app** de 16 letras (a mesma dos Secrets da função `notify`, guardada no seu `.env`).

---

## 1. Ligar o Gmail como servidor de e-mail

1. No Supabase, abra **Authentication → Emails** e escolha a aba **SMTP Settings**.
2. Ligue **Enable Custom SMTP**.
3. Preencha:

| Campo | O que colocar |
|---|---|
| Sender email (e-mail do remetente) | o Gmail do app, ex.: `desafiodaagua.app@gmail.com` |
| Sender name (nome do remetente) | `Desafio da Água` |
| Host | `smtp.gmail.com` |
| Port number (porta) | `465` |
| Minimum interval between emails | deixe como está (60 segundos) |
| Username (usuário) | o Gmail do app, igual ao remetente |
| Password (senha) | a senha de app de 16 letras, **sem espaços** |

4. Clique em **Save changes**.

O e-mail do remetente precisa ser **o mesmo Gmail** do usuário. Se for outro, o Gmail troca o remetente sozinho ou recusa o envio.

---

## 2. Ajustar o limite de envios

Com o Gmail ligado, o Supabase passa de 2 para **30 e-mails por hora**. Para um grupo de amigos isso costuma bastar, mas dá para subir:

1. Abra **Authentication → Rate Limits**.
2. Em **Rate limit for sending emails**, coloque **60** por hora.
3. Salve.

Não passe muito disso: um Gmail comum envia até cerca de 500 e-mails por dia, e esse limite é dividido com os resumos semanais e mensais.

---

## 3. Textos em português

Abra **Authentication → Emails → Templates**. Para cada modelo abaixo, escolha o tipo na lista, troque o **Subject** (assunto), apague o corpo atual, cole o novo e clique em **Save changes**.

Não mude o que está entre `{{ }}`. São as partes que o Supabase preenche sozinho (o link, o nome da pessoa).

### 3.1 Reset Password (redefinir senha), o mais importante

**Subject:**
```
Crie uma nova senha no Desafio da Água
```

**Corpo (Message body):**
```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#10212e">
  <h2 style="margin:0 0 16px;font-size:22px">💧 Desafio da Água</h2>
  <p style="margin:0 0 12px;font-size:16px">{{ if .Data.name }}Olá, {{ .Data.name }}!{{ else }}Olá!{{ end }}</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.5">Recebemos um pedido para criar uma nova senha para a conta <b>{{ .Email }}</b>. Toque no botão abaixo para escolher a senha nova.</p>
  <p style="margin:0 0 20px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1d8fe0;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 22px;border-radius:10px">Criar nova senha</a>
  </p>
  <p style="margin:0 0 8px;font-size:14px;color:#5d7384;line-height:1.5">O link vale por 1 hora e só pode ser usado uma vez.</p>
  <p style="margin:0;font-size:14px;color:#5d7384;line-height:1.5">Se não foi você que pediu, ignore este e-mail. A sua senha continua a mesma.</p>
</div>
```

### 3.2 Confirm sign up (confirmar cadastro)

Só é usado se você ligar **Confirm email** em Authentication → Sign In / Providers → Email. Vale deixar pronto.

**Subject:**
```
Confirme seu cadastro no Desafio da Água
```

**Corpo:**
```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#10212e">
  <h2 style="margin:0 0 16px;font-size:22px">💧 Desafio da Água</h2>
  <p style="margin:0 0 12px;font-size:16px">{{ if .Data.name }}Olá, {{ .Data.name }}!{{ else }}Olá!{{ end }}</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.5">Falta só um passo para entrar no desafio: confirme que <b>{{ .Email }}</b> é o seu e-mail.</p>
  <p style="margin:0 0 20px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1d8fe0;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 22px;border-radius:10px">Confirmar e-mail</a>
  </p>
  <p style="margin:0;font-size:14px;color:#5d7384;line-height:1.5">Se não foi você que criou a conta, ignore este e-mail.</p>
</div>
```

### 3.3 Password changed (aviso de senha alterada), opcional

Um aviso de segurança mandado depois que a senha muda. Ele só é enviado se estiver ligado no projeto: na lista de modelos, abra **Password changed** e ligue o envio, se a opção aparecer.

**Subject:**
```
Sua senha do Desafio da Água foi alterada
```

**Corpo:**
```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#10212e">
  <h2 style="margin:0 0 16px;font-size:22px">💧 Desafio da Água</h2>
  <p style="margin:0 0 12px;font-size:16px">{{ if .Data.name }}Olá, {{ .Data.name }}!{{ else }}Olá!{{ end }}</p>
  <p style="margin:0 0 12px;font-size:16px;line-height:1.5">A senha da conta <b>{{ .Email }}</b> acabou de ser alterada.</p>
  <p style="margin:0;font-size:14px;color:#5d7384;line-height:1.5">Se foi você, está tudo certo. Se não foi, abra o app e use <b>Esqueci minha senha</b> agora para criar outra.</p>
</div>
```

Os outros modelos (Magic link, Change email address, Invite user, Reauthentication) o app não usa. Pode deixar como estão.

---

## 4. Testar

1. Abra o app no celular, toque em **Esqueci minha senha** e digite o seu e-mail.
2. Em até 1 minuto deve chegar o e-mail **em português**, enviado pelo Gmail do app. Confira também o **spam** e, se cair lá, marque como "Não é spam".
3. Toque em **Criar nova senha**, escolha a senha nova e confira se o app abre já logado.
4. No Gmail do app, a pasta **Enviados** mostra os e-mails que saíram.

**Se não chegar:**
- Confira **Authentication → Logs** no Supabase. Um erro com "authentication failed" ou "535" quer dizer usuário ou senha de app errados.
- Confira se a senha foi colada **sem espaços** e se o remetente é o mesmo Gmail do usuário.
- Se aparecer "Muitos e-mails enviados", espere alguns minutos ou suba o limite da parte 2.