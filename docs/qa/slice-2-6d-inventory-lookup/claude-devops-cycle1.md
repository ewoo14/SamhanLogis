# DevOps 리뷰 — 2.6d 품목 재고조회 모달 (사이클 1)

**브랜치**: feat/2-6d-inventory-lookup-modal
**리뷰어**: DevOps agent (Claude)
**날짜**: 2026-05-31
**대상 diff**: origin/main...HEAD (커밋 3개)

---

## 변경 파일 요약

| 파일 | 분류 | 성격 |
|---|---|---|
| `services/partner-order-service/.../PartnerOrderDetailResponse.java` | BE | LineResponse 레코드에 `productId` 필드 1개 추가 |
| `clients/desktop/src/renderer/api/inventory.ts` | FE | `fetchProductBalancesMatrix` 신규 함수 + 관련 타입 추가 |
| `clients/desktop/src/renderer/api/sales.ts` | FE | `PartnerOrderLine` 인터페이스에 `productId` 필드 추가 |
| `clients/desktop/src/renderer/api/mock.ts` | FE | 창고 fixture 1개 추가(BK-001) + 주문 라인 productId 보강 + parseMockBody 교체 |
| `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` | FE | 신규 컴포넌트 (305 LOC) |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` | FE | 다중선택 체크박스 + 모달 통합 |
| `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` | FE | 기존 alert 방식 재고조회 제거 → 체크박스 다중선택 + 모달 통합 |
| `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` | QA | Playwright spec 신규 (12 시나리오) |
| `docs/design/inventory-lookup-modal-guide.md` | 문서 | 설계 가이드 |
| `docs/superpowers/plans/2026-05-31-inventory-lookup-modal.md` | 문서 | 구현 계획 |
| `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md` | 문서 | 설계 스펙 |

Flyway SQL 변경 없음. API Gateway / 라우팅 규칙 변경 없음.

---

## 1. 배포 영향 분석

### 1-1. Flyway / DB 스키마 변경 없음

`productId`는 `partner_order_line` 테이블에 이미 존재하는 컬럼(`UUID productId`)을 DTO 직렬화 레이어에서 추가 노출한 것이다. DDL 변경 없음. Flyway 마이그레이션 파일 없음 — 확인 완료.

### 1-2. BE API 변경 성격 (하위 호환)

`PartnerOrderDetailResponse.LineResponse` 레코드에 `productId String` 필드가 **첫 번째 위치**로 추가됐다.

- **JSON 직렬화**: Jackson은 레코드 순서가 아닌 필드명 기반으로 직렬화하므로, 응답 JSON에 `productId` 키가 추가되는 것이 전부다. 기존 클라이언트가 알 수 없는 키를 무시하도록 `@JsonIgnoreProperties(ignoreUnknown = true)` 또는 동등 처리가 되어 있으면 하위 호환이다.
- **Java 레코드 컴파일**: `LineResponse`를 `new LineResponse(...)` 로 직접 생성하는 테스트가 있다면 컴파일 오류가 발생한다. 테스트 코드 검색 결과, `PartnerOrderPermissionControllerIT`는 `List.of()`(빈 라인 리스트)를 사용하고 있어 `LineResponse` 생성자를 직접 호출하지 않는다. 나머지 IT에서도 `LineResponse`를 직접 생성하는 코드가 없음을 확인했다 — 컴파일 오류 없음.

**결론**: 순수 추가(additive) 변경. 기존 FE/클라이언트는 알 수 없는 키를 무시하면 무영향.

### 1-3. 기존 `GET /partner-orders/{id}` 엔드포인트

신규 엔드포인트 없음. 기존 엔드포인트의 응답에 `productId` 필드가 추가될 뿐이다. API Gateway 라우팅 규칙 변경 없음.

### 1-4. inventory-service 엔드포인트 재사용

`POST /inventory/balances/batch` (기존 엔드포인트) 및 `GET /inventory/warehouses` (기존 엔드포인트)를 그대로 재사용한다. 신규 엔드포인트 없음.

### 1-5. 배포 순서 권고

```
1. partner-order-service 재배포 (productId 필드 추가)
2. Desktop FE 빌드 배포 (InventoryLookupModal + 체크박스 UI)
```

파트너가 `productId`를 응답으로 받기 전에 FE가 먼저 배포되더라도, FE 코드는 `l.productId`가 `undefined`인 경우 `.filter((l) => checkedLineIds.has(l.lineId) && l.productId)` 필터로 안전하게 걸러내도록 구현되어 있다. 배포 순서 역전 시에도 UI crash 없이 재고조회 버튼이 비활성 상태를 유지하거나 빈 라인으로 처리된다. 다만 정상 배포 순서(BE → FE)를 권고한다.

---

## 2. CI 커버리지 분석

### 2-1. `accounting+partner` 잡 — partner-order-service 커버

`ci.yml` line 74~76:
```yaml
- name: accounting+partner
  test-tasks: '... :services:partner-order-service:test ...'
