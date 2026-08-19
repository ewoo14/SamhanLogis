const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const workflow = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'deploy-order-app.yml'),
  'utf8',
)

test('order-app Cloudflare workflow uses the repository release source and production API origin', () => {
  assert.match(workflow, /VITE_APP_VERSION:\s*\$\{\{\s*vars\.SAMHAN_RELEASE_VERSION\s*\}\}/)
  assert.match(workflow, /VITE_API_BASE_URL:\s*https:\/\/api\.samhan-air\.com\/api\/v1/)
  assert.doesNotMatch(workflow, /VITE_APP_VERSION:\s*\$\{\{\s*github\.run_number/)
})

test('order-app Cloudflare workflow fails when either Pages credential is missing', () => {
  assert.match(workflow, /CLOUDFLARE_API_TOKEN is required[\s\S]*exit 1/)
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID is required[\s\S]*exit 1/)
  assert.doesNotMatch(workflow, /ready=false|Cloudflare 배포 skip|steps\.cfcheck\.outputs\.ready/)
})

test('order-app Cloudflare workflow publishes the verified Vite dist to the canonical Pages project', () => {
  assert.match(workflow, /projectName:\s*samhan-order-app/)
  assert.match(workflow, /directory:\s*clients\/web\/order-app\/dist/)
})
