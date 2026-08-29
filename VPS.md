# VPS — Documentação de Infraestrutura (mcobo.com.br)

Documento de referência da VPS que hospeda os serviços do domínio `mcobo.com.br`.
Atualizado em 2026-08-29 (conectado via SSH e revalidado campo a campo).

**Acesso SSH:** `ssh -i ~/.ssh/clipstudio_deploy root@109.123.250.135` (chave de deploy também
usada pelo pipeline de deploy do Clip Studio — ver `clip-studio/deploy/README.md`).

## 1. Visão geral

| Item | Valor |
|---|---|
| Provedor | Contabo (`vmi3360656.contaboserver.net`) |
| IP público | `109.123.250.135` |
| Hostname | `jitsi.mcobo.com.br` |
| Sistema operacional | Ubuntu 24.04.4 LTS (Noble Numbat), x86_64 |
| Kernel | 6.8.0-106-generic |
| Uptime | 54+ dias (load ~0.6/0.47/0.40) |

## 2. Hardware

| Recurso | Quantidade |
|---|---|
| CPU | 6 vCPUs — AMD EPYC Processor (com IBPB) |
| Memória RAM | 17 GiB total (≈3,8 GiB em uso, ≈13 GiB disponíveis) |
| Armazenamento | 290 GiB em `/dev/sda1` (`/`, 37% usado — ~107 GiB) |
| Boot | `/dev/sda16` + `/dev/sda15` (UEFI) |
| Swap | Nenhum |

## 3. Rede

- Interface pública: `eth0` — `109.123.250.135/20` (rede `109.123.255.255`)
- Interfaces Docker: `docker0` (172.17.0.1/16, sem containers hoje) + 4 bridges por stack (`br-*`):
  `n8n_default` (172.18.0.1/16), `nutriflow_default` (172.19.0.1/16),
  `garantia-prod_internal` (172.20.0.1/16), `deploy_clipstudio_internal` (172.21.0.1/16)
- DNS: `127.0.0.53` / `127.0.0.54` (systemd-resolved)

**Portas em uso (listen público):**

| Porta | Serviço |
|---|---|
| 22 | SSH |
| 80 / 443 | Caddy (gateway público, container `n8n-caddy-1`) |
| 3000 | Backend do NutriFlow (host, `0.0.0.0:3000`) |
| 5433 | Postgres do NutriFlow (host) |
| 9000 / 9001 | MinIO do NutriFlow (host) |
| 5222 / 5269 / 5280 / 5281 | Prosody/XMPP (Jitsi, nativo) |
| 8843 / 8880 | nginx do Jitsi (interno, atrás do Caddy) |
| 127.0.0.1:5432 | `pg-bridge` (socat) → Postgres do GarantIA, só acesso local via túnel/localhost |

**Não expostos publicamente (corretamente internos):** Postgres do Clip Studio, Postgres/Redis/MinIO
do GarantIA, Postgres do n8n (se houver), cookie-refresher (porta 4600 só na rede interna).

## 4. Software instalado no sistema

| Ferramenta | Versão |
|---|---|
| Docker Engine | 29.6.1 (build 8900f1d) |
| Docker Compose (plugin) | v5.3.0 |
| Node.js | v18.19.1 |
| npm | 9.2.0 |
| Python | 3.12.3 |
| OpenSSL | 3.0.13 |
| Git | 2.43.0 |
| nginx | 1.24.0 (nativo, exclusivo do Jitsi) |
| Outros | htop, curl, jq, vim, wget, docker-buildx-plugin, docker-compose-plugin |

**Jitsi Meet (nativo, via apt):** `jitsi-meet`, `jitsi-videobridge2`, `jicofo`,
`jitsi-meet-prosody`, `jitsi-meet-web`, `jitsi-meet-turnserver`, `coturn`.

**Dentro do container `n8n-n8n-1` (Alpine, "Docker Hardened Images" v3.24 — minimalista, sem
`curl`/`python3`/`bash`, shell é `/bin/sh`):** `wget`, `whisper` (whisper.cpp, `/usr/local/bin/whisper`),
`ffmpeg`. Ver `CLAUDE.md` do projeto `n8n-video-silence-cutter.html` para o histórico completo
dessas descobertas de ambiente.

## 5. Serviços systemd ativos