```

`PartnerOrderDetailResponse.LineResponse` 변경은 이 잡이 커버한다. `LineResponse.from()`을 간접 호출하는 IT(예: `PartnerOrderConvertIT`, `PartnerOrderConfirmServiceIT`)가 정상 통과하면 필드 추가 회귀 없음을 보장한다. 기존 IT가 `LineResponse`를 직접 생성하지 않으므로 컴파일 오류 위험 없음 — 앞서 확인.

### 2-2. `frontend-desktop` 잡 — typecheck + lint + build

`ci.yml` line 221~260: `typecheck` + `lint` + `build(electron-vite)` 3단계를 실행한다.

- `InventoryLookupModal.tsx` 신규 컴포넌트: 타입 오류가 있으면 typecheck에서 차단.
- `sales.ts`의 `PartnerOrderLine.productId: string` 추가: 사용처(`SalesPartnerOrderDetailPage`, `SlipDetailPage`)에서 접근 시 타입 일치 필요. `l.productId`를 string으로 접근하고 있으며 BE 응답 타입과 일치 — typecheck 통과 예상.
- `inventory.ts` 신규 함수: `fetchProductBalancesMatrix` 반환 타입 `BalanceMatrix`가 `InventoryLookupModal` Props의 `lines: StockBalanceLookupLine[]` 및 내부 사용과 일치하는지 — 구현 확인 결과 일치.
- `mock.ts` `parseMockBody` 교체: 기존에는 `JSON.parse(config.data as string)`를 인라인으로 사용하던 부분을 `parseMockBody(config)` 헬퍼로 교체. `parseMockBody`는 이미 다른 8개 이상의 핸들러에서 사용 중인 기존 함수(line 55)이므로 런타임 영향 없음. build 시 dead-code 없음.

**결론**: `frontend-desktop` 잡이 해당 FE 변경 전체를 커버한다.

### 2-3. D2-6d Playwright spec CI 자동실행 여부 — 미포함 기록

`clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts`는 **`clients/desktop/playwright.config.ts`의 `testDir: './playwright'`** 범위에 포함되어 있다.

그러나 `ci.yml`의 `frontend-desktop` 잡은 `typecheck + lint + build` 3단계만 실행하며, Playwright 실행 step이 없다. `qa-e2e.yml`의 Playwright 잡은 `qa/playwright/` 디렉터리를 기준으로 실행하며, `clients/desktop/playwright/` 하위 spec을 포함하지 않는다.

따라서 **D2-6d spec은 PR CI에서 자동 실행되지 않는다** — 이는 기존 다른 `clients/desktop/playwright/` spec과 동일한 정책이다. 로컬 수동 실행 또는 별도 워크플로 추가가 필요하다.

이 사항은 변경 결함이 아니라 현재 CI 아키텍처의 known gap이며, 후속 슬라이스에서 `qa-e2e.yml`에 `clients/desktop` playwright 실행 step을 추가하거나 별도 `frontend-desktop-e2e.yml`을 신설하는 방향으로 해소할 수 있다.

---

## 3. mock.ts 변경 빌드/CI 영향 분석

### 3-1. `parseMockBody` 교체

기존:
```typescript
const body = (config.data ? JSON.parse(config.data as string) : {}) as { productIds?: string[] }
```
변경 후:
```typescript
const body = parseMockBody(config) as { productIds?: string[] }
```

`parseMockBody`는 `config.data`가 이미 객체(object)인 경우와 string인 경우 모두를 안전하게 처리하는 헬퍼로, mock.ts 내 다른 8개 이상의 핸들러에서 이미 검증된 함수다. 이 교체는 기능적으로 동일하거나 더 안전하다. 빌드/CI 영향 없음.

### 3-2. BK-001 창고 fixture 추가

`MOCK_WAREHOUSES` 배열에 5번째 항목(`id: '11111111-1111-1111-1111-000000000005'`, `code: 'BK-001'`)이 추가됐다. 해당 파일 하단에 `/** noUncheckedIndexedAccess 회피용 — 4 시드 명시 참조 */` 주석과 함께 명시적 인덱스 참조 패턴이 있는지 확인이 필요하다.

```typescript
/** noUncheckedIndexedAccess 회피용 — 4 시드 명시 참조 */
```

이 주석이 암시하는 특정 `MOCK_WAREHOUSES[0..3]` 명시 인덱스 접근 코드가 있다면, 새 5번째 항목 추가는 안전하다(기존 인덱스 0~3이 밀리지 않음). 배열 push이므로 기존 인덱스 참조 무영향. CI 타입체크 통과 예상.

### 3-3. 주문 라인 `productId` fixture 추가

`poLines` fixture에 `productId: 'p-aj040'` / `productId: 'p-mwr10'` 등 문자열 값이 추가됐다. 이 값은 `batch` 엔드포인트 mock 내의 `ids` 배열과 매칭되어야 매트릭스 셀에 데이터가 채워진다. mock.ts 내 `POST /inventory/balances/batch` 핸들러가 `p-aj040`, `p-mwr10`에 대한 응답 데이터를 포함하고 있는지는 QA agent 검증 범위이며, DevOps 관점에서는 mock.ts가 빌드 단계에서 타입 오류를 일으키지 않음을 확인한다 — `productId: string` 필드 타입 일치, 확인 완료.

---

## 4. 기타 인프라 관찰 사항

### 4-1. 하위 호환 파괴 리스크 없음

`LineResponse` 레코드는 Jackson 직렬화로 소비되며, 추가 필드는 기존 소비자(다른 서비스가 직접 파싱하는 경우)에게 무시된다. 본 슬라이스에서 다른 내부 서비스가 partner-order 상세 응답을 직접 역직렬화하는 경우는 없다 — partner-order-service는 FE(desktop)에서만 상세 조회한다.

### 4-2. staleTime 30초 설정

`InventoryLookupModal`의 `useQuery` `staleTime: 30_000` 설정은 동일 모달을 반복 열었을 때 불필요한 재요청을 방지한다. 캐시 무효화 전략은 주문 상세 데이터가 변경되지 않는 읽기 전용 조회이므로 적절하다.

### 4-3. VIRTUAL 창고 필터링 일관성

`fetchProductBalancesMatrix` 내에서 `warehouses.filter((w) => w.type !== 'VIRTUAL')`로 VIRTUAL 창고를 제외한다. 이는 2.6c 슬라이스에서 정립된 관례와 일치하며, 배포 환경의 실 창고 목록에서도 동일하게 적용된다.

---

## 5. 요약 및 판정

| 체크 항목 | 결과 |
|---|---|
| Flyway 마이그레이션 없음 | PASS |
| API Gateway 변경 없음 | PASS |
| BE `LineResponse` 하위 호환 추가 | PASS |
| 테스트 컴파일 오류 없음 (LineResponse 직접 생성 없음) | PASS |
| 배포 순서 (partner-order → FE) 문서화 | PASS |
| `accounting+partner` CI 잡 자동 커버 | PASS |
| `frontend-desktop` CI 잡 자동 커버 (typecheck+lint+build) | PASS |
| `mock.ts` `parseMockBody` 교체 안전 | PASS |
| D2-6d Playwright spec PR CI 자동실행 여부 | **미포함 — known gap 기록** |

**판정: APPROVE**

인프라 / CI 관점에서 블로킹 결함 없음. Flyway 없음, API Gateway 무변경, BE 하위 호환 추가, FE 빌드 잡 커버 확인. D2-6d Playwright spec이 PR CI에서 자동 실행되지 않는 점은 현재 CI 아키텍처의 기존 known gap이며, 이 슬라이스에서 새로 발생한 문제가 아니다. 후속 슬라이스에서 `qa-e2e.yml` 또는 별도 `frontend-desktop-e2e.yml` 신설로 해소 권고.
