import http from 'node:http'

const PRODUCT_ID = '22222222-2222-2222-2222-222222222222'
let failFixedDiscountLookup = false

const product = {
  id: PRODUCT_ID,
  name: '격리 QA 전열교환기',
  modelName: 'QA-HVAC-001',
  categoryId: null,
  sellingPrice: 1000000,
  status: 'ACTIVE',
  modelCode: 'QA-HVAC-001',
  productType: 'SINGLE',
  categoryKey: 'homemulti',
  fixedDiscountRate: null,
  fixedDiscountSource: 'NONE',
  discountFlags: '000000',
  releasePrice: 1000000,
  deliveryPrice: 1000000,
  hasVariableDiscount: true,
  physicalCategoryCode: 'HVAC',
}

function json(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function envelope(data) {
  return { success: true, code: 'OK', message: '성공', data }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:28084')

  if (url.pathname === '/__qa/fixed-fail/on') {
    failFixedDiscountLookup = true
    return json(response, 200, { failFixedDiscountLookup })
  }
  if (url.pathname === '/__qa/fixed-fail/off') {
    failFixedDiscountLookup = false
    return json(response, 200, { failFixedDiscountLookup })
  }
  if (url.pathname === '/actuator/health') {
    return json(response, 200, { status: 'UP' })
  }
  if (request.method === 'GET' && url.pathname === '/internal/partners/P-QA-40') {
    return json(response, 200, envelope({
      partnerId: '11111111-1111-1111-1111-111111111111',
      partnerCode: 'P-QA-40',
      name: '격리 QA 거래처',
      bizNo: '123-45-67890',
      status: 'ACTIVE',
    }))
  }
  if (request.method === 'POST' && url.pathname === '/products/internal/lookup-by-model-codes') {
    return json(response, 200, envelope([product]))
  }
  if (request.method === 'POST' && url.pathname === '/products/internal/lookup') {
    return json(response, 200, envelope([product]))
  }
  if (request.method === 'POST' && url.pathname === '/products/internal/fixed-discount-rate-bulk') {
    if (failFixedDiscountLookup) {
      return json(response, 500, { success: false, code: 'QA_FIXED_AUX_DOWN', message: 'QA fixed aux down' })
    }
    return json(response, 200, envelope({ [PRODUCT_ID]: { fixedDiscountRate: null } }))
  }

  return json(response, 404, { success: false, code: 'NOT_FOUND', message: url.pathname })
})

server.listen(28084, '127.0.0.1', () => {
  console.log('isolated product/partner stub listening on 127.0.0.1:28084')
})
