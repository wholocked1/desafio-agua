# Notificações: e-mail de ranking e lembretes no celular

Faça no computador, nesta ordem. Os nomes dos botões do Supabase podem variar um pouco conforme a versão do painel.

## 1. Gerar as chaves das notificações
1. Dê dois cliques no arquivo `gerar-chaves-vapid.html` (ele abre no navegador do seu computador).
2. Clique em **Gerar chaves** e deixe a página aberta até terminar os passos 2 e 4.
3. A **pública** vai no `config.js` e no Supabase. A **privada** vai só no Supabase.

## 2. Colocar a chave pública no app
No `config.js`, preencha `VAPID_PUBLIC_KEY` com a chave **pública** (mantendo as aspas).

## 3. Preparar o banco
Num projeto novo, o `setup.sql` já cria tudo o que as notificações precisam. Se o seu banco já existe e o app está funcionando, pule este passo.

## 4. Criar a função de envio
1. No Supabase, abra **Edge Functions** e clique em **Deploy a new function → Via Editor**.
2. Dê o nome **`notify`** (exatamente assim, em minúsculas).
3. Apague o código de exemplo, cole todo o conteúdo de `supabase/functions/notify/index.ts` e clique em **Deploy**.
4. Nas configurações da função, **desligue** a opção de verificação de JWT (**Verify JWT** / **Enforce JWT verification**) e salve. A própria função confere quem está chamando.
5. Em **Edge Functions → Secrets**, adicione:

| Nome | Valor |
|---|---|
| `GMAIL_USER` | o Gmail do app, ex.: `desafiodaagua.app@gmail.com` |
| `GMAIL_APP_PASSWORD` | a senha de app de 16 letras (com ou sem espaços) |
| `VAPID_PUBLIC_KEY` | a chave pública |
| `VAPID_PRIVATE_KEY` | a chave privada |
| `APP_URL` | `https://desafio-agua-jbo9.vercel.app` |

## 5. Publicar o app
Envie o `index.html`, o `config.js` e o `sw.js` para o GitHub e espere o Vercel publicar.

## 6. Testar (antes de agendar)
1. **E-mail:** no app, abra o **Perfil** e toque em **Me mandar um resumo**. Deve chegar um e-mail com o ranking desta semana até agora (confira o spam).
2. **Lembretes:** no iPhone, abra o app **pelo ícone da Tela de Início**. No Perfil, escolha **A cada 2 horas**, toque em **Salvar** e permita as notificações. Depois toque em **Testar notificação**.

Se aparecer erro, anote a mensagem do rodapé e consulte o registro no SQL Editor (a tabela de registro já vem no `setup.sql`):
```sql
select created_at at time zone 'America/Sao_Paulo' as quando, kind, status, detail
  from public.notify_log order by id desc limit 30;
```

## 7. Agendar os envios
1. Abra o `agendar-envios.sql` e troque `https://SEU-PROJETO.supabase.co` pela sua Project URL (a mesma do `index.html`).
2. Cole no SQL Editor, numa aba nova, e rode.

A agenda (horário de Brasília):
- **Resumo semanal:** segunda-feira, 9h (semana anterior, de segunda a domingo).
- **Resumo mensal:** dia 1º, 9h (mês anterior).
- **Lembretes:** de hora em hora entre 9h e 21h. Cada pessoa recebe a cada 2 ou 3 horas, conforme escolheu, e só se ainda não bateu a meta no dia.

Comandos úteis (rode no SQL Editor):
```sql
select jobname, schedule from cron.job;                                                -- ver a agenda
select status_code, content, created from net._http_response order by created desc limit 10;  -- últimas chamadas
```

## Bônus: e-mails de cadastro pelo Gmail
Em **Authentication → Emails → SMTP Settings**, ative o SMTP próprio com:
host `smtp.gmail.com`, porta `465`, usuário e remetente = o Gmail do app, senha = a senha de app, nome do remetente `Desafio da Água`.
Assim os e-mails de confirmação de conta também saem pelo Gmail, sem o limite de 2 por hora.

## Limites e cuidados
- Um Gmail pessoal envia até cerca de 500 e-mails por dia.
- A senha de app e a chave privada ficam **só** nos Secrets do Supabase. Nunca no `index.html`, no GitHub ou numa conversa.
- Se trocar as chaves VAPID, todo mundo precisa ativar os lembretes de novo.
- No iPhone, os lembretes só funcionam com o app instalado na Tela de Início.