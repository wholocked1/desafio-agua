# Relatório de testes do Desafio da Água

Nov 7, 2026 · @Ana

De 176 testes automáticos, 173 passaram. As 3 falhas são de login (mensagens em inglês e falta de "Esqueci minha senha"); nada impede o uso do app hoje. A revisão do código achou mais 3 pontos para ajustar.

## Resumo

O banco e a função de envio passaram em tudo; as 3 falhas estão na tela de login.

| Área | Testes | Passaram | Falharam |
| --- | --- | --- | --- |
| Banco de dados (regras de acesso, funções, limites) | 82 | 82 | 0 |
| App de ponta a ponta (iPhone, Android, iPad, tema claro e escuro) | 84 | 81 | 3 |
| Função de e-mails e lembretes (datas e horários) | 10 | 10 | 0 |
| **Total** | **176** | **173** | **3** |

Além disso, as checagens do código passaram: sintaxe dos 4 arquivos JavaScript, todos os botões ligados a um elemento da tela, nenhum arquivo faltando, nenhum script embutido bloqueado pelas regras de segurança e nenhum uso de `eval`.

## O que ajustar

Oito pontos, do mais ao menos urgente; os dois primeiros vêm antes de chamar mais gente. Mude o status conforme for resolvendo.

| Prioridade | Problema | O que acontece hoje | Sugestão | Status |
| --- | --- | --- | --- | --- |
| Alta | Não existe "Esqueci minha senha" | Quem esquece a senha não entra mais; criar outra conta perde grupos e histórico | Link na tela de login que manda o e-mail de redefinição do Supabase | A fazer |
| Alta | `.env` no GitHub e `.gitignore` com o nome errado (`.gitgnore`) | Senhas que estavam no `.env` ficam no histórico do repositório | Apagar o `.env`, subir o `.gitignore` certo e trocar as senhas que estavam nele | A fazer |
| Média | Mensagens de login e cadastro em inglês | Senha errada mostra "Invalid login credentials"; e-mail repetido mostra "User already registered" | Traduzir as mensagens mais comuns do Supabase | A fazer |
| Média | Sair da conta não desliga os lembretes daquele celular | O aparelho segue recebendo lembretes da conta que saiu, até outra pessoa ativar lá | Ao sair, apagar a inscrição de lembretes deste aparelho | A fazer |
| Média | Limite de 6.000 ml soma todos os grupos | Quem registra a mesma garrafinha em 2 grupos chega ao limite com 3.000 ml bebidos, e o aviso não explica; histórico e conquistas contam em dobro | Decidir: limite por grupo, ou um registro que vale para todos os grupos | A fazer |
| Baixa | Sequência 🔥 e conquistas usam a meta atual | Subir a meta pode apagar dias da sequência que já tinham valido | Guardar a meta de cada dia junto com os registros | A fazer |
| Baixa | Garrafinha não pode ser editada | Para trocar nome ou tamanho, é preciso remover e adicionar de novo | Botão de editar na lista do Perfil | A fazer |
| Baixa | "Outro valor" e "Excluir conta" usam as janelas simples do navegador | Funciona, mas destoa do visual do app | Trocar por janelas do próprio app | A fazer |

## O que funcionou

Todo o fluxo do app funcionou de ponta a ponta, com as regras de segurança do Vercel ligadas e sem nenhum erro de JavaScript.

- **Cadastro e login:** troca entre Entrar e Criar conta, senha nova com mínimo de 8 caracteres, cadastro entra direto, login volta para o último grupo, Sair da conta.
- **Grupos e convites:** criar grupo (com aviso se faltar nome), link de convite que abre direto em Criar conta e já coloca a pessoa no grupo, QR code na tela e na imagem para compartilhar (lidos por um leitor de QR de verdade), gerar novo código, código inválido recusado, entrar duas vezes no mesmo grupo sem erro.
- **Registros e fotos:** garrafinha com foto, +200/+300/+500, Outro valor, Desfazer último, foto reduzida antes de enviar, limite de 6.000 ml por dia com aviso em português, datas antigas recusadas, ninguém registra no nome de outro nem usa a foto de outro.
- **Placar:** abas Hoje, Semana e Mês com totais e dias de meta, ✅ de meta batida, reações (própria e sem repetir), destaque de vencedores escondido quando não há dados, avatar ao lado do nome.
- **Regras e moderação:** só a dona vê e muda as regras; foto obrigatória faz o +200 abrir a câmera e o banco recusa registro sem foto; meta do grupo vale no topo e no placar; a dona apaga registro e foto de outra pessoa e remove membros; membro comum não vê esses botões.
- **Sair e excluir:** sair do grupo apaga os próprios registros e fotos; dona que sai passa o grupo para o membro seguinte; último membro que sai apaga o grupo; excluir a conta (digitando EXCLUIR) apaga tudo e passa os grupos adiante.
- **Perfil:** nome, meta (com limite de 500 a 10.000 ml), avatar com emoji, cor ou foto (cortada em 256 × 256 px; voltar para Inicial apaga a foto), garrafinhas (até 6, tamanho de 50 a 5.000 ml), histórico com 4 números e gráfico de 14 dias, conquistas, resumo por e-mail, tutorial de instalação.
- **Lembretes e e-mails:** no iPhone pelo navegador, o app avisa que precisa instalar; inscrição do aparelho só por https; resumo semanal cobre segunda a domingo, mensal cobre o mês anterior (inclusive virada de ano e fevereiro de ano bissexto); lembretes de hora em hora das 9h às 21h de Brasília, a cada 2 ou 3 horas.
- **Segurança do banco:** quem está fora do grupo não vê grupo, registros, membros, perfis, placar nem fotos; sem login não se chama nenhuma função; o segredo do agendamento só funciona pela função de envio; o registro de envios não aparece para usuários.
- **Banco único:** o `setup.sql` roda duas vezes seguidas sem erro e, rodado por cima de um banco igual ao atual, não apaga nenhum dado.
- **Telas:** nenhuma rolagem para o lado no iPhone SE (a tela mais estreita, 320 px), no Android em tema escuro e no iPad.
- **Desempenho:** com o grupo aberto, o app faz 4 consultas a cada 30 segundos, bem dentro do plano grátis do Supabase.

## O que não deu para testar daqui

O app foi testado com um Supabase simulado e o banco num PostgreSQL local, então o que depende dos serviços reais e de um celular de verdade fica para um teste manual. Marque cada item quando conferir.

- [ ] **Placar ao vivo:** com dois celulares no mesmo grupo, o registro de um aparece no outro em poucos segundos.
- [ ] **Fotos entre membros:** a foto de prova de uma pessoa aparece para a outra (links temporários do Supabase).
- [ ] **Lembretes automáticos:** chegam nos horários escolhidos; o teste manual já funcionou, falta o agendado (confira o `notify_log` depois das 9h).
- [ ] **Resumo semanal automático:** chega na segunda às 9h; confira a caixa de entrada, o spam e o `notify_log`.
- [ ] **Excluir conta no Supabase real:** a conta some de Authentication → Users (depende de uma permissão do Supabase que não dá para simular).
- [ ] **Instalar no Android:** o botão "Instalar agora" aparece no Chrome e o ícone da gota fica na tela inicial.
- [ ] **Janelas no iPhone instalado:** "Outro valor" e "Excluir conta" abrem com o app aberto pelo ícone.
- [ ] **App no ar depois do último envio:** abrir o link do Vercel, recarregar e conferir que não aparece nenhuma mensagem vermelha no rodapé.
- [ ] **Confirmação por e-mail** (só se você religar o Confirm email): o link do e-mail abre o app no endereço do Vercel.