| Serviço | Função |
|---|---|
| `docker.service` / `containerd.service` | Contêineres |
| `nginx.service` | HTTPS interno do Jitsi (portas 8843/8880) |
| `prosody.service` | Servidor XMPP do Jitsi |
| `jicofo.service` | Jitsi Conference Focus |
| `jitsi-videobridge2.service` | SFU WebRTC do Jitsi |
| `coturn.service` | STUN/TURN do Jitsi |
| `ssh.service` | OpenSSH |

Crontab do root: nenhum (backups ainda não automatizados via cron).

## 6. Projetos em disco (`/root/`)

| Diretório | Projeto | Tamanho |
|---|---|---|
| `/root/n8n` | Stack n8n + Caddy (gateway) — inclui `n8n_data`, `n8n_files` (16G, inclui modelo whisper turbo), `n8n_roteiros`, `models` (3G, modelo whisper large-v3) | 21 GiB |
| `/root/nutrivion` | NutriFlow (backend + web + infra) | 52 MiB (código) |
| `/root/garantIA` | GarantIA (API + workers + deploy) | 8,6 MiB (código) |
| `/root/hub` | Hub estático (HTML) | 2,2 MiB |
| `/root/clip-studio` | **Novo (ago/2026).** App Next.js do Clip Studio — código + `deploy/` (compose, sem segredos versionados) | 936 KiB (código) |
| `/root/cookie-refresher` | **Novo (ago/2026).** Serviço interno que renova cookies de sessão do YouTube (headless Chromium) para o pipeline de download do n8n | 52 KiB (código) |
| `/root/backups` | Dumps SQL manuais pré-deploy do GarantIA (`garantia-pre-deploy-*.sql`, 3 arquivos, 07/08/2026) | 96 KiB |

Docker (armazenamento): `/var/lib/docker` ≈ 13 GiB.

## 7. Volumes do host mapeados no container `n8n-n8n-1`

| Host | Container | Conteúdo |
|---|---|---|
| `/root/n8n/n8n_data` | `/home/node/.n8n` | Dados internos do n8n (workflows, credenciais, execuções) |
| `/root/n8n/n8n_files` | `/home/node/.n8n-files` | Arquivos de trabalho do pipeline de Shorts: vídeo baixado, áudio, SRT, clipes cortados, `ggml-large-v3-turbo.bin` (1.51GiB), lock de execução sequencial (`.processing.lock`, ausente = nenhuma execução rodando agora) |
| `/root/n8n/n8n_roteiros` | `/home/node/.n8n-roteiros` | Roteiros/outros dados do n8n |
| `/root/n8n/models` | `/models` | `ggml-large-v3.bin` (3.09GB, modelo whisper antigo, ainda presente mas não usado pelo workflow em produção desde 16/07/2026 — pertence a `root:root`, não gravável pelo usuário `node`) |

## 8. Containers ativos

| Container | Imagem | Status | Portas publicadas |
|---|---|---|---|
| `n8n-n8n-1` | n8n-n8n | Up 6 semanas | — (interno, atrás do Caddy) |
| `n8n-caddy-1` | caddy:2 | Up (gateway público) | 80, 443 |
| **`clipstudio-web-1`** | deploy-web | Up 10h | — (interno) |
| **`clipstudio-postgres-1`** | postgres:16-alpine | Up 2 dias (healthy) | — (interno) |
| **`cookie-refresher-1`** | cookie-refresher-cookie-refresher | Up 34h | — (interno, porta 4600 só na rede) |
| `nutriflow-backend-1` | nutriflow-backend | Up 4 semanas | 3000 (host) |
| `nutriflow-web-1` | nutriflow-web | Up 4 semanas | — (interno) |
| `nutriflow-postgres-1` | postgres:16-alpine | Up 4 semanas (healthy) | 5433 (host) |
| `nutriflow-minio-1` | minio/minio:latest | Up 4 semanas (healthy) | 9000/9001 (host) |
| `garantia-prod-api-1` | garantia-prod-api | Up 10 dias (healthy) | — (interno) |
| `garantia-prod-invoice-worker-1` | garantia-prod-invoice-worker | Up 10 dias | — |
| `garantia-prod-notification-worker-1` | garantia-prod-notification-worker | Up 10 dias | — |
| `garantia-prod-postgres-1` | postgres:16-alpine | Up 10 dias (healthy) | — (interno) |
| `garantia-prod-redis-1` | redis:7-alpine | Up 10 dias (healthy) | — (interno) |
| `garantia-prod-minio-1` | minio/minio:latest | Up 10 dias (healthy) | — (interno) |
| **`pg-bridge`** | alpine/socat | Up 3 semanas | `127.0.0.1:5432` → Postgres do GarantIA (túnel local para acesso administrativo, não exposto externamente) |

