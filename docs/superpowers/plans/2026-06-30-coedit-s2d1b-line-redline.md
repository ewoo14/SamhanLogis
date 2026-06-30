# 코-에디팅 S2d-1b 라인 셀 인라인 레드라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 임계 통과 전표 조회 시 라인(품목) 셀에도 anchor 後 누적 레드라인을 인라인 표시한다(품목명·모델명·규격·수량·단가·합계), productId 안정키 + VAT포함 표시값 정합.

**Architecture:** 헤더 셀은 S2d-1 `fieldChanges` 경로(fieldPath=`header.*`) 유지. 라인 셀은 분리해 anchor 後 revision 스냅샷에서 **productId(+등장순서) 기준 체인**을 계산하고, 최신 revision의 행 인덱스로 `lines[i].field` fieldPath를 emit한다. 단가/합계 VAT포함값은 `SlipSnapshot.Line`에 추가한 VAT 필드로 계산(과거 스냅샷은 VAT제외 fallback).

**Tech Stack:** Java 17 / Spring Boot 3 (slip-service), React + TypeScript (clients/desktop), Jackson(JSON 스냅샷), Testcontainers Postgres, vitest.

## Global Constraints
- 브랜치 `feat/coedit-s2d1b-line-redline` (base=main). 커밋=Claude 대행(Codex는 파일만).
- `SlipSnapshot.Line` 변경은 **NON_NULL JSON additive** — Flyway 마이그레이션 불요(slip_revisions snapshot은 JSON 컬럼, 과거 JSON 역직렬화 시 새 필드 NULL).
- UUID(productId/actorId) 응답 비노출 — S2d-1 `formatValue`/actor resolve 패턴 유지.
- 한국어 Javadoc·커밋·PR. BaseEntity 7 audit(해당 시).
- 가짜 데이터 금지 — 과거 스냅샷 VAT포함 NULL은 ×1.1 추정 금지, VAT제외값 그대로 fallback.
- 라이브 QA 실 캡처(vite 직접서빙 데모 우회: `:5174` web config mock-mode + `redline-demo` 페이지).

---

### Task 1: SlipSnapshot.Line VAT포함 필드 확장 + 캡처

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/domain/SlipSnapshot.java:94-103` (record Line)
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1898-1909` (toSnapshot 캡처)
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipSnapshotLineTest.java` (신규)

**Interfaces:**
- Produces: `SlipSnapshot.Line`에 `BigDecimal unitPriceWithVat, BigDecimal vatAmount, BigDecimal supplyAmount` 추가(record 끝). `Slip.toSnapshot()`이 `line.getUnitPriceWithVat()/getVatAmount()/getSupplyAmount()`로 populate.

- [ ] **Step 1: 실패 테스트 — toSnapshot이 VAT포함 필드 populate**

```java
// SlipSnapshotLineTest: Slip에 unitPriceWithVat/vatAmount/supplyAmount 보유 라인 1건 추가 후 toSnapshot()
@Test
void toSnapshotCapturesVatFields() {
    Slip slip = SlipTestFixtures.outboundWithLine(/* unitPrice=10000, unitPriceWithVat=11000, supplyAmount=10000, vatAmount=1000 */);
    SlipSnapshot snap = slip.toSnapshot();
    SlipSnapshot.Line line = snap.lines().get(0);
    assertThat(line.unitPriceWithVat()).isEqualByComparingTo("11000");
    assertThat(line.vatAmount()).isEqualByComparingTo("1000");
    assertThat(line.supplyAmount()).isEqualByComparingTo("10000");
}
```

- [ ] **Step 2: 과거 JSON 역직렬화 NULL 테스트**

```java
@Test
void legacyJsonWithoutVatFieldsDeserializesNull() throws Exception {
    String legacy = "{\"productId\":\"%s\",\"productName\":\"P\",\"quantity\":1,\"unitPrice\":10000,\"lineTotal\":10000}".formatted(UUID.randomUUID());
    SlipSnapshot.Line line = objectMapper.readValue(legacy, SlipSnapshot.Line.class);
    assertThat(line.unitPriceWithVat()).isNull();
    assertThat(line.vatAmount()).isNull();
}
```

- [ ] **Step 3: 테스트 실패 확인** — `gradlew :services:slip-service:test --tests "*SlipSnapshotLineTest*"` → FAIL(컴파일/필드 없음)

- [ ] **Step 4: record 확장 + 캡처 구현**

```java
// SlipSnapshot.java record Line — 끝에 3필드 추가
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Line(
        UUID productId, String productName, String modelName, String specification,
        int quantity, BigDecimal unitPrice, BigDecimal lineTotal, String note,
        BigDecimal unitPriceWithVat, BigDecimal vatAmount, BigDecimal supplyAmount) {
}
```
```java
// Slip.java toSnapshot() new SlipSnapshot.Line(...) — 인자 3개 추가
.map(line -> new SlipSnapshot.Line(
        line.getProductId(), line.getProductName(), line.getModelName(),
        line.getSpecification(), line.getQuantity(), line.getUnitPrice(),
        line.getLineTotal(), line.getNote(),
        line.getUnitPriceWithVat(), line.getVatAmount(), line.getSupplyAmount()))
