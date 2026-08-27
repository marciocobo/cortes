# VPS — Documentação de Infraestrutura (mcobo.com.br)

Documento de referência da VPS que hospeda os serviços do domínio `mcobo.com.br`.
Atualizado em 2026-08-06.

## 1. Visão geral

| Item | Valor |
|---|---|
| Provedor | Contabo (`vmi3360656.contaboserver.net`) |
| IP público | `109.123.250.135` |
| Hostname | `jitsi.mcobo.com.br` |
| Sistema operacional | Ubuntu 24.04.4 LTS (Noble Numbat), x86_64 |
| Kernel | 6.8.0-106-generic |
| Uptime | 31+ dias (load ~1.0) |

## 2. Hardware

| Recurso | Quantidade |
|---|---|
| CPU | 6 vCPUs — AMD EPYC Processor (com IBPB) |
| Memória RAM | 17 GiB total (≈3 GiB em uso, ≈14 GiB disponíveis) |
| Armazenamento | 290 GiB em `/dev/sda1` (`/`, 16% usado — ~46 GiB) |
| Boot | `/dev/sda16` 881 MiB + `/dev/sda15` 105 MiB (UEFI) |
| Swap | Nenhum |

## 3. Rede

- Interface pública: `eth0` — `109.123.250.135/20` (rede `109.123.255.255`)
- Interfaces Docker: `docker0` (172.17.0.1/16) + 3 bridges por stack (`br-*`)
- DNS: `127.0.0.53` (systemd-resolved)

**Portas em uso (listen público):**

| Porta | Serviço |
|---|---|
| 22 | SSH |
| 80 / 443 | Caddy (gateway público, container `n8n-caddy-1`) |
| 3000 | Backend do NutriFlow (host) |
| 5433 | Postgres do NutriFlow (host) |
| 9000 / 9001 | MinIO do NutriFlow (host) |
| 5222 / 5269 / 5280 / 5281 | Prosody/XMPP (Jitsi, nativo) |
| 8843 / 8880 | nginx do Jitsi (interno, atrás do Caddy) |

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
| nginx | nativo (exclusivo do Jitsi) |
| Outros | htop, curl, jq, vim, docker-buildx-plugin, docker-compose-plugin |

**Jitsi Meet (nativo, via apt):** `jitsi-meet`, `jitsi-videobridge2`, `jicofo`,
`jitsi-meet-prosody`, `jitsi-meet-web`, `jitsi-meet-turnserver`, `coturn`.

## 5. Serviços systemd ativos

| Serviço | Função |
|---|---|
| `docker.service` / `containerd.service` | Contêineres |
| `nginx.service` | HTTPS interno do Jitsi (portas 8843/8880) |
| `prosody.service` | Servidor XMPP do Jitsi |
| `jicofo.service` | Jitsi Conference Focus |
| `jitsi-videobridge2.service` | SFU WebRTC do Jitsi |
| `coturn.service` | STUN/TURN do Jitsi |

Crontab: nenhum (backups ainda não automatizados).

## 6. Projetos em disco (`/root/`)

| Diretório | Projeto | Tamanho |
|---|---|---|
| `/root/n8n` | Stack n8n + Caddy (gateway) | 21 GiB |
| `/root/nutrivion` | NutriFlow (backend + web + infra) | 52 MiB (código) |
| `/root/garantIA` | GarantIA (API + workers + deploy) | 3,3 MiB (código) |
| `/root/hub` | Hub estático (HTML) | 1,2 MiB |

Docker (armazenamento): `/var/lib/docker` ≈ 8,5 GiB.

## 7. Containers ativos

| Container | Imagem | Status |
|---|---|---|
| `n8n-n8n-1` | n8n-n8n | Up 2 semanas |
| `n8n-caddy-1` | caddy:2 | Up 12 dias (ports 80/443) |
| `nutriflow-backend-1` | nutriflow-backend | Up 12 dias |
| `nutriflow-web-1` | nutriflow-web | Up 12 dias |
| `nutriflow-postgres-1` | postgres:16-alpine | Up 12 dias (healthy) |
| `nutriflow-minio-1` | minio/minio:latest | Up 12 dias (healthy) |
| `garantia-prod-api-1` | garantia-prod-api | healthy |
| `garantia-prod-invoice-worker-1` | garantia-prod-invoice-worker | Up |
| `garantia-prod-notification-worker-1` | garantia-prod-notification-worker | Up |
| `garantia-prod-postgres-1` | postgres:16-alpine | healthy |
| `garantia-prod-redis-1` | redis:7-alpine | healthy |
| `garantia-prod-minio-1` | minio/minio:latest | healthy |

## 8. Imagens Docker

| Imagem | Tamanho |
|---|---|
| n8n-n8n | 6,13 GiB |
| garantia-prod-{api,invoice-worker,notification-worker,migrate} | 1,29 GiB cada |
| nutriflow-web | 663 MiB |
| nutriflow-backend | 518 MiB |
| postgres:16-alpine | 420 MiB |
| minio/minio:latest | 241 MiB |
| minio/mc:latest | 117 MiB |
| caddy:2 | 88,7 MiB |
| redis:7-alpine | 57,8 MiB |

## 9. Redes Docker

| Rede | Driver | Uso |
|---|---|---|
| `n8n_default` | bridge | **Compartilhada** — Caddy + NutriFlow + GarantIA (rotas públicas) |
| `nutriflow_default` | bridge | interna do NutriFlow |
| `garantia-prod_internal` | bridge | interna do GarantIA (postgres/redis/minio/workers) |
| `bridge` | bridge | default |

## 10. Domínios e rotas (Caddyfile do n8n — `/root/n8n/Caddyfile`)

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

HTTPS: emitido automaticamente pelo Caddy (Let's Encrypt, e-mail
`admin@vmi3360656.contaboserver.net`).

## 11. Topologia de rede (como as peças se conectam)

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
                └──► garantia-api:3000           (garantia.mcobo.com.br)
                        │  rede garantia-prod_internal
                        └──► postgres / redis / minio / workers (sem porta pública)
```

## 12. Notas operacionais

- **Gateway público é o Caddy do n8n.** Novos serviços devem entrar na rede `n8n_default`
  (com alias) e ter rota adicionada no Caddyfile — mesmo padrão do NutriFlow e do GarantIA.
- **não expor Postgres/Redis/MinIO publicamente**; acesso interno só via rede da stack.
- Credenciais de acesso aos repositórios GitHub: tokens embutidos em `/root/<repo>/.git/config`
  (padrão usado no n8n, nutrivion e garantIA).
- Segredos de aplicação: `stack.env` (n8n), `deploy/.env` (garantIA), `.env` (nutrivion) —
  não versionados.
- Backups de dados ainda **não** automatizados (sem cron). Pendência recomendada: `pg_dump`
  periódico do Postgres do GarantIA/NutriFlow e snapshot do volume do MinIO.
