## VTEX ↔ TikTok Shop Middleware

Middleware NestJS que integra Catálogo, Pedidos, Estoque e Logística entre VTEX e TikTok Shop.

### Stack
- Node.js 20, NestJS, Axios, Schedule, Prisma (PostgreSQL)
- Zod para validação de configuração e DTOs
- pino/nestjs-pino para logs estruturados
- Prometheus métricas (`/metrics`)
- PM2 + Docker/Docker Compose

### Pré-requisitos
- Node.js 20+
- PostgreSQL 14+
- npm 10+

### Variáveis de ambiente
Modele seu `.env` a partir do exemplo abaixo:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://ttsscore:senha@localhost:5432/ttsscoredb?schema=public

TIKTOK_APP_KEY=seu_app_key
TIKTOK_APP_SECRET=seu_app_secret
TIKTOK_BASE_AUTH=https://auth.tiktok-shops.com
TIKTOK_BASE_OPEN=https://open-api.tiktokglobalshop.com
TIKTOK_BASE_SERV=https://services.tiktokshop.com
TIKTOK_SHOP_CIPHER=seu_shop_cipher
TIKTOK_SHOP_ID=
TIKTOK_DEFAULT_CATEGORY_ID=600001
TIKTOK_BRAND_ID=
TIKTOK_BRAND_NAME=MinhaMarca
TIKTOK_WAREHOUSE_ID=7068517275539719942
TIKTOK_CURRENCY=BRL
TIKTOK_SAVE_MODE=LISTING
TIKTOK_PACKAGE_WEIGHT=1.2
TIKTOK_PACKAGE_WEIGHT_UNIT=KILOGRAM
TIKTOK_PACKAGE_LENGTH=10
TIKTOK_PACKAGE_WIDTH=10
TIKTOK_PACKAGE_HEIGHT=10
TIKTOK_PACKAGE_DIMENSION_UNIT=CENTIMETER
TIKTOK_DESCRIPTION_FALLBACK=Produto sem descrição detalhada.
TIKTOK_MINIMUM_ORDER_QUANTITY=1
TIKTOK_LISTING_PLATFORMS=TIKTOK_SHOP

VTEX_ACCOUNT=seuaccount
VTEX_ENVIRONMENT=vtexcommercestable
# opcional: informe o domínio completo da VTEX se precisar (ex.: leblog2.vtexcommercestable.com.br)
VTEX_DOMAIN=
# opcional: controle de paginação na listagem de SKUs (padrão pageSize=50, até 20 páginas)
VTEX_PAGE_SIZE=50
VTEX_PAGE_LIMIT=20
VTEX_FILE_PAGE_SIZE=50
VTEX_APP_KEY=seu_vtex_app_key
VTEX_APP_TOKEN=seu_vtex_app_token

PUBLIC_BASE_URL=https://ttsscoremedia.com.br
TTS_REDIRECT_PATH=/oauth/tiktokshop/callback

MIDDLEWARE_API_KEY=sua_chave_interna
SWAGGER_USERNAME=admin
SWAGGER_PASSWORD=strongpass

TOKEN_ENCRYPTION_KEY=chave_com_32_bytes_no_minimo_123456
REQUEST_TIMEOUT_MS=10000
HTTP_MAX_RETRIES=3
```

> `TOKEN_ENCRYPTION_KEY` é usada para criptografar refresh tokens TikTok via AES-256-GCM.

### Instalação
```bash
npm install
npm run prisma:generate
```

#### Banco de dados
```bash
npx prisma migrate deploy
```

### Execução
- Dev: `npm run start:dev`
- Produção: `npm run build && npm run start:prod`
- PM2: `pm2 start ecosystem.config.js`

### Docker
```bash
docker-compose up -d --build
```
Depois:
```bash
docker-compose exec app npx prisma migrate deploy
```

### Endpoints principais
- `GET /health` – healthcheck
- `GET /metrics` – métricas Prometheus
- `GET /docs` – Swagger (com basic auth em produção)
- `GET /oauth/tiktokshop/callback` – callback OAuth TikTok Shop
- `POST /webhooks/tiktok/orders` – webhook de pedidos
- Rotas internas (`x-api-key`):
  - `POST /internal/catalog/sync`
  - `POST /internal/inventory/sync`
  - `GET /orders/:ttsOrderId/label`

### Fluxos
1. **Catálogo**: sincroniza SKUs VTEX → TikTok (preço, estoque, imagens) com registro em `ProductMap`.
2. **Estoque**: job a cada 10 minutos também sincroniza manualmente via `/internal/inventory/sync`.
3. **Pedidos**: webhook cria pedido na VTEX utilizando `ProductMap`, persiste em `OrderMap`, gera etiqueta via TikTok Logistics.
4. **OAuth**: callback troca `auth_code` por tokens (`TiktokAuth`). Refresh automático ao reutilizar o token.

### Observabilidade e segurança
- Logs JSON com `x-request-id`
- Rate limit global (`@nestjs/throttler`)
- Assinatura HMAC em webhooks TikTok
- Tokens criptografados em repouso

### Testes
```bash
npm test         # unitário e integração rápida
npm run test:e2e # cenários e2e (supertest)
```

### Autorizar TikTok Shop
1. Gere a URL de autorização oficial (adapte `state` com o `shopId`):
   ```
   https://services.tiktokshop.com/open/authorize?app_key=${TIKTOK_APP_KEY}&state=${btoa(JSON.stringify({shopId:"SEU_SHOP"}))}&redirect_uri=${PUBLIC_BASE_URL}${TTS_REDIRECT_PATH}
   ```
2. Após aprovação, TikTok redireciona para `/oauth/tiktokshop/callback`.
3. O middleware troca `auth_code` por tokens e registra em banco.

### Troubleshooting
- Erros HTTP são registrados em JSON (pino). Busque o `requestId`.
- Cheque `Idempotency` para eventos repetidos/ignorados.
- Refaça `ProductMap` em caso de divergência de SKU entre plataformas.
- Ajuste `REQUEST_TIMEOUT_MS` e `HTTP_MAX_RETRIES` para cenários com APIs lentas.

### Próximos passos sugeridos
- Configurar monitoramento Prometheus/Grafana.
- Aumentar cobertura de testes unitários dos clients.
- Conectar com serviços reais adaptando endpoints nos clients de VTEX/TikTok.