**Negrito** = novo desde a última auditoria (06/08/2026).

## 9. Imagens Docker

| Imagem | Tamanho |
|---|---|
| n8n-n8n | 6,13 GiB |
| **cookie-refresher-cookie-refresher / deploy-cookie-refresher** | 2,9 GiB cada (headless Chromium embutido) |
| garantia-prod-{api,invoice-worker,notification-worker,migrate} | 1,55 GiB cada |
| **deploy-web** (Clip Studio) | 1,39 GiB |
| nutriflow-web | 663 MiB |
| nutriflow-backend | 518 MiB |
| postgres:16-alpine | 420 MiB |
| minio/minio:latest | 241 MiB |
| minio/mc:latest | 117 MiB |
| caddy:2 | 88,7 MiB |
| redis:7-alpine | 57,8 MiB |
| alpine/socat | 15 MB |

## 10. Redes Docker

| Rede | Driver | Uso |
|---|---|---|
| `n8n_default` | bridge | **Compartilhada** — Caddy + NutriFlow + GarantIA + Clip Studio (web) + cookie-refresher (rotas públicas via Caddy e/ou acesso interno por nome de container) |
| `nutriflow_default` | bridge | interna do NutriFlow |
| `garantia-prod_internal` | bridge | interna do GarantIA (postgres/redis/minio/workers) |
| **`deploy_clipstudio_internal`** | bridge | interna do Clip Studio (web ↔ postgres) |
| `bridge` / `host` / `none` | — | padrão Docker |

## 11. Domínios e rotas (Caddyfile do n8n — `/root/n8n/Caddyfile`)

| Domínio | Destino |
|---|---|
| `n8n.mcobo.com.br` | n8n:5678 |
| `mcobo.com.br`, `pycompras.mcobo.com.br` | frontend:3000 |
| `hub.mcobo.com.br` | arquivos estáticos de `/root/hub` |
| `jitsi.mcobo.com.br` | `https://172.18.0.1:8843` (nginx do Jitsi) |
| `nutrivion.mcobo.com.br` | nutriflow-web:3001 |
| `api.nutrivion.mcobo.com.br` | nutriflow-backend:3000 |
| `files.nutrivion.mcobo.com.br` | nutriflow-minio:9000 |
| `garantia.mcobo.com.br` | garantia-api:3000 |
| **`clipstudio.mcobo.com.br`** | clipstudio-web-1:3000 |

HTTPS: emitido automaticamente pelo Caddy (Let's Encrypt, e-mail
`admin@vmi3360656.contaboserver.net`).

## 12. Novos serviços — detalhes (agosto/2026)

### Clip Studio (`clipstudio.mcobo.com.br`)

App Next.js. Segue exatamente o padrão já usado por NutriFlow/GarantIA: Postgres próprio
não exposto publicamente, container `web` entra na rede `n8n_default` (com alias) para o
Caddy compartilhado rotear até ele, e uma rede interna própria (`deploy_clipstudio_internal`)
liga `web` ↔ `postgres`.

- **Deploy:** a partir de `/root/clip-studio` → `docker compose --env-file .env up -d --build`
  (compose file em `/root/clip-studio/deploy/docker-compose.yml`).
- **Migração/seed:** `docker compose exec web npm run db:migrate` / `npm run db:seed` (só no
  primeiro deploy).
