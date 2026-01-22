# Teste pedido VTEX (usa variaveis do .env)
set -euo pipefail

ORDER_ID="${ORDER_ID:-582230062321862191}"
SKU_ID="${SKU_ID:-7904}"
QTY="${QTY:-1}"
SELLER_ID="${SELLER_ID:-1}"
PRICE_CENTS="${PRICE_CENTS:-11920}"
PAYMENT_TOTAL_CENTS="${PAYMENT_TOTAL_CENTS:-12772}"
POSTAL_CODE="${POSTAL_CODE:-04754010}"
COUNTRY="${COUNTRY:-BRA}"
SC="${VTEX_SALES_CHANNEL:-1}"
AFFILIATE_ID="${VTEX_AFFILIATE_ID:-}"

VTEX_DOMAIN="${VTEX_DOMAIN:-}"
VTEX_ENVIRONMENT="${VTEX_ENVIRONMENT:-vtexcommercestable}"

if [[ -n "$VTEX_DOMAIN" ]]; then
  if [[ "$VTEX_DOMAIN" =~ ^https?:// ]]; then
    VTEX_BASE_URL="${VTEX_DOMAIN%/}/api"
  else
    VTEX_BASE_URL="https://${VTEX_DOMAIN%/}/api"
  fi
else
  if [[ -z "${VTEX_ACCOUNT:-}" ]]; then
    echo "Missing VTEX_ACCOUNT or VTEX_DOMAIN." >&2
    exit 1
  fi
  if [[ "$VTEX_ENVIRONMENT" == *.* ]]; then
    VTEX_BASE_URL="https://${VTEX_ACCOUNT}.${VTEX_ENVIRONMENT}/api"
  else
    VTEX_BASE_URL="https://${VTEX_ACCOUNT}.${VTEX_ENVIRONMENT}.com/api"
  fi
fi

MARKETPLACE_ENDPOINT="${VTEX_MARKETPLACE_SERVICES_ENDPOINT:-${PUBLIC_BASE_URL:-}}"
if [[ -z "$MARKETPLACE_ENDPOINT" ]]; then
  echo "Missing VTEX_MARKETPLACE_SERVICES_ENDPOINT or PUBLIC_BASE_URL." >&2
  exit 1
fi

if [[ -z "${VTEX_APP_KEY:-}" || -z "${VTEX_APP_TOKEN:-}" ]]; then
  echo "Missing VTEX_APP_KEY or VTEX_APP_TOKEN." >&2
  exit 1
fi

cat > /tmp/vtex-payload.json <<JSON
[
  {
    "marketplaceOrderId": "${ORDER_ID}",
    "marketplaceServicesEndpoint": "${MARKETPLACE_ENDPOINT}",
    "marketplacePaymentValue": ${PAYMENT_TOTAL_CENTS},
    "items": [
      { "id": "${SKU_ID}", "quantity": ${QTY}, "seller": "${SELLER_ID}", "price": ${PRICE_CENTS} }
    ],
    "clientProfileData": {
      "firstName": "LENICE",
      "lastName": "FLORENTINO DE SOUZA",
      "email": "v4bEFUSBUB5RZO52NPPFI6KKBKX2A@scs2.tiktok.com",
      "phone": "11999999999",
      "documentType": "cpf",
      "document": "90598164200"
    },
    "shippingData": {
      "address": {
        "addressType": "residential",
        "receiverName": "Lenice Florentino",
        "postalCode": "${POSTAL_CODE}",
        "city": "Sao Paulo",
        "state": "SP",
        "country": "${COUNTRY}",
        "street": "Avenida Mario Lopes Leao",
        "number": "952",
        "neighborhood": "Santo Amaro",
        "complement": "Apto 1415 torre 2"
      },
      "selectedSla": "SEDEX",
      "logisticsInfo": [
        { "itemIndex": 0, "selectedSla": "SEDEX", "price": 852, "shippingEstimate": "6bd", "lockTTL": "1bd" }
      ]
    },
    "paymentData": {
      "payments": [
        {
          "paymentSystem": "${VTEX_PAYMENT_SYSTEM_ID:-201}",
          "paymentSystemName": "${VTEX_PAYMENT_SYSTEM_NAME:-TikTok Shop}",
          "group": "${VTEX_PAYMENT_GROUP:-custom201PaymentGroupPaymentGroup}",
          "installments": 1,
          "value": ${PAYMENT_TOTAL_CENTS}
        }
      ]
    }
  }
]
JSON

curl -sS -D /tmp/vtex-headers.txt -o /tmp/vtex-body.json \
  -X POST "${VTEX_BASE_URL}/fulfillment/pvt/orders?sc=${SC}${AFFILIATE_ID:+&affiliateId=${AFFILIATE_ID}}" \
  -H "X-VTEX-API-AppKey: ${VTEX_APP_KEY}" \
  -H "X-VTEX-API-AppToken: ${VTEX_APP_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/vtex-payload.json

cat /tmp/vtex-body.json

# Simular (opcional)
# cat > /tmp/vtex-sim.json <<JSON
# {
#   "items": [
#     { "id": "${SKU_ID}", "quantity": ${QTY}, "seller": "${SELLER_ID}" }
#   ],
#   "postalCode": "${POSTAL_CODE}",
#   "country": "${COUNTRY}"
# }
# JSON
#
# curl -sS -D /tmp/vtex-sim-headers.txt -o /tmp/vtex-sim-body.json \
#   -X POST "${VTEX_BASE_URL}/checkout/pub/orderForms/simulation?sc=${SC}${AFFILIATE_ID:+&affiliateId=${AFFILIATE_ID}}" \
#   -H "Content-Type: application/json" \
#   --data-binary @/tmp/vtex-sim.json
#
# cat /tmp/vtex-sim-body.json
