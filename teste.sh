#!/usr/bin/env bash
# set -euo pipefail

# Teste pedido com seller Oscar Freire + SLA delivery (Econômica)
# Preencha as variáveis abaixo diretamente neste arquivo.

VTEX_APP_KEY="vtexappkey-hopelingerie-JGMZVH"
VTEX_APP_TOKEN="TJQGGWYHHTBWCYOHVDSNRQYAWBTVLKUZGYHFHJTBUAHFQKQRPFDLCFPQPBNOQZEONFUDCQKPIBSAZHVVMKJVXDXTISRGAWISWVHESXVQSAPQCCUMVVFVRPGGTFJOWFXY"
VTEX_DOMAIN="hopelingerie.vtexcommercestable.com.br"
VTEX_ACCOUNT="hopelingerie"
VTEX_ENVIRONMENT="vtexcommercestable"

SKU_ID="25527"
CEP="05520200"
MARKETPLACE_ORDER_ID="582323092461225519"
MARKETPLACE_ENDPOINT="https://tts.scoremedia.com.br/webhooks/vtex/marketplace/9226553e1728a95d4d47908ad97f1d002cac7b306f5de434acc1f1946c11086b"
AFFILIATE_ID="0218d152-a253-4ccf-b991-116f05512491"
SC="1"

SELLER_ID="1"
ITEM_PRICE="2490"
SHIP_PRICE="1490"
SLA_ID="Econômica"
EMAIL="teste+tiktok@exemplo.com"
SHIP_ESTIMATE="1bd" 

#!/usr/bin/env bash
set -euo pipefail

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing var: $name" >&2
    exit 1
  fi
}

# ---------- REQUIRED ENV VARS ----------
require VTEX_APP_KEY
require VTEX_APP_TOKEN

# VTEX base URL:
# Option A: VTEX_DOMAIN="account.vtexcommercestable.com.br"
# Option B: VTEX_ACCOUNT="account" + VTEX_ENVIRONMENT="vtexcommercestable.com.br" (or "vtexcommercestable")
if [ -n "${VTEX_DOMAIN:-}" ]; then
  BASE="https://${VTEX_DOMAIN}"
else
  require VTEX_ACCOUNT
  require VTEX_ENVIRONMENT
  if [[ "${VTEX_ENVIRONMENT}" == *.* ]]; then
    SUFFIX="${VTEX_ENVIRONMENT}"
  else
    SUFFIX="${VTEX_ENVIRONMENT}.com.br"
  fi
  BASE="https://${VTEX_ACCOUNT}.${SUFFIX}"
fi

# Marketplace/Fulfillment context
require SC
require AFFILIATE_ID
require MARKETPLACE_ORDER_ID
require MARKETPLACE_ENDPOINT

# Order data
require SKU_ID
require CEP
require ITEM_PRICE          # integer (cents). ex: 2490
require SLA_ID              # must match simulation exactly: "Econômica", "Normal", etc.

# Optional overrides
SELLER_ID="${SELLER_ID:-1}" # default: matriz "1"
SHIP_PRICE="${SHIP_PRICE:-0}" # not required by VTEX in payload; kept for marketplacePaymentValue calc
EMAIL="${EMAIL:-teste+tiktok@exemplo.com}"

TOTAL_VALUE=$((ITEM_PRICE + SHIP_PRICE))

# ---------- BUILD PAYLOAD ----------
tmp_payload="/tmp/vtex-fulfillment-create.json"
cat > "${tmp_payload}" <<JSON
[
  {
    "marketplaceOrderId": "582323092461225519",
    "marketplaceServicesEndpoint": "https://tts.scoremedia.com.br/webhooks/vtex/marketplace/9226553e1728a95d4d47908ad97f1d002cac7b306f5de434acc1f1946c11086b",
    "marketplacePaymentValue": 3979,
    "items": [
      {
        "id": "25527",
        "quantity": 1,
        "seller": "1",
        "price": 2490
      }
    ],
    "clientProfileData": {
      "firstName": "TESTE",
      "lastName": "TIKTOK",
      "email": "teste+tiktok@exemplo.com",
      "phone": "11999999999",
      "documentType": "cpf",
      "document": "90598164200"
    },
    "shippingData": {
      "address": {
        "addressType": "residential",
        "receiverName": "Teste TikTok",
        "addressId": "shipping",
        "isDisposable": true,
        "postalCode": "05520200",
        "city": "São Paulo",
        "state": "SP",
        "country": "BRA",
        "street": "Avenida Professor Francisco Morato",
        "number": "123",
        "neighborhood": "Vila Sônia",
        "complement": "Apto 1",
        "reference": null,
        "geoCoordinates": [-46.73171615600586, -23.591995239257812]
      },
      "selectedAddresses": [
        {
          "addressType": "residential",
          "receiverName": "Teste TikTok",
          "addressId": "shipping",
          "isDisposable": true,
          "postalCode": "05520200",
          "city": "São Paulo",
          "state": "SP",
          "country": "BRA",
          "street": "Avenida Professor Francisco Morato",
          "number": "123",
          "neighborhood": "Vila Sônia",
          "complement": "Apto 1",
          "reference": null,
          "geoCoordinates": [-46.73171615600586, -23.591995239257812]
        }
      ],
      "logisticsInfo": [
        {
          "itemIndex": 0,
          "selectedSla": "Sedex",
          "selectedDeliveryChannel": "delivery",
          "shippingEstimate": "1bd",
          "price": 0,
          "lockTTL": "1800"
        }
      ]
    },
    "paymentData": {
      "payments": [
        {
          "paymentSystem": "201",
          "paymentSystemName": "TikTok Shop",
          "group": "custom201PaymentGroup",
          "installments": 1,
          "value": 3979
        }
      ]
    }
  }
]


JSON

echo "=== Payload ==="
cat "${tmp_payload}"
echo
echo "=== POST ${BASE}/api/fulfillment/pvt/orders?sc=${SC}&affiliateId=${AFFILIATE_ID} ==="

# ---------- CALL VTEX ----------
curl -sS -D /tmp/vtex-headers.txt -o /tmp/vtex-body.json \
  -X POST "${BASE}/api/fulfillment/pvt/orders?sc=${SC}&affiliateId=${AFFILIATE_ID}" \
  -H "X-VTEX-API-AppKey: ${VTEX_APP_KEY}" \
  -H "X-VTEX-API-AppToken: ${VTEX_APP_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @"${tmp_payload}"

echo
echo "=== Response headers ==="
cat /tmp/vtex-headers.txt
echo
echo "=== Response body ==="
cat /tmp/vtex-body.json
echo
