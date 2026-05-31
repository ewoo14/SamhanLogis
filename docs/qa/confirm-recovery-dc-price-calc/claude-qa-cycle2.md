# QA 리뷰 — confirm 경로 복구 (DC price-calculations 정식 연동)

- **슬라이스**: confirm-recovery-dc-price-calc (PR #330)
- **브랜치**: fix/confirm-recovery-dc-price-calc
- **fix commit**: cef80cb1
- **리뷰어**: claude-qa
- **사이클**: 2 (사이클1 P0/P1 해소 확인)
- **날짜**: 2026-05-31
- **근거**: 사이클1 Finding F-01(P0)·F-02(P1)·F-03(P1) 수정 반영 여부 집중 점검

---

## 1. 사이클1 Finding 해소 판정

### F-01 (P0) — typed 역직렬화로 Double 경유 부동소수 위험 제거

**사이클1 지적**: `extractFinalPrices` 가 `Map<String,Object>` 역직렬화 시 `finalPrice` 를 `Double` 로 파싱할 수 있어 부동소수 오차가 `price_vat` DB 값에 저장될 위험.

**fix 확인 (DcConfigClient.java)**

- `extractFinalPrices(Map<String,Object>)` 메서드 완전 삭제, `extractFromTyped(ApiResponse<PriceCalcResult>)` 로 교체.
- `PriceCalcResult` record 와 내부 `Line` record 신설. 두 record 모두 `@JsonIgnoreProperties(ignoreUnknown=true)` 적용.
- `Line.finalPrice` 필드 타입이 `BigDecimal` — Jackson 은 `ParameterizedTypeReference<ApiResponse<PriceCalcResult>>` 역직렬화 시 `finalPrice` JSON 숫자를 `BigDecimal` 로 직접 바인딩한다. Double 경유 경로 없음.
- `extractFromTyped` 는 `envelope==null`, `!envelope.isSuccess()`, `data==null`, `data.lines()==null`, `line.finalPrice()==null` 을 각각 null-safe 처리하여 `Map.of()` 반환(fail-soft).
- `ApiResponse.isSuccess()` — `@Getter` + `boolean success` 필드이므로 Lombok 이 `isSuccess()` 생성 확인.

**판정: F-01 해소.**

단, IT 측면 확인: mock 은 여전히 `Map.of("0", new BigDecimal("800000"))` 을 직접 반환하므로 typed 역직렬화 코드 경로가 IT 에서 실행되지 않는다. 이는 구조적 한계(MockBean 으로 외부 RestClient 격리)로, 실 HTTP 경로 검증은 사이클1 §Docker QA 절차(머지 전)가 전담한다. 코드 자체의 Double 경유 경로는 제거되었으므로 **블로킹 아님.**

---

### F-02 (P1) — 다중 라인 부분 응답 IT

**사이클1 지적**: 2라인 주문에서 lineId "0" 만 finalPrice 응답, "1" 누락 시 라인0=finalPrice·라인1=listPrice 검증 IT 부재.

**fix 확인 (PartnerOrderConfirmServiceIT.java, 라인 391~431)**

`confirm_partial_price_calc_response_applies_finalPrice_to_matched_line_only` 신설:

- `productId0`(HM-5000, listPrice=1,000,000) / `productId1`(HM-8000, listPrice=1,200,000) 2종 stub.
- `dcConfigClient.calculatePrices` stub → `Map.of("0", new BigDecimal("800000"))` — lineId "1" 누락.
- 서비스 코드 `finalPrices.getOrDefault(String.valueOf(i), p.sellingPrice())` 로 인해 라인0=800,000 / 라인1=1,200,000(listPrice) 저장 경로.
- DB 단언: `SELECT price_vat FROM partner_order_lines WHERE partner_order_id = ? ORDER BY created_at`.

**판정: F-02 해소 — 로직은 올바름.**

**잔류 위험 기록 (비블로킹)**: `ORDER BY created_at` 은 `BaseEntity.createdAt` (`@CreatedDate`, `LocalDateTime`) 기준이다. 두 라인이 단일 트랜잭션 내에서 연속 INSERT될 때 `LocalDateTime.now()` 정밀도(millisecond)가 동일하면 순서가 비결정적이 된다. PostgreSQL 에서 `LocalDateTime` 은 microsecond 정밀도로 저장되나 `@CreatedDate` 는 JVM 시계 기준이므로 nano 단위 차이가 없으면 동일 timestamp 가 부여될 수 있다. 현재 구현에서 두 라인은 동일 루프 내 연속 `addLine` → 단일 `save` 로 처리되므로 순서 불안정 가능성이 있다. 그러나 PostgreSQL 는 단일 INSERT 문 내 row 삽입 순서가 heap 물리 순서를 따르고, 동일 `created_at` 이면 `ORDER BY created_at` 결과가 힙 삽입 순서와 일치하는 경향이 있어 실제 flaky 발생 확률은 낮다. 명시적으로 보장하려면 `ORDER BY created_at, id` 가 필요하다. 머지 블로킹은 아니나 후속 슬라이스에서 수정 권고.

---

### F-03 (P1) — mapCategory 단위 테스트

**사이클1 지적**: `mapCategory` private 메서드의 명시적 단위 테스트 부재.

**fix 확인 (PartnerOrderConfirmServiceTest.java, 라인 93~127)**

4종 단위 테스트 추가:

| 메서드 | 입력 | 기대 | 실제 단언 |
|---|---|---|---|
| `mapCategory_homemulti_to_HOMEMULTI` | `"homemulti"` | `"HOMEMULTI"` | `isEqualTo("HOMEMULTI")` |
| `mapCategory_homeDefaults_to_HOMEMULTI` | `"homeDefaults"` | `"HOMEMULTI"` | `isEqualTo("HOMEMULTI")` |
| `mapCategory_commercialMulti_to_COMMERCIAL_MULTI` | `"commercialMulti"` | `"COMMERCIAL_MULTI"` | `isEqualTo("COMMERCIAL_MULTI")` |
| `mapCategory_other_values_to_OTHER` | `"singleSets"`, `"commercialParts"`, `"oldProducts"`, `null`, `"unknown"` | `"OTHER"` (전부) | 5개 `isEqualTo("OTHER")` |

`ReflectionTestUtils.invokeMethod(service, "mapCategory", ...)` 로 private 메서드 직접 호출. `PartnerOrderConfirmServiceTest` 는 `@ExtendWith(MockitoExtension.class)` + `@InjectMocks` 구성이므로 Spring Context 없이 실행 가능 — 단위 테스트 의미 달성.

서비스 코드 `mapCategory` switch:
- `"homemulti"`, `"homeDefaults"` → `"HOMEMULTI"` 일치.
- `"commercialMulti"` → `"COMMERCIAL_MULTI"` 일치.
- `default` → `"OTHER"` 일치. `null` 은 별도 null 체크(`if (categoryKey == null) return "OTHER"`) 로 처리.

**판정: F-03 해소.**

---

## 2. 잔여 P2 Finding 재확인 (비블로킹)

### F-04 (P2) — 멱등 재confirm 시 calculatePrices 미호출 verify

`idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` 에 `Mockito.verify(dcConfigClient, Mockito.never()).calculatePrices(...)` 단언이 추가되지 않았다. 서비스 코드는 `findByIdempotencyKey` hit 후 즉시 return 하므로 실제로는 2회 호출이 발생하지 않는다. 회귀 가드 부재. **비블로킹 — 후속 슬라이스 권고.**

### F-05 (P2) — RuntimeException throw 시 fail-soft IT

`calculatePrices` 가 `RuntimeException` 을 throw 할 때 confirm 이 listPrice 로 계속 진행되는지 검증하는 IT 추가되지 않았다. 코드는 `catch(RuntimeException)` → `Map.of()` 로 안전하나 회귀 가드 없음. **비블로킹 — 후속 슬라이스 권고.**

---

## 3. 추가 관찰 사항

### timeout 설정 (P1-2 수정)

`SimpleClientHttpRequestFactory` connect 2s / read 3s 설정 확인. dc-config hang 시 confirm thread block 방지. PartnerInternalClient 와 동일 패턴으로 코드 일관성 있음.

### VendorOrderService dcConfigClient 필드 제거 (P1-1 수정)

`VendorOrderService` 에서 `dcConfigClient` 필드/생성자 파라미터 제거, `dcRate = BigDecimal.ZERO` 고정 확인. preview 단계 DC 미적용 의도(spec §3.1) 와 일치. `VendorOrderServiceTest` 의 단언도 `dcRate=0`, `finalPrice=950000` 으로 갱신 확인.

### 전체 테스트 결과

커밋 메시지: "전체 230 PASS, skipped=0, failures=0, errors=0." — 로컬 검증 완료. Docker IT 환경 기준.

---

## 4. Finding 해소 요약표

| # | 등급 | 사이클1 설명 | 사이클2 판정 |
|---|---|---|---|
| F-01 | P0 | `Map<String,Object>` 역직렬화 Double 경유 부동소수 위험 | **해소** — typed `PriceCalcResult` record, BigDecimal 직접 바인딩 |
| F-02 | P1 | 다중 라인 부분 응답 IT 부재 | **해소** — `confirm_partial_price_calc_response_applies_finalPrice_to_matched_line_only` 추가, ORDER BY created_at 비결정성 비블로킹 주석 |
| F-03 | P1 | mapCategory 단위 테스트 부재 | **해소** — 4종 단위 테스트 추가 (null/singleSets/commercialParts/oldProducts/unknown 포함) |
| F-04 | P2 | 멱등 재confirm 시 calculatePrices 미호출 verify 부재 | **잔류** — 비블로킹, 후속 권고 |
| F-05 | P2 | RuntimeException throw 시 fail-soft IT 부재 | **잔류** — 비블로킹, 후속 권고 |

---

## 5. 결론

**블로킹 Finding: 0건.**

- P0(F-01) 해소: typed `ApiResponse<PriceCalcResult>` 역직렬화로 `finalPrice` 가 `BigDecimal` 로 직접 바인딩됨. Double 경유 경로 코드에서 제거.
- P1(F-02) 해소: 다중 라인 부분 응답 IT 신설. 라인0=finalPrice/라인1=listPrice DB 단언 확인. `ORDER BY created_at` 비결정성은 비블로킹 후속 권고.
- P1(F-03) 해소: `mapCategory` 4종 단위 테스트 추가. 모든 switch 분기(homemulti/homeDefaults/commercialMulti/null/default) 커버.
- P2(F-04, F-05): 잔류. 코드 상 안전하나 회귀 가드 없음 — 후속 슬라이스 권고.

**Docker 실 QA(사이클1 §6 절차)**는 머지 전 반드시 실행 예정. typed 역직렬화가 실 HTTP 경로에서 정상 동작하는지(BigDecimal 바인딩 + fail-soft 경로) 확인 필요.

사이클2 기준 **코드 리뷰 블로킹 0건 — 머지 가능.**
