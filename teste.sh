# Teste pedido

cat > /tmp/vtex-payload.json <<'JSON'

[
  {
    "marketplaceOrderId": "582307593983067721",
    "marketplaceServicesEndpoint": "https://tts.scoremedia.com.br/webhooks/vtex/notify/9226553e1728a95d4d47908ad97f1d002cac7b306f5de434acc1f1946c11086b",
    "marketplacePaymentValue": 2950,
    "items": [
      {
        "id": "25527",
        "quantity": 1,
        "seller": "1",
        "price": 2490,
        "priceTags": [
          {
            "name": "discount@shipping-0203129c-5fb4-43a0-b06e-70fb237b49f4#0966f070-02dd-4411-9b84-8ac1e5e2b00b",
            "value": -1,
            "isPercentual": false,
            "rawValue": -0.01
          }
        ]
      }
    ],
    "clientProfileData": {
      "firstName": "SAMARA",
      "lastName": "SILVA DE AMORIM",
      "email": "v4bGEUSBLA2SNO52NVPESWFUWKA2A@scs2.tiktok.com",
      "phone": "11999999999",
      "documentType": "cpf",
      "document": "04028298164"
    },
    "shippingData": {
      "address": {
        "addressType": "residential",
        "receiverName": "amorim.sami",
        "postalCode": "05520200",
        "city": "Sao Paulo",
        "state": "SP",
        "country": "BRA",
        "street": "Avenida Professor Francisco Morato",
        "number": "4886",
        "neighborhood": "Vila Sônia",
        "complement": "Apt 163"
      },
      "selectedSla": "Normal",
      "logisticsInfo": [
        {
          "itemIndex": 0,
          "selectedSla": "Normal",
          "price": 461,
          "shippingEstimate": "4bd",
          "lockTTL": "1bd",
          "deliveryChannel": "delivery",
          "selectedDeliveryChannel": "delivery",
          "deliveryIds": [
            {
              "courierId": "loggi",
              "warehouseId": "1a9a406",
              "dockId": "171d460",
              "quantity": 1,
              "kitItemDetails": []
            }
          ]
        }
      ]
    },
    "paymentData": {
      "payments": [
        {
          "paymentSystem": "201",
          "paymentSystemName": "TikTok Shop",
          "group": "custom201PaymentGroupPaymentGroup",
          "installments": 1,
          "value": 2950,
          "referenceValue": 2950
        }
      ]
    }
  }
]

JSON

curl -sS -D /tmp/vtex-headers.txt -o /tmp/vtex-body.json \
  -X POST "https://hopelingerie.vtexcommercestable.com.br/api/fulfillment/pvt/orders?sc=1&affiliateId=0218d152-a253-4ccf-b991-116f05512491" \
  -H "X-VTEX-API-AppKey: vtexappkey-hopelingerie-JGMZVH" \
  -H "X-VTEX-API-AppToken: TJQGGWYHHTBWCYOHVDSNRQYAWBTVLKUZGYHFHJTBUAHFQKQRPFDLCFPQPBNOQZEONFUDCQKPIBSAZHVVMKJVXDXTISRGAWISWVHESXVQSAPQCCUMVVFVRPGGTFJOWFXY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/vtex-payload.json

cat /tmp/vtex-body.json

# Simular

# cat > /tmp/vtex-sim.json <<'JSON'
# {
#   "items": [
#     { "id": "25527", "quantity": 1, "seller": "1" }
#   ],
#   "postalCode": "05520200",
#   "country": "BRA"
# }
# JSON

# curl -sS -D /tmp/vtex-sim-headers.txt -o /tmp/vtex-sim-body.json \
#   -X POST "https://hopelingerie.vtexcommercestable.com.br/api/checkout/pub/orderForms/simulation?sc=1&affiliateId=0218d152-a253-4ccf-b991-116f05512491" \
#   -H "Content-Type: application/json" \
#   --data-binary @/tmp/vtex-sim.json

# cat /tmp/vtex-sim-body.json
