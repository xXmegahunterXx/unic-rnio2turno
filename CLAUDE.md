# Sintonia — guia para agentes

Leia `ARCHITECTURE.md` antes de codar. Contratos em `src/shared/*` (types, dataset, api, calc, format, constants) são a fonte da verdade; não os altere sem necessidade real — se alterar, mantenha compatibilidade e diga no relatório.

- Idioma da interface e dos comentários: **português do Brasil**. Identificadores podem ser pt ou en, siga o arquivo.
- Neutralidade é regra: cores por slot (`cand-a` turquesa = menor número na urna; `cand-b` âmbar), textos descritivos, nunca cores partidárias.
- Fotos: só as fotos OFICIAIS do TSE (pacotes em public/data/fotos), mesmo tamanho e tratamento para todos, nunca editadas (só redimensionar/recortar). Na simulação anonimizada (`status.anonimizado`) NÃO mostre foto (use o monograma).
- Nunca use cor hex solta em componente — só tokens Tailwind (`bg-surface`, `text-fg-muted`, `bg-cand-a`, `border-line`…).
- Todo número exibido usa a classe `.num` e os formatadores de `src/shared/format.ts`; percentuais derivam de `src/shared/calc.ts`.
- Não instale dependências novas. Não rode `npm install`.
- Edite só os arquivos sob sua responsabilidade (informada no seu prompt). Precisa de algo fora dela? Anote no relatório final.
- Verificação: `npx tsc -p tsconfig.json --noEmit` (tipos), `npx vitest run <arquivo>` (testes), `npx vite build` (build). Não deixe o projeto sem compilar.
- Para ver a UI: `npm run dev` sobe Vite (5173) + API (8787). Playwright está instalado (Chromium em /opt/pw-browsers); tire screenshots e **olhe** (Read na imagem) — beleza é requisito.
- Use portas diferentes se precisar subir servidores próprios em paralelo (ex.: `PORT=8790`, `vite --port 5180`) e encerre-os ao terminar.