```
> ⚠️ `SlipSnapshot.Line`을 생성하는 **다른 호출처** grep 점검(`new SlipSnapshot.Line(`) — 복원 테스트/픽스처 등 전부 인자 추가(컴파일 가드).

- [ ] **Step 5: 테스트 통과 확인** — `gradlew :services:slip-service:test --tests "*SlipSnapshotLineTest*"` → PASS

- [ ] **Step 6: 커밋** — `feat(collab): S2d-1b Task1 — SlipSnapshot.Line VAT포함 필드(unitPriceWithVat·vatAmount·supplyAmount) 확장 + 캡처`

---

### Task 2: SlipRedlineService 라인 셀 redline 계산 (productId 안정키 + VAT 표시값)

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/service/SlipRedlineService.java` (computeRedline에 라인 처리 추가)
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/revision/service/SlipRedlineServiceTest.java` (라인 케이스 추가)

**Interfaces:**
- Consumes: anchor 後 revision들의 `SlipSnapshot.lines()`(Task1 확장 필드), S2d-1 `FieldBuilder`/`Layer`/actor resolve.
- Produces: `SlipRedlineResponse.fields`에 라인 셀 `FieldRedline`(fieldPath=`lines[{최신행인덱스}].{field}`) 추가. 라인 표시값 helper `lineDisplay(field, Line)`.

**라인 처리 알고리즘(헤더 fieldChanges 루프 뒤):**
1. anchor 後 revision 오름차순 리스트 `revs`. `revs.size() < 2`면 라인 처리 skip.
2. 최신 revision `latest = revs.get(last)`. `latest.lines()`를 순회(curIdx, curLine).
3. `pid = curLine.productId()`; `pid == null`이면 skip(매칭 불가). curLine의 **등장순서 k** = latest.lines() 중 index ≤ curIdx에서 같은 pid 개수 - 1.
4. 추적 필드 `LINE_REDLINE_FIELDS`(modelName·productName·specification·quantity·unitPrice[단가]·lineTotal[합계]) 각각:
   - `revs` 순회하며 각 rev에서 pid의 **k번째 등장 라인**(`nthByProductId(rev.lines(), pid, k)`)을 찾아 표시값 `lineDisplay(field, line)` 계산.
   - rev에 해당 라인 없으면 그 rev는 skip(체인에서 제외).
   - 첫 값=base layer(actor null), 이후 직전과 다르면 변경 layer(rev actor) 추가.
   - layers.size() ≥ 2면 `fields.add(new FieldRedline("lines[" + curIdx + "]." + field.fieldName(), field.label(), layers))`.

```java
// 표시값 helper — FE slipLineAmounts 대칭. 과거(NULL) = VAT제외 fallback.
private static String lineDisplay(LineRedlineField field, SlipSnapshot.Line line) {
    return switch (field) {
        case MODEL_NAME -> line.modelName();
        case PRODUCT_NAME -> line.productName();
        case SPECIFICATION -> line.specification();
        case QUANTITY -> String.valueOf(line.quantity());
        case UNIT_PRICE -> plain(line.unitPriceWithVat() != null ? line.unitPriceWithVat() : line.unitPrice());
        case LINE_TOTAL -> {
            BigDecimal supply = line.supplyAmount() != null ? line.supplyAmount() : line.lineTotal();
            BigDecimal vat = line.vatAmount() != null ? line.vatAmount()
                    : (supply == null ? null : supply.multiply(new BigDecimal("0.1")).setScale(0, RoundingMode.HALF_UP));
            yield (supply == null) ? null : plain(supply.add(vat == null ? BigDecimal.ZERO : vat));
        }
    };
}
private static String plain(BigDecimal v) { return v == null ? null : v.stripTrailingZeros().toPlainString(); }

// k번째 등장 라인 매칭
private static SlipSnapshot.Line nthByProductId(List<SlipSnapshot.Line> lines, UUID pid, int k) {
    int seen = 0;
    for (SlipSnapshot.Line l : lines) {
        if (pid.equals(l.productId())) { if (seen == k) return l; seen++; }
    }
    return null;
}
```
> `LINE_REDLINE_FIELDS`/`LineRedlineField`(enum)을 SlipRedlineService 내부에 정의. `formatValue`(null/empty→'비움')는 S2d-1 그대로 적용. base layer actor=null로 default 색 오염 차단(S2d-1 동일).

- [ ] **Step 1: 실패 테스트 — 라인 단가 VAT포함 누적**

```java
@Test
void computeRedlineAccumulatesLineUnitPriceWithVat() {
    // anchor 後 rev2(단가 11000 VAT포함)→rev3(단가 13200) 스냅샷 fixture
    SlipRedlineResponse res = service.computeRedline(slipId);
    FieldRedline price = res.fields().stream().filter(f -> f.fieldPath().equals("lines[0].unitPrice")).findFirst().orElseThrow();
    assertThat(price.layers()).extracting(Layer::value).containsExactly("11000", "13200");
}
```

- [ ] **Step 2: 실패 테스트 — 라인 재정렬 productId 체인 보존(S2d BLOCKING 재현 차단)**

```java
@Test
void lineRedlineFollowsProductIdAcrossReorder() {
    // anchor: [A]; rev: A.qty 5→10; 이후 B를 index0 삽입(A→index1). 최신=[B(idx0), A(idx1)]
    SlipRedlineResponse res = service.computeRedline(slipId);
    // A의 수량 체인은 A의 현재 인덱스(1)에 귀속, 값 [5,10] — B 값 혼입 없음
    FieldRedline aQty = res.fields().stream().filter(f -> f.fieldPath().equals("lines[1].quantity")).findFirst().orElseThrow();
    assertThat(aQty.layers()).extracting(Layer::value).containsExactly("5", "10");
    // index0(B)에는 A의 5→10 이력 혼입 없음
    assertThat(res.fields()).noneMatch(f -> f.fieldPath().equals("lines[0].quantity") && f.layers().stream().anyMatch(l -> "5".equals(l.value())));
}
```

- [ ] **Step 3: 실패 테스트 — 과거 NULL VAT 필드 fallback + layers≥2 필터**

```java
@Test
void legacySnapshotFallsBackToVatExclusiveAndFiltersSingleLayer() {
    // rev2(VAT포함 필드 NULL, unitPrice 10000)→rev3(unitPrice 10000 무변경): layers 1개 → 미포함
    SlipRedlineResponse res = service.computeRedline(slipId);
    assertThat(res.fields()).noneMatch(f -> f.fieldPath().startsWith("lines[") && f.fieldPath().endsWith(".unitPrice"));
}
```

- [ ] **Step 4: 테스트 실패 확인** — `gradlew :services:slip-service:test --tests "*SlipRedlineServiceTest*"` → FAIL

- [ ] **Step 5: 라인 처리 구현** (위 알고리즘 + helper)

- [ ] **Step 6: 테스트 통과 확인** — `gradlew :services:slip-service:test --tests "*SlipRedlineServiceTest*"` → PASS

- [ ] **Step 7: 커밋** — `feat(collab): S2d-1b Task2 — SlipRedlineService 라인 셀 productId 안정키 redline + VAT포함 표시값(과거 VAT제외 fallback)`

---

### Task 3: SlipRedlineIT — 라인 셀 실 DB 검증

**Files:**
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipRedlineIT.java`

**Interfaces:**
- Consumes: 실 Postgres(Testcontainers), OUTBOUND inspect anchor(S2d-1), Task2 라인 redline.

- [ ] **Step 1: 실패 IT — OUTBOUND inspect 後 라인 단가/수량 redline + UUID 비노출**

```java
@Test
void outboundInspectThenLineEditRendersLineRedlineWithoutUuid() throws Exception {
    // OUTBOUND 전표 생성→inspect(COMPLETED, anchor)→PUT으로 라인 단가/수량 수정 2회
    // GET /slips/{id}/redline
    String body = mvc.perform(get("/slips/{id}/redline", slipId).headers(masterHeaders()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    assertThat(body).contains("lines[0].unitPrice");
    assertThat(body).doesNotContain(productId.toString());  // UUID 비노출
}
```

- [ ] **Step 2: IT 실패 확인** — `gradlew :services:slip-service:test --tests "*SlipRedlineIT*"` (Windows skip 시 CI Linux 위임 + fresh PG probe로 보강)

- [ ] **Step 3: IT 통과(또는 skip+probe)** + **Step 4: 커밋** — `test(collab): S2d-1b Task3 — SlipRedlineIT 라인 셀 실DB(getContentAsString UTF-8)`

> `getContentAsString(StandardCharsets.UTF_8)` 필수(한글 mojibake false-RED 방지, [[feedback_mockmvc_getcontentasstring_charset]]).

---

### Task 4: FE — RedlineCell format prop + SlipDetailPage 라인 셀 재배선 + mock

**Files:**
- Modify: `clients/desktop/src/renderer/components/audit/RedlineCell.tsx` (format prop)
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` (renderRedlineCell 3rd arg + 라인 셀 6종 + 모바일 재배선)
- Modify: `clients/desktop/src/renderer/api/mock.ts` (redline 라인 fields)
- Test: `clients/desktop/src/renderer/components/audit/RedlineCell.test.tsx`, `clients/desktop/src/renderer/api/mock.test.ts`

**Interfaces:**
- Consumes: BE redline(라인 fieldPath `lines[i].unitPrice`/`lineTotal` 값은 이미 VAT포함, `quantity`는 정수 문자열).
- Produces: `RedlineCellProps.format?: (value: string) => string`.

- [ ] **Step 1: RedlineCell format prop 테스트**

```tsx
it('format prop으로 각 layer 값을 포맷한다(수량 천단위)', () => {
  render(<RedlineCell format={(v) => Number(v).toLocaleString()} layers={[
    { value: '1000', actorName: null, actorColor: null, changedAt: null },
    { value: '12000', actorName: '김영업', actorColor: '#DB2777', changedAt: '2026-06-30T09:15:00' },
  ]} />)
  expect(screen.getByTestId('redline-cell-current').textContent).toContain('12,000')
  expect(screen.getByTestId('redline-cell-struck').textContent).toContain('1,000')
})
```

- [ ] **Step 2: 테스트 실패 확인** — `node_modules/.bin/vitest run src/renderer/components/audit/RedlineCell.test.tsx` → FAIL

- [ ] **Step 3: RedlineCell format prop 구현**

```tsx
export interface RedlineCellProps { layers: SlipRedlineLayer[]; format?: (value: string) => string }
function formatValue(value: string | null | undefined, format?: (v: string) => string): string {
  if (value == null || value.trim() === '') return '비움'
  return format ? format(value) : value
}
export function RedlineCell({ layers, format }: RedlineCellProps) { /* formatValue(x, format) 3곳 */ }
```

- [ ] **Step 4: SlipDetailPage 라인 셀 재배선** (renderRedlineCell 3rd arg `format?` 추가 → `<RedlineCell layers={field.layers} format={format} />`)

```tsx
const formatNumber = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() : v }
// 라인 셀(desktop):
<td className="col-model">{renderRedlineCell(`lines[${idx}].modelName`, l.modelName ?? '-')}</td>
<td className="col-product">{renderRedlineCell(`lines[${idx}].productName`, l.productName ?? '-')}</td>
<td className="col-spec">{renderRedlineCell(`lines[${idx}].specification`, l.specification ?? '-')}</td>
<td className="col-qty">{renderRedlineCell(`lines[${idx}].quantity`, l.quantity.toLocaleString(), formatNumber)}</td>
<td className="col-price">{renderRedlineCell(`lines[${idx}].unitPrice`, unitWithVatVal.toLocaleString(), formatNumber)}</td>
<td className="col-supply">{supplyVal.toLocaleString()}</td>
<td className="col-vat">{vatVal.toLocaleString()}</td>
<td className="col-total">{renderRedlineCell(`lines[${idx}].lineTotal`, totalInclVal.toLocaleString(), formatNumber)}</td>
// 모바일 productName 동일 재배선
```

- [ ] **Step 5: mock redline 라인 fields 추가** (slip-006/007 redline에 `lines[0].quantity`·`lines[0].unitPrice`[VAT포함값] fields 복원)

- [ ] **Step 6: mock.test 라인 redline 단언 추가** + 전체 vitest

```tsx
it('redline에 라인 셀 fields(VAT포함 단가)가 포함된다', () => {
  const r = resolveMock({ method: 'GET', url: '/api/v1/slips/slip-006/redline' }) as MockEnvelope<{ fields: Array<{ fieldPath: string }> }>
  expect(r.data.fields.some((f) => f.fieldPath === 'lines[0].unitPrice')).toBe(true)
})
```

- [ ] **Step 7: 테스트 통과 + typecheck** — `npm run typecheck && node_modules/.bin/vitest run src/renderer/components/audit/RedlineCell.test.tsx src/renderer/api/mock.test.ts` → PASS

- [ ] **Step 8: 커밋** — `feat(collab): S2d-1b Task4 — FE RedlineCell format prop + SlipDetailPage 라인 셀 6종 재배선 + mock 라인 redline`

---

### Task 5: 문서 동기화 + 라이브 QA

**Files:**
- Create: `docs/dev-reports/2026-06-30-coedit-s2d1b-line-redline.md`
- Modify: `migration/decisions/DECISIONS.md`(D-COEDIT-S2D-03 라인 셀 = Snapshot 확장 A), `ROADMAP.md`

- [ ] **Step 1: dev-report + DECISIONS(D-COEDIT-S2D-03) + ROADMAP 작성**
- [ ] **Step 2: fresh PG probe** — 과거 slip_revisions snapshot JSON(VAT 필드 無)이 Task1 record로 역직렬화 무오류 확인(임시 DB에 legacy snapshot insert → 서비스 조회).
- [ ] **Step 3: gradlew slip 전체 + vitest 전체 + 실 RedlineCell 캡처**(redline-demo에 라인 행 추가)
- [ ] **Step 4: 커밋** — `docs(collab): S2d-1b dev-report·DECISIONS·ROADMAP 동기화`

---

## Self-Review

**1. Spec coverage:** ①productId 안정키=Task2(nthByProductId+최신인덱스 emit) ✓ ②Snapshot 확장 VAT=Task1+Task2 helper ✓ ③FE 재배선+format=Task4 ✓ ④mock=Task4 ✓ ⑤테스트=Task2/3/4 ✓ ⑥fresh probe=Task5 ✓. 헤더 경로 무변경 명시 ✓.

**2. Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝 실제 코드 포함.

**3. Type consistency:** `SlipSnapshot.Line` 11필드(8+3) 일관 — Task1 정의 ↔ Task2 helper 사용 일치. `format?: (value: string) => string` Task4 정의 ↔ 사용 일치. `lineDisplay`/`nthByProductId`/`LineRedlineField` Task2 내부 일관. fieldPath `lines[{idx}].{field}` BE emit ↔ FE renderRedlineCell 키 일치.

> 비대상: S2d-2(라이브 Yjs), S3(6문서). 워크플로우=조기PR→Codex구현→순차 듀얼리뷰 0수렴→라이브QA→PM종합→CI→squash머지.
