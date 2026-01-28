#!/usr/bin/env bash
set -euo pipefail

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing env var: $name" >&2
    exit 1
  fi
}

# Required auth
require VTEX_APP_KEY
require VTEX_APP_TOKEN

# Required inputs
require SKU_ID
require CEP

# Optional inputs (with sensible defaults)
SELLER_ID=${SELLER_ID:-hopelingerieruasposcarfreire}
SC=${SC:-${VTEX_SALES_CHANNEL:-1}}
AFFILIATE_ID=${AFFILIATE_ID:-${VTEX_AFFILIATE_ID:-}}
WAREHOUSE_ID=${WAREHOUSE_ID:-${VTEX_WAREHOUSE_ID:-1_1}}

# Build base URL
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

BASE_API="${BASE}/api"

if [ -z "$AFFILIATE_ID" ]; then
  echo "Missing AFFILIATE_ID (or VTEX_AFFILIATE_ID)." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found. Install jq for formatted output." >&2
  JQ="cat"
else
  JQ="jq"
fi

hdr_appkey=( -H "X-VTEX-API-AppKey: ${VTEX_APP_KEY}" )
hdr_apptoken=( -H "X-VTEX-API-AppToken: ${VTEX_APP_TOKEN}" )


cat <<EOF
== Config ==
BASE: ${BASE}
SC: ${SC}
AFFILIATE_ID: ${AFFILIATE_ID}
WAREHOUSE_ID: ${WAREHOUSE_ID}
SELLER_ID: ${SELLER_ID}
SKU_ID: ${SKU_ID}
CEP: ${CEP}
EOF


echo "== 1) Seller ativo =="
curl -sS "${BASE_API}/catalog_system/pvt/seller/list" \
  "${hdr_appkey[@]}" "${hdr_apptoken[@]}" \
| $JQ '.[] | select(.SellerId=="'"${SELLER_ID}"'") | {SellerId, IsActive, Name}'


echo "== 2) Estoque do SKU no warehouse =="
curl -sS "${BASE_API}/logistics/pvt/inventory/items/${SKU_ID}/warehouses/${WAREHOUSE_ID}" \
  "${hdr_appkey[@]}" "${hdr_apptoken[@]}" \
| $JQ '.'


SIM_PAYLOAD="/tmp/vtex-sim-oscar.json"
SIM_RESPONSE="/tmp/vtex-sim-oscar-response.json"
cat > "${SIM_PAYLOAD}" <<JSON
{
  "items": [
    { "id": "${SKU_ID}", "quantity": 1, "seller": "${SELLER_ID}" }
  ],
  "postalCode": "${CEP}",
  "country": "BRA"
}
JSON

echo "== 3) Simulacao (seller + delivery SLAs) =="
curl -sS -X POST "${BASE_API}/checkout/pub/orderForms/simulation?sc=${SC}&affiliateId=${AFFILIATE_ID}" \
  -H "Content-Type: application/json" \
  --data-binary @"${SIM_PAYLOAD}" \
  > "${SIM_RESPONSE}"

$JQ '{availability: .items[0].availability,
      sellerChain: .items[0].sellerChain,
      deliverySlas: [.logisticsInfo[0].slas[] | select(.deliveryChannel=="delivery") | {id, price, shippingEstimate}]}' "${SIM_RESPONSE}"


echo "== 4) SLAs delivery dentro do sellerChain =="
$JQ '.purchaseConditions.itemPurchaseConditions[]
     | select(.seller=="'"${SELLER_ID}"'")
     | {sellerChain, deliverySlas: [.slas[] | select(.deliveryChannel=="delivery") | .id]}' "${SIM_RESPONSE}"


echo "\nOK. Respostas completas em: ${SIM_RESPONSE}"
