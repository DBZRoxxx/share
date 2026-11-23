# Share

App desktop para Windows para compartilhar a tela (Full HD, com áudio) e abrir a câmera com os amigos. Sem conta: cria a sala, manda o link, pronto.

- Tela em até **1920×1080 @ 60 fps** (modo _Movimento_) ou 30 fps com texto nítido (modo _Nitidez_)
- **Áudio do que está sendo compartilhado, sem eco**: ao compartilhar uma janela, só o som daquele app vai junto; ao compartilhar a tela inteira, vai todo o som do PC menos o próprio Share (Windows 11 / build ≥ 20348)
- Câmera em 1080p, microfone opcional
- Várias telas ao mesmo tempo: grade automática, modo destaque, tela cheia e **abrir em outra janela** (bom para 2 monitores)
- Lista de quem está na sala, volume individual por tela/pessoa, estatísticas de vídeo
- **Chat da sala** com emojis (busca em português), GIFs, prints (cole com `Ctrl+V`) e arquivos de até 100 MB; reações, respostas citando a mensagem, editar e apagar. O histórico e os anexos ficam guardados por 7 dias depois da última mensagem, mesmo com a sala vazia
- **Notificações e sons**: cada mensagem do chat (respostas incluídas) e cada reação a uma mensagem **sua** avisa com um som curto — reações entre outras pessoas não notificam — notificação do Windows quando o Share está na bandeja, minimizado ou atrás de outras janelas, e aviso dentro do app quando o chat está fechado. Entrada e saída de pessoas também tocam um som para todos. Tudo configurável (por usuário, vale para todas as salas) na engrenagem do topo
- **Microfone desligado à vista**: selo vermelho no avatar de quem está sem microfone e ícone ao lado do nome na aba Pessoas, para todos
- **Fechar não sai da sala**: o Share continua rodando na bandeja do Windows (perto do relógio), com câmera e tela no ar
- **Salas com nome** (até 45 caracteres), definido ao criar e editável por quem está na sala — todos veem a mudança na hora; o nome aparece também nas salas recentes e na página do convite
- Link de convite que abre direto no app (`share://`), instalador sem pedir admin
- **Atualização sem sair da sala**: atualizações só de interface são aplicadas sem reiniciar (a tela recarrega e você volta para a sala em ~2 s, com câmera, mic, tela e chat); as completas reiniciam e também voltam sozinhas para a sala. Dá para adiar para quando sair da sala. O app procura versões novas ao abrir, a cada 30 min e sempre que você volta para a janela (ex.: pela bandeja); o botão ⟳ no topo procura na hora.

## Arquitetura

```
apps/desktop   Electron + React + TypeScript + Tailwind (electron-vite)
apps/web       Next.js na Vercel: landing/download, página de convite /r/<id>, APIs /api/token, /api/gifs e /api/chat
packages/shared  IDs de sala, parse de links, schema do token e protocolo do chat (zod)
```