- **Variáveis de ambiente** (`.env`, não versionado): `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, `AUTH_SECRET`, `NEXTAUTH_URL`.
- **Volume:** `clipstudio_postgres_data` (nomeado, persistente).

### cookie-refresher

Serviço interno (sem porta publicada, sem rota no Caddy) que roda um Chromium headless
para renovar o cookie de sessão do YouTube usado pelo pipeline de download de vídeos do
n8n (workflow "Clip Studio — Integração N8N", node "Baixar Video YouTube"). Faz bind-mount
do mesmo diretório host que o n8n já usa (`/root/n8n/n8n_files` → `/data`), escrevendo
diretamente no `youtube-cookies.master.txt` compartilhado.

- **Deploy:** a partir de `/root/cookie-refresher` → `docker compose -f deploy/docker-compose.yml up -d --build`.
- **Roda como root dentro do próprio container** (não no host) para poder fazer `chown` do
  cookie exportado para uid/gid 1000 (usuário `node` do container n8n) no bind mount
  compartilhado; Chromium roda com `--no-sandbox` — aceito porque o serviço não tem porta
  publicada e só é alcançável de dentro de `n8n_default`.
- **Variáveis de ambiente:** `COOKIE_MASTER_PATH=/data/youtube-cookies.master.txt`,
  `PROFILE_DIR=/profile`, `COOKIE_UID=1000`, `COOKIE_GID=1000`, `PORT=4600`.
- **Volume:** `cookie_refresher_profile` (nomeado, perfil do Chromium).
- Detalhes de design em `openspec/changes/add-youtube-cookie-refresher/design.md` (repo local).

## 13. Topologia de rede (como as peças se conectam)

```
Internet ──► Caddy (n8n-caddy-1, :80/:443) ──► rotas por domínio
                │  rede n8n_default
                ├──► n8n:5678                    (n8n.mcobo.com.br)
                ├──► frontend:3000               (mcobo.com.br / pycompras)
                ├──► hub estático /srv/hub       (hub.mcobo.com.br)
                ├──► 172.18.0.1:8843 → nginx →   (jitsi.mcobo.com.br)
                ├──► nutriflow-web:3001          (nutrivion.mcobo.com.br)
                ├──► nutriflow-backend:3000      (api.nutrivion.mcobo.com.br)
                ├──► nutriflow-minio:9000        (files.nutrivion.mcobo.com.br)
                ├──► garantia-api:3000           (garantia.mcobo.com.br)
                │       │  rede garantia-prod_internal
                │       └──► postgres / redis / minio / workers (sem porta pública)
                │
                ├──► clipstudio-web-1:3000       (clipstudio.mcobo.com.br)
                │       │  rede deploy_clipstudio_internal
                │       └──► clipstudio-postgres-1 (sem porta pública)
                │
                └──► cookie-refresher-1:4600     (sem rota Caddy — só acesso interno
                        pelo workflow n8n via nome de container na rede n8n_default;
                        escreve direto no bind mount /root/n8n/n8n_files)

pg-bridge (socat, standalone) — 127.0.0.1:5432 → garantia-prod-postgres-1:5432
    (túnel local para acesso administrativo ao Postgres do GarantIA, ex: pgAdmin via SSH tunnel)
```

## 14. Notas operacionais

- **Gateway público é o Caddy do n8n.** Novos serviços devem entrar na rede `n8n_default`
  (com alias) e ter rota adicionada no Caddyfile — mesmo padrão do NutriFlow, GarantIA e,
  agora, Clip Studio.
- **não expor Postgres/Redis/MinIO publicamente**; acesso interno só via rede da stack.
  Clip Studio e cookie-refresher seguem essa regra (confirmado: nenhuma porta publicada
  além do que já era esperado).
- `pg-bridge` é uma exceção deliberada e controlada: expõe o Postgres do GarantIA só em
  `127.0.0.1` (não na interface pública) via `socat`, para acesso administrativo local/túnel
  SSH — não é uma porta pública real.
- Credenciais de acesso aos repositórios GitHub: tokens embutidos em `/root/<repo>/.git/config`
  (padrão usado no n8n, nutrivion e garantIA).
- Segredos de aplicação: `stack.env` (n8n), `deploy/.env` (garantIA), `.env` (nutrivion),
  `.env` (clip-studio, não versionado) — nenhum lido/copiado nesta auditoria.
- Backups de dados: só os 3 dumps manuais pré-deploy do GarantIA em `/root/backups`
  (07/08/2026). Ainda **não** automatizados (sem cron). Pendência recomendada: `pg_dump`
  periódico do Postgres do GarantIA/NutriFlow/Clip Studio e snapshot dos volumes MinIO.
- Modelo whisper antigo (`ggml-large-v3.bin`, 3.09GB em `/root/n8n/models`) continua em
  disco sem uso desde a troca para `large-v3-turbo` (16/07/2026) — candidato a limpeza se
  espaço em disco algum dia for um problema (hoje 183GB livres, não é urgente).
- Nenhuma execução do pipeline de Shorts em andamento no momento desta auditoria (lock
  `.processing.lock` ausente em `/root/n8n/n8n_files`).
