# Desafio da Água (versão hospedada)

App instalável no celular (PWA) feito de arquivos estáticos + Supabase para login, placar em tempo real e fotos de prova.

## 1. Criar o projeto no Supabase
1. Crie uma conta e um projeto em supabase.com (o plano gratuito basta para um grupo de amigos).
2. Abra **SQL Editor**, cole o conteúdo de `setup.sql` e clique em **Run**.
   Isso cria as tabelas, os grupos, as regras de segurança, o bucket de fotos e o tempo real.
   Ele é seguro para rodar de novo: não apaga dados.

## 2. Configurar o login
- Em **Authentication → Providers → Email**, deixe o login por e-mail e senha ativo.
- Para os amigos entrarem na hora, desative **Confirm email**. Se preferir manter, cada pessoa precisa clicar no link que chega por e-mail.
- Depois de hospedar, vá em **Authentication → URL Configuration**. Em **Site URL**, coloque o endereço do seu site (ex.: `https://seu-app.vercel.app`) e, em **Redirect URLs**, adicione `https://seu-app.vercel.app/**`. Sem isso, o link do e-mail de confirmação aponta para `localhost` e não abre no celular.

## 3. Colocar as chaves no site
Abra o `config.js` e preencha os valores (mantendo as aspas):

```js
SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
SUPABASE_ANON_KEY: "sb_publishable_...",
VAPID_PUBLIC_KEY: "chave pública do gerar-chaves-vapid.html",
```

Esses valores são públicos por design: quem protege os dados são as regras do banco.
**Nunca** coloque no `config.js` a chave `secret`/`service_role`, a senha do banco, a senha do Gmail ou a chave privada das notificações.

Nas próximas atualizações do app, troque só o `index.html` (e os outros arquivos que mudarem) e **mantenha o seu `config.js`**.

## Estrutura dos arquivos
| Arquivo | O que tem | Quando mexer |
|---|---|---|
| `index.html` | a estrutura das telas | ao mudar textos ou telas |
| `app.css` | o visual (cores, tamanhos, espaçamentos) | ao mudar a aparência |
| `app.js` | a lógica do app | ao mudar o funcionamento |
| `config.js` | URL e chaves públicas, meta padrão | uma vez, na configuração |
| `sw.js` | o que deixa o app instalável, abrir sem internet e os lembretes | raramente |
| `vercel.json` | regras de segurança da hospedagem | raramente |

O `index.html` não tem mais JavaScript dentro. Por isso a política de segurança do `vercel.json` bloqueia qualquer script embutido na página, o que protege contra injeção de código.
Se você adicionar algum `<script>` direto no HTML, ele será bloqueado: coloque o código no `app.js`.

## 4. Hospedar
Qualquer hospedagem de site estático serve, por exemplo:
- **Netlify Drop** (arrasta a pasta em app.netlify.com/drop)
- **Cloudflare Pages** ou **GitHub Pages**
- **Vercel**

Envie **todos os arquivos da pasta** (`index.html`, `app.css`, `app.js`, `config.js`, `manifest.webmanifest`, `sw.js`, `vercel.json` e os 3 ícones `.png`) e pronto. Mande o link para os amigos.
O site precisa estar em **https** (todas as hospedagens acima já entregam isso), senão o app não instala nem abre a câmera.

## Ajustes rápidos
- `GOAL` (no `config.js`): meta diária padrão em ml.
- `REQUIRE_PHOTO_ALL` (no `config.js`): `true` exige foto também nos botões +200/+300/+500/Outro valor.

## Observações
- As fotos são privadas: só membros do mesmo grupo as veem, por links que expiram em 1 hora.
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
Envie os arquivos novos para o GitHub. O app se atualiza sozinho nos celulares: ao ser aberto (ou ao voltar para ele), confere a versão publicada e, se mudou, recarrega e mostra "App atualizado ✅". Ele espera se houver uma janela aberta, um envio em andamento ou se estiver sem internet. Não precisa desinstalar.

**A regra para isso funcionar:** toda vez que mudar o `app.js` ou o `app.css`, aumente o número da versão nos três lugares, sempre o mesmo número:
- `index.html`: `app.css?v=14` e `app.js?v=14` → `?v=15`;
- `sw.js`: `CACHE = "agua-v14"` → `"agua-v15"` e, na lista `SHELL`, `app.css?v=14` e `app.js?v=14` → `?v=15`.

Versão atual: **14**.

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
- O limite de segurança de **6000 ml por dia vale em cada grupo** separadamente.
- **📅 Histórico do grupo** mostra um calendário do mês; tocando num dia aparecem o vencedor, o placar e as fotos daquele dia.
- A meta de cada dia fica guardada nos registros: trocar a meta depois não muda a sequência 🔥 nem as conquistas antigas.

## Sem internet
- O app abre sem internet mostrando o último placar salvo no aparelho (precisa ter sido aberto com internet pelo menos uma vez depois da atualização).
- Registros feitos sem internet, com ou sem foto, ficam numa fila no celular (até 20) e são enviados sozinhos quando a conexão volta. Aparece a linha "⏳ N registros esperando internet".
- Um registro guardado há mais de um dia é recusado pelo banco ao ser enviado (regra de data), e o app avisa.
- Ao sair da conta, os dados guardados para o modo sem internet são apagados do aparelho.

## Banco de dados
Todo o banco está num arquivo só, o `setup.sql`, organizado em partes (tabelas, funções, gatilhos, regras de acesso, fotos).
- **Projeto novo:** rode o `setup.sql` e depois o `agendar-envios.sql` (trocando a URL na linha marcada).
- **Projeto que já existe:** não precisa rodar nada. Se rodar por engano, não tem problema: ele não apaga dados e só recria as funções e regras na versão atual.
- **Atualização de novembro:** quem já tem o banco rode uma vez o `migracao-novidades.sql` (veja o `PASSO-A-PASSO-NOVIDADES.md`). O `setup.sql` já inclui essa mudança.
- As migrações antigas (`seguranca.sql` e as `migracao-*.sql` anteriores) foram incorporadas ao `setup.sql` e podem ser apagadas do repositório.

## Segurança
1. **Banco:** o `setup.sql` já vem com as proteções: fotos privadas (só quem é do mesmo grupo vê, por links que expiram em 1 hora), nada de foto "emprestada" de outro membro, nada de lançar datas antigas, limite de 6000 ml por pessoa por dia, e cada pessoa só mexe nos próprios dados.
2. **Hospedagem:** o `vercel.json` já manda cabeçalhos de segurança (política de conteúdo, bloqueio de iframe etc.). Se um dia você usar um domínio próprio no Supabase, inclua-o no `connect-src` e no `img-src` desse arquivo.
3. **Supabase, Authentication:** em **Sign In / Providers → Email**, suba **Minimum password length** para 8 ou mais. Para ligar o CAPTCHA (Cloudflare Turnstile), siga o `PASSO-A-PASSO-LOGIN.md`: primeiro a chave no `config.js`, só depois a opção no Supabase.
4. **Chaves:** só a chave publishable/anon vai no site. A `secret`/`service_role` e a senha do banco nunca.
5. **Opcional:** para travar a biblioteca do Supabase carregada pela CDN, adicione o atributo `integrity` (SRI) na tag `<script>` dela.

## Notificações (e-mail de ranking e lembretes)
Siga o `PASSO-A-PASSO-NOTIFICACOES.md`.