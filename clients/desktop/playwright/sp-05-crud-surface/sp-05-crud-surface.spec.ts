/**
 * SP-05 Samhan Public CRUD surface contract.
 *
 * dev server 없이 실행되는 정적 회귀 스펙:
 * - 판매관리/구매관리는 신규 작성뿐 아니라 목록에서 상세/수정 화면으로 명시 진입할 수 있어야 한다.
 * - 상세 버튼과 test id 는 UUID(id)가 아니라 공개 업무번호(slipNo) 기반이어야 한다.
 * - 기능 재점검 문서는 이미 구현된 거래처 UI와 입고 검수 CTA를 "UI 부재"로 남기지 않아야 한다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')

const salesPagePath = path.join(desktopRoot, 'src/renderer/routes/sales-query/SalesQueryPage.tsx')
const purchasePagePath = path.join(desktopRoot, 'src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
const routesPath = path.join(desktopRoot, 'src/renderer/routes/index.tsx')
const featureInventoryPath = path.join(repoRoot, 'docs/manual/inventory/frontend-feature-inventory.md')
const missingCatalogPath = path.join(repoRoot, 'docs/manual/inventory/missing-features-catalog.md')

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

function getPropertyName(propertyName: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
    return propertyName.text
  }

  return undefined
}

function getStaticString(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }

  return undefined
}

function findRouteElements(routesSource: string, routePath: string): ts.Expression[] {
  const sourceFile = ts.createSourceFile(
    'routes.tsx',
    routesSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const routeElements: ts.Expression[] = []

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const pathProperty = node.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) && getPropertyName(property.name) === 'path',
      )
      const elementProperty = node.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) && getPropertyName(property.name) === 'element',
      )

      if (pathProperty && elementProperty && getStaticString(pathProperty.initializer) === routePath) {
        routeElements.push(elementProperty.initializer)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return routeElements
}

function hasSlipDetailPageMode(element: ts.Node, mode: 'INBOUND' | 'OUTBOUND'): boolean {
  let found = false

  function visit(node: ts.Node): void {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const openingElement = ts.isJsxSelfClosingElement(node) ? node : node.openingElement
      if (openingElement.tagName.getText() === 'SlipDetailPage') {
        const modeAttribute = openingElement.attributes.properties.find(
          (attribute): attribute is ts.JsxAttribute =>
            ts.isJsxAttribute(attribute) && attribute.name.text === 'mode',
        )
        const modeValue = modeAttribute?.initializer
        if (
          modeValue &&
          ts.isStringLiteral(modeValue) &&
          modeValue.text === mode
        ) {
          found = true
          return
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(element)
  return found
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

test.describe('SP-05 Samhan Public CRUD surface', () => {
  test('판매관리 목록은 공개 판매번호 기반 상세 버튼으로 전표 상세에 진입한다', () => {
    const page = read(salesPagePath)
    const routes = read(routesPath)

    const routeElements = findRouteElements(routes, '/sales/:id')
    expect(routeElements).toHaveLength(1)
    expect(hasSlipDetailPageMode(routeElements[0], 'OUTBOUND')).toBe(true)
    expect(page).toContain('function toPublicTestId(value: string): string')
    expect(page).toContain('data-testid={`sales-query-detail-${toPublicTestId(row.slipNo)}`}')
    expect(page).toContain('navigate(`/sales/${row.id}`)')
    expect(page).toContain('aria-label={`${row.slipNo} 상세 보기`}')
    expect(page).not.toMatch(/data-testid=\{`sales-query-detail-\$\{row\.id\}`\}/)
  })

  test('구매관리 목록은 공개 구매번호 기반 상세 버튼으로 전표 상세에 진입한다', () => {
    const page = read(purchasePagePath)
    const routes = read(routesPath)

    const routeElements = findRouteElements(routes, '/purchases/:id')
    expect(routeElements).toHaveLength(1)
    expect(hasSlipDetailPageMode(routeElements[0], 'INBOUND')).toBe(true)
    expect(page).toContain('function toPublicTestId(value: string): string')
    expect(page).toContain('data-testid={`purchase-query-detail-${toPublicTestId(row.slipNo)}`}')
    expect(page).toContain('navigate(`/purchases/${row.id}`)')
    expect(page).toContain('aria-label={`${row.slipNo} 상세 보기`}')
    expect(page).not.toMatch(/data-testid=\{`purchase-query-detail-\$\{row\.id\}`\}/)
  })

  test('SP-05 문서는 거래처 UI와 입고 검수 CTA의 현재 구현 상태를 우선 반영한다', () => {
    const featureInventory = read(featureInventoryPath)
    const missingCatalog = read(missingCatalogPath)

    expect(featureInventory).toContain('2026-05-16 SP-05 현재 상태 우선 적용')
    expect(featureInventory).toContain('/admin/partners')
    expect(featureInventory).toContain('/admin/partners/new')
    expect(normalizeWhitespace(featureInventory)).toContain(
      '판매관리와 구매관리는 목록에서 명시 상세 버튼으로 `/sales/:id`, `/purchases/:id`에 진입',
    )
    expect(featureInventory).not.toContain('거래처 등록 4 탭** (기본정보 / 거래처정보 / 여신단가 / 부가정보) | (없음')

    expect(missingCatalog).toContain('2026-05-16 SP-05 재점검')
    expect(missingCatalog).toContain('거래처 기본 생성 UI는 `/admin/partners/new`로 운영 가능')
    expect(missingCatalog).toContain('구매관리 목록 CTA로 입고 검수 Dialog 진입 가능')
    expect(missingCatalog).not.toContain('`partner-service` backend `PartnerAdminController` (POST/GET/PUT/DELETE) 완성. desktop UI **부재**.')
    expect(missingCatalog).not.toContain('backend lifecycle 9 transition 중 `inspect` 만 UI 부재')
  })
})