A mídia passa pelo **LiveKit Cloud** (SFU): cada pessoa envia a tela uma vez e o servidor distribui, mandando para cada um só a resolução que o tile dele precisa (simulcast + adaptive stream). A Vercel gera os tokens de acesso e faz de proxy para a API de GIFs do [KLIPY](https://klipy.com) (a chave fica só no servidor).

### Como funciona o chat

É _local-first_: o que você envia aparece na hora, fica salvo no IndexedDB do app e segue por dois caminhos ao mesmo tempo — pelo data channel do LiveKit (os outros recebem em tempo real) e por uma fila de envio para o servidor, que tenta de novo sozinha se a internet cair (a mensagem mostra um relógio até o servidor confirmar, depois ✓). Ao abrir a sala, o app mostra o que já tinha guardado e busca no servidor só o que é novo.

- **Mensagens:** um log de eventos por sala no **Upstash Redis** (São Paulo). Reações, edições e exclusões são eventos sobre a mensagem original; o servidor confere que só o autor edita ou apaga. Tudo expira 7 dias depois da última mensagem.
- **Anexos:** vão direto do app para um store **privado do Vercel Blob** (São Paulo, `gru1`), com upload em partes; a API só assina o envio e entrega links de download que valem 15 minutos. Os arquivos são apagados 7 dias após o envio (ou quando a mensagem é apagada).
- **Acesso:** sem contas — a API aceita o mesmo token do LiveKit que dá entrada na sala, então só quem está na sala lê e escreve o chat dela.

### Como funcionam as atualizações

Cada release publica, além do instalador, um `hot.json` e um `renderer-<versão>.asar` (a interface). O build grava em `out/shell.json` um hash do processo principal, do preload, do Electron e dos módulos nativos. Se o hash de uma release nova é igual ao do app instalado, só a interface mudou: o app baixa o `.asar`, confere o sha512 e o carrega no lugar da interface embutida, sem reinstalar. Se a interface nova não sinalizar que iniciou em 20 s, o app volta para a embutida e nunca mais tenta aquela versão. Quando o hash muda, vale o instalador completo (electron-updater). Em ambos os casos o app salva a sala, câmera, mic, tela e chat antes, e volta para eles depois.

## Colocando no ar (uma vez)

1. **LiveKit Cloud** — crie um projeto em <https://cloud.livekit.io> e pegue `URL`, `API Key` e `API Secret` (Settings → Keys).
2. **Vercel** — importe este repositório, defina **Root Directory = `apps/web`** e cadastre as variáveis:
   - `LIVEKIT_URL` (ex.: `wss://seu-projeto.livekit.cloud`)
   - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `GITHUB_REPO` = `DBZRoxxx/share` (de onde a landing pega o instalador)
   - `KLIPY_API_KEY` — chave da API de GIFs ([partner.klipy.com](https://partner.klipy.com/api-keys)); sem ela o chat funciona, só os GIFs ficam desativados
   - Em _Storage_, crie um **Upstash for Redis** (região São Paulo) e um **Blob store privado** (região `gru1`) ligados ao projeto — eles cadastram `KV_REST_API_URL`, `KV_REST_API_TOKEN` e `BLOB_READ_WRITE_TOKEN`. Pela CLI: `vercel integration add upstash/upstash-kv -m primaryRegion=gru1` e `vercel blob create-store share-chat-files --access private --region gru1`. As functions rodam em `gru1` (`apps/web/vercel.json`)
3. **GitHub** — o repositório precisa ser **público** (para o download e o auto-update funcionarem sem token). Em _Settings → Secrets and variables → Actions → Variables_, crie `SHARE_WEB_URL` com a URL da Vercel (ex.: `https://share-xyz.vercel.app`).
4. **Lançar uma versão** — crie e envie uma tag:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
   O workflow `Release` gera `Share-Setup-0.1.0.exe` e o pacote de interface, sobe tudo num rascunho e só então publica no GitHub Releases. A landing passa a oferecer o download e os apps instalados mostram o botão **Atualizar**.

> **Aviso do Windows (SmartScreen):** o instalador ainda não é assinado, então na primeira instalação aparece "O Windows protegeu o computador". É só clicar em **Mais informações → Executar assim mesmo**. Para remover o aviso, dá para ativar o Azure Trusted Signing (~US$10/mês) — o `electron-builder.yml` e o workflow já têm os campos comentados.

## Desenvolvimento

Requisitos: Node 22+, Windows 10/11.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # preencha com as chaves do LiveKit
npm run dev:web        # http://localhost:3000 (landing + /api/token)
npm run dev:desktop    # abre o app (usa http://localhost:3000 por padrão)
npm run dev:desktop:2  # segunda instância isolada, para testar uma chamada na mesma máquina
```

Para o app de desenvolvimento apontar para outro servidor, crie `apps/desktop/.env.local` com `VITE_SHARE_WEB_URL=...`.

| Comando                                           | O que faz                                          |
| ------------------------------------------------- | -------------------------------------------------- |
| `npm run lint` / `npm run typecheck` / `npm test` | ESLint, TypeScript e testes (Vitest)               |
| `npm run dist`                                    | gera o instalador local em `apps/desktop/release/` |
| `npm run build:web`                               | build de produção do site                          |

Atalhos na sala: `Ctrl+Shift+S` compartilhar/parar tela · `Ctrl+Shift+V` câmera · `Ctrl+Shift+M` microfone · `Ctrl+Shift+C` chat · `Ctrl+Shift+L` grade/destaque · duplo clique num vídeo destaca (e, se já destacado, tela cheia).

### Problemas conhecidos

- **Windows 10 (build < 20348)** não suporta captura de áudio por processo. Lá o app cai para o áudio do sistema inteiro, que inclui as vozes da chamada/Discord (eco para os outros). O seletor de tela avisa quando isso acontece.
- **Compartilhar a tela inteira** envia todo o som do PC exceto o Share — inclusive o Discord, se a voz estiver lá. Para não vazar, compartilhe a **janela** do jogo/app.
- **Builds no Git Bash**: o Vite enxerga o drive como `d:` e `D:` e duplica módulos (renderer maior e hash de shell diferente). Gere instaladores/pacotes pelo PowerShell (o CI já faz assim).
- **Atualização rápida x completa:** tudo o que o processo principal (`src/main`) e o preload importam, mais a pasta `resources/` (ícones da bandeja e da janela), entra no hash de shell; mudar qualquer coisa ali transforma a release numa atualização completa. Por isso o main importa só `@share/shared/room` (`room.ts`) — mexer nesse arquivo também conta. Desde a v0.4 o resto de `packages/shared` pode mudar à vontade.
- **`next build` com Turbopack falha no Windows** (`ModuleGraph::from_graphs_inner was canceled`); na Vercel (Linux) funciona. Para testar o build localmente use `npx next build --webpack`.
- Para testar atualizações localmente, aponte o app para uma pasta com `hot.json` + `.asar`: `$env:SHARE_UPDATE_FEED="C:\pasta\release-hot"` antes de abrir o `Share.exe` de `release/win-unpacked`.
- Rodando a partir do terminal de extensões do VS Code, a variável `ELECTRON_RUN_AS_NODE=1` pode estar definida e faz o Electron abrir como Node puro. Rode `unset ELECTRON_RUN_AS_NODE` (bash) antes de `npm run dev:desktop`.
- **Custos:** várias telas 1080p para 6–10 pessoas consomem banda rápido. Acompanhe o uso no painel do LiveKit Cloud; se passar do plano gratuito, dá para hospedar o LiveKit numa VPS própria trocando só `LIVEKIT_URL` e as chaves na Vercel.
