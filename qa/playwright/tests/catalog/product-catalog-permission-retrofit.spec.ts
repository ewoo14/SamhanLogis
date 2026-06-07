import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const productCatalogControllerPath = path.join(
  repoRoot,
  'services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java',
);
const categoryControllerPath = path.join(
  repoRoot,
  'services/product-service/src/main/java/com/samhanair/logis/product/web/CategoryController.java',
);
const gatewayPath = path.join(repoRoot, 'services/api-gateway/src/main/resources/application.yml');
const desktopMockPath = path.join(repoRoot, 'clients/desktop/src/renderer/api/mock.ts');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function expectProtectedMapping(
  source: string,
  mapping: string,
  pageCode: string,
  action: string,
): void {
  expect(source).toMatch(
    new RegExp(
      `${mapping.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?@RequirePermission\\(page = "${pageCode.replace('.', '\\.')}", action = PermissionAction\\.${action}\\)`,
    ),
  );
}

function routeBlock(source: string, routeId: string): string {
  const match = source.match(new RegExp(`- id: ${routeId}[\\s\\S]*?(?=\\n        - id:|$)`));
  expect(match, `gateway ${routeId} route block`).not.toBeNull();
  return match![0];
}

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `source block start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `source block end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function expectMockPermissionFlow(
  block: string,
  pageCode: string,
  action: 'view' | 'create' | 'update' | 'delete',
  successNeedle: string,
): void {
  const permissionNeedle = `mockRequirePermission('${pageCode}', '${action}')`;
  expect(block).toContain(permissionNeedle);
  expect(block).toContain('if (denied) return denied');
  expect(block.indexOf(permissionNeedle)).toBeLessThan(block.indexOf(successNeedle));
}

test.describe('ProductCatalog permission retrofit contract', () => {
  test('ProductCatalogController 9 endpoint 는 page-code/action 1:1 권한을 가진다', () => {
    const controller = read(productCatalogControllerPath);

    expectProtectedMapping(controller, '@GetMapping("/products")', 'products.list', 'VIEW');
    expectProtectedMapping(controller, '@PatchMapping("/products/{modelCode}/usage")', 'products.admin', 'UPDATE');
    expectProtectedMapping(controller, '@GetMapping("/products/{modelCode}/specs")', 'products.list', 'VIEW');
    expectProtectedMapping(controller, '@PostMapping("/products/{modelCode}/specs")', 'products.admin', 'CREATE');
    expectProtectedMapping(controller, '@PatchMapping("/products/{modelCode}/specs/{specId}")', 'products.admin', 'UPDATE');
    expectProtectedMapping(controller, '@DeleteMapping("/products/{modelCode}/specs/{specId}")', 'products.admin', 'DELETE');
    expectProtectedMapping(controller, '@PatchMapping("/products/{modelCode}/specs/reorder")', 'products.admin', 'UPDATE');
    expectProtectedMapping(controller, '@GetMapping("/spec-key-templates")', 'products.list', 'VIEW');
    expectProtectedMapping(controller, '@PostMapping("/spec-key-templates/{templateId}/apply-to-existing")', 'products.admin', 'CREATE');

    expect(controller).toContain('@RequestHeader(value = CALLER_HEADER, required = false) String callerHeader');
    expect(controller).toContain('specService.deleteSpec(modelCode, specId, callerHeader == null ? "system" : callerHeader)');
  });

  test('CategoryController tree 는 products.list VIEW 로 보호된다', () => {
    const controller = read(categoryControllerPath);

    expectProtectedMapping(controller, '@GetMapping', 'products.list', 'VIEW');
  });

  test('gateway catalog/usage no-strip route 는 strip route 보다 먼저 선언된다', () => {
    const gateway = read(gatewayPath);
    const catalog = routeBlock(gateway, 'product-catalog-v1');
    const usage = routeBlock(gateway, 'product-usage-v1');

    expect(gateway.indexOf('- id: product-catalog-v1')).toBeLessThan(gateway.indexOf('- id: product-service-v1'));
    expect(gateway.indexOf('- id: product-usage-v1')).toBeLessThan(gateway.indexOf('- id: product-service-v1'));
    expect(catalog).toContain('Path=/api/v1/products');
    expect(catalog).not.toContain('/**');
    expect(catalog).not.toContain('StripPrefix');
    expect(usage).toContain('Path=/api/v1/products/*/usage');
    expect(usage).not.toContain('StripPrefix');
  });

  test('desktop mock 은 catalog 조회와 spec mutation 의 200/403 계약을 가진다', () => {
    const mock = read(desktopMockPath);

    expect(mock).toContain("return mockError(403, 'FORBIDDEN'");
    expect(mock).toContain('/api/v1/spec-key-templates');

    expectMockPermissionFlow(
      sourceBlock(mock, 'const productCategoryTreeMatch = url.match', 'const productUsageMatch'),
      'products.list',
      'view',
      'return envelope(MOCK_PRODUCT_CATEGORIES)',
    );
    expect(sourceBlock(mock, 'const productCategoryTreeMatch = url.match', 'const productUsageMatch'))
      .toContain('url.match(/\\/api\\/products\\/categories');
    expectMockPermissionFlow(
      sourceBlock(
        mock,
        "if (method === 'GET' && (url.endsWith('/api/v1/products')",
        "if (method === 'GET' && (url.endsWith('/api/products')",
      ),
      'products.list',
      'view',
      'return {',
    );
    expectMockPermissionFlow(
      sourceBlock(mock, 'const productSpecsMatch = url.match', 'const specTemplateApplyMatch'),
      'products.admin',
      'create',
      'const created = {',
    );
    expectMockPermissionFlow(
      sourceBlock(mock, 'const productSpecItemMatch = url.match', 'const productSpecsMatch'),
      'products.admin',
      'update',
      'return edited',
    );
    expectMockPermissionFlow(
      sourceBlock(mock, 'const productSpecItemMatch = url.match', 'const productSpecsMatch'),
      'products.admin',
      'delete',
      'return envelope(null)',
    );
    expectMockPermissionFlow(
      sourceBlock(
        mock,
        "if (method === 'GET' && url.includes('/api/v1/material-prices')",
        "if (method === 'GET' && url.includes('/api/v1/odu-recommendations')",
      ),
      'products.list',
      'view',
      'return MOCK_MATERIAL_PRICE_ROWS',
    );
    expectMockPermissionFlow(
      sourceBlock(
        mock,
        "if (method === 'GET' && url.includes('/api/v1/odu-recommendations')",
        "if (method === 'GET' && url.includes('/api/v1/branch-pipes')",
      ),
      'products.list',
      'view',
      'return oduRows',
    );
    expectMockPermissionFlow(
      sourceBlock(
        mock,
        "if (method === 'GET' && url.includes('/api/v1/branch-pipes')",
        '// GET /slips/lookup-product?modelName=',
      ),
      'products.list',
      'view',
      'return branchRows',
    );
  });
});
