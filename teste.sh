# Teste pedido

cat > /tmp/vtex-payload.json <<'JSON'

[{"marketplaceOrderId":"582230062321862191","marketplaceServicesEndpoint":"https://tts.scoremedia.com.br/webhooks/vtex/notify/af388ccf040f09b4eb4e6a1c0bfbf17e64205bb53261d87046fb153d5018399c","marketplacePaymentValue":12772,"items":[{"id":"7904","quantity":1,"seller":"1","price":11920}],"clientProfileData":{"firstName":"LENICE","lastName":"FLORENTINO DE SOUZA","email":"v4bEFUSBUB5RZO52NPPFI6KKBKX2A@scs2.tiktok.com","phone":"11999999999","documentType":"cpf","document":"90598164200"},"shippingData":{"address":{"addressType":"residential","receiverName":"Lenice Florentino","postalCode":"04754010","city":"São Paulo","state":"SP","country":"BRA","street":"Avenida Mário Lopes Leão","number":"952","neighborhood":"Santo Amaro","complement":"Apto 1415 torre 2"},"selectedSla":"SEDEX","logisticsInfo":[{"itemIndex":0,"selectedSla":"SEDEX","price":852,"shippingEstimate":"6bd","lockTTL":"1bd"}]},"paymentData":{"payments":[{"paymentSystem":"201","paymentSystemName":"TikTok Shop","group":"custom201PaymentGroupPaymentGroup","installments":1,"value":12772}]}}]
JSON

curl -sS -D /tmp/vtex-headers.txt -o /tmp/vtex-body.json \
  -X POST "https://leblog2.vtexcommercestable.com.br/api/fulfillment/pvt/orders?sc=1&affiliateId=a13eac82-def4-49c6-a6ca-3a9b86e87915" \
  -H "X-VTEX-API-AppKey: vtexappkey-leblog2-IVRVOO" \
  -H "X-VTEX-API-AppToken: ESMSQCKLFZDDNVCXPAXYILLYHFKRFSJYCRWFYICRXRJEEFTXDGRUQBYLTUFNUIXLNNSTCHJXUKXNJNBEIPIMIMNTMQWMRVPDMHOUJDEFTMMCXRNFFYURHVNJSCTXPNRN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/vtex-payload.json

cat /tmp/vtex-body.json

# Simular

# cat > /tmp/vtex-sim.json <<'JSON'
# {
#   "items": [
#     { "id": "7904", "quantity": 1, "seller": "1" }
#   ],
#   "postalCode": "04754010",
#   "country": "BRA"
# }
# JSON

# curl -sS -D /tmp/vtex-sim-headers.txt -o /tmp/vtex-sim-body.json \
#   -X POST "https://leblog2.vtexcommercestable.com.br/api/checkout/pub/orderForms/simulation?sc=1" \
#   -H "Content-Type: application/json" \
#   --data-binary @/tmp/vtex-sim.json

# cat /tmp/vtex-sim-body.json

