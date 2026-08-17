import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-07 Google Sheets quote/order source contract', () => {
  const partnerOrderYml = read('services/partner-order-service/src/main/resources/application.yml')
  const bootstrapTest = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/BootstrapServiceTest.java')
  const catalogClient = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/vendor/client/ProductCatalogLookupClient.java')
  const catalogTest = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/vendor/client/ProductCatalogLookupClientTest.java')
  const productSync = read('services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java')
  const productSyncTest = read('services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java')
  const sourceDoc = read('docs/operational-validation/google-sheets-live-source-snapshot.md')
  const validationDoc = read('docs/operational-validation/google-sheets-source-validation.md')
  const opReadme = read('docs/operational-validation/README.md')

  test('bootstrap은 DB/seed source-of-truth이고 credential/output form을 읽지 않는다', () => {
    expect(partnerOrderYml).toContain('range-map: "{}"')
    expect(partnerOrderYml).not.toContain('sheet-id:')
    expect(partnerOrderYml).not.toContain('service-account-key-path:')
    expect(partnerOrderYml).not.toContain("config:'설정!A1:Z'")
    expect(partnerOrderYml).not.toContain('전표생성폼!A1:Z')
    expect(partnerOrderYml).not.toContain('전표업로드목록!A1:Z')
    expect(partnerOrderYml).not.toContain('종합견적서!A1:Z')
  })

  test('bootstrap test guards DB/seed fallback and secret-bearing form exclusion', () => {
    expect(bootstrapTest).toContain('시트설정과_무관하게_DB와_seed만_사용한다')
    expect(bootstrapTest).toContain('doesNotContainKey("homeDiscount")')
    expect(bootstrapTest).toContain('verify(sheetsClient, never()).readSheet(anyString(), anyString(), any(ValueRenderMode.class))')
  })

  test('partner-order catalog lookup uses current increase tabs only', () => {
    expect(catalogClient).toContain('홈멀티_단가인상!A1:Z')
    expect(catalogClient).toContain('싱글 세트_단가인상!A1:Z')
    expect(catalogClient).toContain('싱글 구성품_단가인상!A1:Z')
    expect(catalogClient).toContain('상업멀티_단가인상!A1:Z')
    expect(catalogClient).toContain('상업멀티 구성_단가인상!A1:Z')
    expect(catalogClient).not.toContain('new CatalogTab("홈멀티!A1:Z"')
    expect(catalogClient).not.toContain('PriceBasis.BEFORE_INCREASE')
    expect(catalogClient).not.toContain('beforeIncreaseUnitPrice')
    expect(catalogClient).not.toContain('종합견적서!A2:C')
    expect(catalogTest).toContain('lookup_주문서경로는_단가인상탭만_읽고_base탭을_사용하지_않는다')
    expect(catalogTest).toContain('lookup_싱글세트는_C열_모델명과_H열_납품가를_그대로_읽는다')
  })

  test('product-service DB sync preserves current default and before-increase history mapping', () => {
    expect(productSync).toContain('new SheetTabMapping("홈멀티", "홈멀티_단가인상", "홈멀티"')
    expect(productSync).toContain('new SheetTabMapping("싱글 세트", "싱글 세트_단가인상", "싱글 세트"')
    expect(productSync).toContain('0, 2, 4, 7')
    expect(productSync).toContain('new SheetTabMapping("상업멀티 구성", "상업멀티 구성_단가인상", "상업멀티 구성"')
    expect(productSync).toContain('0, 1, 3, 5')
    expect(productSync).toContain('PRICE_INCREASE_EFFECTIVE_DATE')
    expect(productSync).toContain('BEFORE_INCREASE_EFFECTIVE_DATE')
    expect(productSync).toContain('upsertPriceHistory')
    expect(productSyncTest).toContain('sync_싱글세트는_구글시트_C열_모델명과_H열_납품가를_그대로_읽는다')
    expect(productSyncTest).toContain('sync_상업멀티구성은_구글시트_F열_납품가를_그대로_읽는다')
    expect(productSyncTest).toContain('sync_종합견적서는_단가인상탭을_기본값으로_저장하고_base탭을_인상전_priceHistory로_보존한다')
  })

  test('live snapshot documents exact spreadsheet tabs without publishing secrets', () => {
    expect(sourceDoc).toContain('1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ')
    expect(sourceDoc).toContain('27개 tab')
    expect(sourceDoc).toContain('홈멀티_단가인상')
    expect(sourceDoc).toContain('싱글 세트_단가인상')
    expect(sourceDoc).toContain('상업멀티 구성_단가인상')
    expect(sourceDoc).toContain('전표생성폼')
    expect(sourceDoc).toContain('credential-bearing')
    expect(sourceDoc).toContain('전표업로드목록')
    expect(sourceDoc).toContain('output/form')
    expect(sourceDoc).not.toMatch(/API 인증키\s*\|[^|\n]+/)
  })

  test('operational validation routes runtime reads through product/order DB sync contract', () => {
    expect(validationDoc).toContain('Service Account')
    expect(validationDoc).toContain('종합견적서` tab 자체는 출력 양식')
    expect(validationDoc).toContain('ProductCatalogLookupClient')
    expect(validationDoc).toContain('ProductSheetSyncService')
    expect(validationDoc).toContain('전표생성폼`은 credential-bearing')
    expect(opReadme).toContain('Service Account 키 + 종합견적서/주문서 Google Sheet 원본 검증')
    expect(opReadme).toContain('runtime SA 키 검증')
  })
})
