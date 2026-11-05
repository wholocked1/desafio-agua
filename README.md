# Desafio da Água (versão hospedada)

App instalável no celular (PWA) feito de arquivos estáticos + Supabase para login, placar em tempo real e fotos de prova.

## 1. Criar o projeto no Supabase
1. Crie uma conta e um projeto em supabase.com (o plano gratuito basta para um grupo de amigos).
2. Abra **SQL Editor**, cole o conteúdo de `setup.sql` e clique em **Run**.
   Isso cria as tabelas, os grupos, as regras de segurança, o bucket de fotos e o tempo real.
   Se você já tinha rodado uma versão anterior, leia o aviso no topo do `setup.sql` (há um bloco opcional que apaga tudo para recomeçar).

## 2. Configurar o login
- Em **Authentication → Providers → Email**, deixe o login por e-mail e senha ativo.
- Para os amigos entrarem na hora, desative **Confirm email**. Se preferir manter, cada pessoa precisa clicar no link que chega por e-mail.
- Depois de hospedar, vá em **Authentication → URL Configuration** e coloque o endereço do seu site em **Site URL** (usado nos e-mails de confirmação).

## 3. Colocar as chaves no site
Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable** e cole no topo do script do `index.html`:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "sua-chave-anon";
```

A chave anon é pública por design: quem protege os dados são as regras (RLS) do `setup.sql`.
**Nunca** coloque a chave `service_role` no site.

## 4. Hospedar
Qualquer hospedagem de site estático serve, por exemplo:
- **Netlify Drop** (arrasta a pasta em app.netlify.com/drop)
- **Cloudflare Pages** ou **GitHub Pages**
- **Vercel**

Envie **todos os arquivos da pasta** (`index.html`, `manifest.webmanifest`, `sw.js` e os 3 ícones `.png`) e pronto. Mande o link para os amigos.
O site precisa estar em **https** (todas as hospedagens acima já entregam isso), senão o app não instala nem abre a câmera.

## Ajustes rápidos (topo do script)
- `GOAL`: meta diária em ml.
- `REQUIRE_PHOTO_ALL`: `true` exige foto também nos botões +200/+300/+500/Outro valor.

## Observações
- As fotos ficam num bucket público (URLs longas e difíceis de adivinhar), visíveis só a quem tem o link da foto. Para privacidade total, dá para trocar por bucket privado com links assinados.
- Dá para apagar o histórico antigo quando quiser pelo **Table Editor** (tabela `logs`) e pelo **Storage** (bucket `proofs`).

## Instalar no celular (cada amigo faz uma vez)

**Android (Chrome)**
1. Abra o link do site.
2. Toque nos três pontinhos e em **Instalar app** (ou **Adicionar à tela inicial**).

**iPhone (Safari)**
1. Abra o link **no Safari** (outros navegadores não instalam).
2. Toque no botão de compartilhar e em **Adicionar à Tela de Início**.
3. Abra pelo ícone novo, e não mais pelo navegador.

O app abre em tela cheia com o ícone da gota, pede permissão da câmera na primeira foto e se atualiza sozinho quando você publicar uma versão nova.

## Atualizar o app
Troque os arquivos na hospedagem (ou envie para o GitHub, se ela estiver ligada ao repositório). Quem já instalou recebe a versão nova na próxima vez que abrir o app com internet. Se mudar algum arquivo guardado no celular (como os ícones), aumente o número em `CACHE = "agua-v1"` no `sw.js` para `agua-v2`.

## Grupos e links de convite
Qualquer pessoa pode criar uma conta. Depois de entrar, ela faz uma de duas coisas:
- **Criar um grupo**: dá um nome e vira dona dele. O app gera um código e um link de convite automaticamente.
- **Entrar com um código**: cola o código que recebeu (ou abre o link de convite).

Para convidar amigos: dentro do grupo, toque em **Convidar amigos** e depois em **Compartilhar link**. O link tem este formato: `https://SEU-SITE.netlify.app/?convite=CODIGO`.
Quem abrir o link cai na tela de criar conta (ou entra, se já tiver conta) e já fica dentro do grupo.

Detalhes:
- Cada grupo tem seu próprio placar e suas próprias fotos. Quem não é do grupo não vê nada.
- Uma pessoa pode estar em vários grupos e troca pelo botão **Trocar de grupo**.
- A dona do grupo pode **Gerar novo código** se o link vazar. O link antigo deixa de funcionar, e quem já entrou continua no grupo.
