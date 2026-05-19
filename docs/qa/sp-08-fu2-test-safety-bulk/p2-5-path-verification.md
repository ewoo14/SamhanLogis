# P2-5 TaxInvoiceListPage 일괄 발행 path 정합 검증

작성일: 2026-05-19
작성자: FE agent (SP-08-FU2)
브랜치: feat/sp-08-fu2-test-safety-bulk

---

## 1. 검증 범위

| 항목 | 위치 |
|---|---|
| FE 진입 버튼 | `clients/desktop/src/renderer/routes/TaxInvoiceListPage.tsx:185` |
| FE 라우터 등록 | `clients/desktop/src/renderer/routes/index.tsx:856` |
| FE API 클라이언트 | `clients/desktop/src/renderer/api/hometaxExportApi.ts` |
| BE 활성 Controller | `services/accounting-service/.../web/AccountingReportController.java` |
| BE Deprecated Controller | `services/accounting-service/.../web/TaxInvoiceBatchController.java` |

---

## 2. BE endpoint 전수 조사 결과

### 2-A. AccountingReportController (활성 — @RequestMapping 없음, 각 메서드 직접 경로)

| HTTP | BE 실제 경로 | 비고 |
|---|---|---|
| GET | `/accounting/tax-invoice/hometax-export` | BE-A11 legacy 12컬럼 xlsx |
| POST | `/accounting/hometax-export/preview` | 59컬럼 미리보기 |
| GET | `/accounting/hometax-export/{batchId}/split` | 분할 xlsx 다운로드 |
| GET | `/accounting/hometax-export/exclusions` | 제외 거래처 목록 |
| POST | `/accounting/hometax-export/exclusions` | 제외 거래처 등록 |
| DELETE | `/accounting/hometax-export/exclusions/{partnerCode}` | 제외 거래처 삭제 |
| GET | `/accounting/hometax-export/history` | 이력 목록 |
| GET | `/accounting/hometax-export/history/{batchId}` | 이력 단건 |

### 2-B. TaxInvoiceBatchController (전면 Deprecated — `/accounting/tax-invoices/batch` prefix)

모든 endpoint 에 `Deprecation: true` + `Link: <신규경로>; rel="successor-version"` 헤더 부착.
FE 는 이 controller 를 호출하지 않음 — 무관.

---

## 3. FE-BE path 정합 매트릭스

| 탭 | FE 호출 경로 (hometaxExportApi.ts) | BE 활성 경로 | 일치 여부 |
|---|---|---|---|
| Tab 0 (legacy 다운로드) | `GET /accounting/tax-invoice/hometax-export` | `GET /accounting/tax-invoice/hometax-export` | **일치** |
| Tab 1 (미리보기) | `POST /accounting/hometax-export/preview` | `POST /accounting/hometax-export/preview` | **일치** |
| Tab 2 (분할 다운로드) | `GET /accounting/hometax-export/{batchId}/split` | `GET /accounting/hometax-export/{batchId}/split` | **일치** |
| Tab 3 GET (제외 목록) | `GET /accounting/hometax-export/exclusions` | `GET /accounting/hometax-export/exclusions` | **일치** |
| Tab 3 POST (제외 등록) | `POST /accounting/hometax-export/exclusions` | `POST /accounting/hometax-export/exclusions` | **일치** |
| Tab 3 DELETE (제외 삭제) | `DELETE /accounting/hometax-export/exclusions/{partnerCode}` | `DELETE /accounting/hometax-export/exclusions/{partnerCode}` | **일치** |
| Tab 4 (이력 목록) | `GET /accounting/hometax-export/history` | `GET /accounting/hometax-export/history` | **일치** |
| Tab 4 (이력 단건) | `GET /accounting/hometax-export/history/{batchId}` | `GET /accounting/hometax-export/history/{batchId}` | **일치** |

---

## 4. FE 라우팅 정합

| 항목 | 값 | 상태 |
|---|---|---|
| TaxInvoiceListPage 버튼 `navigate` 경로 | `/accounting/hometax-export` | 정상 |
| index.tsx 라우터 `path` | `/accounting/hometax-export` | 등록 완료 |
| 렌더 컴포넌트 | `<HometaxExportPage />` | 정상 |

---

## 5. 결론

**모든 FE-BE 경로 정합 완료 — fix 불필요.**

FE `hometaxExportApi.ts` 의 8개 endpoint 가 BE `AccountingReportController` 의 실제 경로와 100% 일치합니다.
`TaxInvoiceListPage` 의 navigate 경로 `/accounting/hometax-export` 도 라우터에 정확히 등록되어 있습니다.

### 주요 판단 근거

- Tab 0 legacy 경로 (`/accounting/tax-invoice/hometax-export`) 와 Tab 1~4 신규 경로 (`/accounting/hometax-export/...`) 의 prefix 혼재는 **의도된 설계** (PR-E2 하위 호환 보존 + PR #161 신규 endpoint 흡수)이며 BE Controller 에 동일하게 반영되어 있습니다.
- `TaxInvoiceBatchController` (`/accounting/tax-invoices/batch/...`) 는 전면 deprecated 상태이며 FE 가 호출하지 않으므로 영향 없습니다.

---

## 6. TS 컴파일 / lint 상태

변경 파일 없음 — 기존 코드 검증만 수행. 별도 컴파일 실행 불필요.

---

## 7. 회귀 가드 (선택)

아래 spec 시나리오로 path 회귀를 방지할 수 있습니다 (기존 Playwright spec 추가 권장):

```typescript
// qa/playwright/tests/desktop/sp-08-fu2-hometax-path.spec.ts (선택 사항)
test('일괄 발행 버튼 클릭 시 /accounting/hometax-export 로 navigate', async ({ page }) => {
  // TaxInvoiceListPage 진입 후 버튼 클릭 → URL 검증
  await page.click('[data-testid="tax-invoice-batch-button"]')
  await expect(page).toHaveURL(/\/accounting\/hometax-export$/)
})

test('Tab 0 다운로드 API path 정합 검증', async ({ page }) => {
  // Network intercept: GET /accounting/tax-invoice/hometax-export 호출 여부
})
```
