#!/usr/bin/env bash
set -euo pipefail

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

SELLER_ID="hopelingerieruasposcarfreire"
ITEM_PRICE="2490"
SHIP_PRICE="1490"
SLA_ID="Econômica"
SHIP_ESTIMATE="1bd"

# require() {
#   local name="$1"
#   if [ -z "${!name:-}" ]; then
#     echo "Missing var: $name" >&2
#     exit 1
#   fi
# }

# require VTEX_APP_KEY
# require VTEX_APP_TOKEN
# require SKU_ID
# require CEP
# require MARKETPLACE_ORDER_ID
# require MARKETPLACE_ENDPOINT
# require AFFILIATE_ID

# if [ -n "$VTEX_DOMAIN" ]; then
#   BASE="https://${VTEX_DOMAIN}"
# else
#   require VTEX_ACCOUNT
#   require VTEX_ENVIRONMENT
#   if [[ "${VTEX_ENVIRONMENT}" == *.* ]]; then
#     SUFFIX="${VTEX_ENVIRONMENT}"
#   else
#     SUFFIX="${VTEX_ENVIRONMENT}.com.br"
#   fi
#   BASE="https://${VTEX_ACCOUNT}.${SUFFIX}"
# fi

# cat > /tmp/vtex-payload.json <<JSON
# [
#   {
#     "marketplaceOrderId": "${MARKETPLACE_ORDER_ID}",
#     "marketplaceServicesEndpoint": "${MARKETPLACE_ENDPOINT}",
#     "marketplacePaymentValue": $((ITEM_PRICE + SHIP_PRICE)),
#     "items": [
#       {
#         "id": "${SKU_ID}",
#         "quantity": 1,
#         "seller": "${SELLER_ID}",
#         "price": ${ITEM_PRICE}
#       }
#     ],
#     "clientProfileData": {
#       "firstName": "TESTE",
#       "lastName": "TIKTOK",
#       "email": "teste+tiktok@exemplo.com",
#       "phone": "11999999999",
#       "documentType": "cpf",
#       "document": "90598164200"
#     },
#     "shippingData": {
#       "address": {
#         "addressType": "residential",
#         "receiverName": "Teste TikTok",
#         "postalCode": "${CEP}",
#         "city": "São Paulo",
#         "state": "SP",
#         "country": "BRA",
#         "street": "Av. Exemplo",
#         "number": "123",
#         "neighborhood": "Centro",
#         "complement": "Apto 1"
#       },
#       "selectedSla": "${SLA_ID}",
#       "logisticsInfo": [
#         {
#           "itemIndex": 0,
#           "selectedSla": "${SLA_ID}",
#           "price": ${SHIP_PRICE},
#           "shippingEstimate": "${SHIP_ESTIMATE}",
#           "lockTTL": "1bd",
#           "deliveryChannel": "delivery",
#           "selectedDeliveryChannel": "delivery"
#         }
#       ]
#     },
#     "paymentData": {
#       "payments": [
#         {
#           "paymentSystem": "201",
#           "paymentSystemName": "TikTok Shop",
#           "group": "custom201PaymentGroupPaymentGroup",
#           "installments": 1,
#           "value": $((ITEM_PRICE + SHIP_PRICE))
#         }
#       ]
#     }
#   }
# ]
# JSON

# curl -sS -D /tmp/vtex-headers.txt -o /tmp/vtex-body.json \
#   -X POST "${BASE}/api/fulfillment/pvt/orders?sc=${SC}&affiliateId=${AFFILIATE_ID}" \
#   -H "X-VTEX-API-AppKey: ${VTEX_APP_KEY}" \
#   -H "X-VTEX-API-AppToken: ${VTEX_APP_TOKEN}" \
#   -H "Content-Type: application/json" \
#   --data-binary @/tmp/vtex-payload.json

# cat /tmp/vtex-body.json

curl -s -H "X-VTEX-API-AppKey: $VTEX_APP_KEY" \
     -H "X-VTEX-API-AppToken: $VTEX_APP_TOKEN" \
  "https://hopelingerie.vtexcommercestable.com.br/api/catalog/pvt/stockkeepingunit/25527" \
| jq '.SkuSellers'
