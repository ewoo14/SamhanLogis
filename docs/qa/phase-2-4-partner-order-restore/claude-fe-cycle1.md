# FE Code Review — Phase 2.4 Partner Order RESTORE (Claude FE Cycle 1)

**작성일**: 2026-05-30  
**리뷰어**: Claude FE  
**브랜치**: feat/phase-2-4-partner-order-restore (HEAD 9d3bcfd4)  
**리뷰 대상**:
- `clients/desktop/src/renderer/api/partnerOrderRevision.ts`
- `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (변경분)
- `services/partner-order-service/.../revision/web/dto/` (BE 계약 참조)

---

## 종합 판정

**결함 2건 발견 — FE HOLD (수정 후 재검)**

---

## 점검 항목별 결과

### 1. API 계약 정합 (FE 타입 ↔ BE DTO)

**판정: P1 결함 1건**

**[P1] `partnerOrderRevision.ts`:37 — `PartnerOrderRevisionType` union에 BE `DELETE` 누락 위험 없음, 그러나 `createdAt` 직렬화 포맷 미검증**

BE `PartnerOrderRevisionResponse`의 `createdAt` 필드 타입은 `LocalDateTime`이고, FE 타입은 `string`으로 선언되어 있다. 문제는 `partner-order-service`의 `application.yml`에 `spring.jackson.serialization.write-dates-as-timestamps` 설정이 **명시되어 있지 않다**는 점이다.

Spring Boot `JacksonAutoConfiguration` 기본값은 `WRITE_DATES_AS_TIMESTAMPS=true`이므로, 별도 설정 없이 `JavaTimeModule`만 자동 등록될 경우 `LocalDateTime`이 `[2026,5,30,11,0,0]` 배열로 직렬화될 수 있다. 이 경우 `formatLocalDateTime(iso: string)` 함수의 `iso.slice(0, 16)` 호출이 배열 `.toString()` 결과("2026,5,30,11,0,0")를 잘라내어 오작동한다.

테스트의 `PartnerOrderRevisionServiceTest`와 `PartnerOrderSnapshotTest`는 `objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)`를 **수동 설정**하고 있는데, 이는 운영 ObjectMapper에 해당 설정이 없음을 시사한다.

**권장**: `application.yml`에 `spring.jackson.serialization.write-dates-as-timestamps: false` 추가를 BE에 요청하거나, FE의 `formatLocalDateTime`을 `new Date(iso).toLocaleString('ko-KR')` 방식으로 방어적으로 변경.

나머지 필드 정합 결과:
- `revisionNo: number` ↔ `int revisionNo` — 일치
- `revisionType: PartnerOrderRevisionType` ↔ `String revisionType` (enum.name()) — 일치
- `sourceRevisionNo: number | null` ↔ `Integer sourceRevisionNo` — 일치 (nullable 처리 정확)
- `orderNo: string` ↔ `String orderNo` — 일치
- `actorName: string | null` ↔ `String actorName` — 일치 (nullable 처리 정확)
- `actorColor: string | null` ↔ `String actorColor` — 일치
- `changeSummary: PartnerOrderChangeSummary` ↔ `ChangeSummary` — 필드명/타입 1:1 일치
- `PartnerOrderRestoreResponse.order: PartnerOrderDetail` ↔ `PartnerOrderDetailResponse order` — FE `PartnerOrderDetail` 타입이 `sales.ts`에서 임포트되어 사용, 타입 구조는 기존 기능에서 이미 검증됨
- `slipResyncRequired: boolean` ↔ `boolean slipResyncRequired` — 일치
- endpoint 경로: `/api/v1/partner-orders/{id}/revisions`, `/{no}`, `/{no}/restore` — 일치
- `ApiEnvelope<T>` unwrap (`res.data.data`) — 기존 클라이언트 패턴과 동일, 정확

### 2. 복원 가드 일치 (FE ↔ BE 제외목록)

**판정: 일치 (결함 없음)**

BE `PartnerOrder.requireRestorable()`:
```java
if (this.status == CONFIRMING || this.status == CANCELED) throw 409;
```

FE `isRestorableStatus()`:
```ts
return status !== 'CONFIRMING' && status !== 'CANCELED'
```

제외목록 방식이 정확히 일치한다. DRAFT / CONFIRMED는 허용, CONFIRMING / CANCELED는 차단. 향후 ON_HOLD 등 추가 상태도 BE Javadoc의 "허용 기본" 설계와 FE의 "제외목록 방식" 모두 동일하게 처리된다.

### 3. slipResyncRequired: true 시 경고 플래그 읽는 위치

**판정: 정확 (결함 없음)**

`PartnerOrderVersionHistoryPanel.tsx:143`의 `onSuccess` 콜백에서 `result.slipResyncRequired`를 읽어 분기한다. `result`는 `restorePartnerOrderRevision()` 반환값인 `PartnerOrderRestoreResponse`이므로 타입이 정확하다. 경고 토스트 텍스트("연결된 출고전표 재발행이 필요할 수 있습니다.")도 설계와 일치한다.

### 4. invalidate — 복원 성공 시 캐시 무효화

**판정: P1 결함 1건**

복원 성공 시 3개 키를 무효화한다:
- `['partner-order', orderId]` — 상세 조회 (정확)
- `['partner-order-revisions', orderId]` — 버전이력 (정확)
- `['partner-orders', orderId]` — **문제**

`SalesPartnerOrderListPage.tsx:51`의 목록 queryKey는 `['partner-orders', dateFrom, dateTo, partnerId, statusFilter, searchKeyword, 0]`이다. 즉, orderId는 목록 queryKey에 포함되지 않는다. `['partner-orders', orderId]`로 invalidate해도 목록 캐시는 무효화되지 않는다. 이는 `queryKey`가 배열의 prefix 방식으로 매칭되므로, 목록을 무효화하려면 `['partner-orders']` (상위 prefix)로 invalidate해야 한다.

복원이 목록의 상태(status, totalAmount 등)에 영향을 줄 수 있으므로 목록 캐시도 무효화 필요.

**권장**: `['partner-orders', orderId]` → `['partner-orders']`로 변경.

추가로 `['partner-order', id, 'audit-logs']`(수정이력)도 복원 시 새 audit 항목이 생성될 수 있어 무효화 대상에 포함 권장이나, 이는 Minor 수준.

### 5. UUID 비공개 가드

**판정: 정확 (결함 없음)**

- `actorId`는 FE 타입에 포함되지 않음 — BE DTO도 `actorId` 미노출
- `displayActor()` 함수가 UUID 정규식(`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`)으로 방어적 필터링
- `orderNo`는 비즈니스 식별자 ("2026/05/04-1" 형식)
- URL path에만 `orderId` UUID 사용, 화면 텍스트에 미노출
- UUID 비공개 가드 주석이 파일 상단과 함수 단위 모두에 명시됨

### 6. design-system 준수

**판정: 정확 (결함 없음)**

- `Badge`, `Button`, `Card`, `Modal`, `Spinner` 모두 `@samhan/design-system`에서 import
- 자체 신규 컴포넌트 없음
- `native confirm` 미사용 — DS `Modal` 사용 (주석에 "native confirm 금지" 명시)
- `Modal.tsx` `footer` prop 패턴 정확히 준수

### 7. revisionType union exhaustive 배지 매핑

**판정: 정확 (결함 없음)**

`REVISION_TYPE_META` 객체가 `Record<PartnerOrderRevisionType, ...>`으로 선언되어 5개 타입 전부 커버:

| revisionType | label | variant |
|---|---|---|
| CREATE | 생성 | neutral |
| EDIT | 수정 | brand |
| STATUS | 상태변경 | success |
| RESTORE | 복원 | warning |
| DELETE | 삭제 | danger |

BE `PartnerOrderRevisionType` enum(CREATE/EDIT/STATUS/RESTORE/DELETE)과 1:1 일치. TypeScript `Record<PartnerOrderRevisionType, ...>` 타입이 exhaustive 검사를 컴파일 타임에 강제한다.

### 8. testid Playwright 정합, 접근성, 에러 피드백

**판정: 결함 없음, Minor 1건**

**testid 정합**: Playwright spec의 모든 `getByTestId()` 호출이 TSX 컴포넌트의 `data-testid` 속성과 1:1 대응. 동적 testid(`partner-order-version-history-row-{revisionNo}`, `partner-order-version-history-restore-button-{revisionNo}`)도 일치.

**접근성**:
- 에러 상태 `role="alert"` — 버전이력 로드 오류(`:259`), 삭제 모달 오류(`:617`), 인쇄 오류(`:285`) 모두 적용
- 로딩 상태 `role="status"` — Spinner 영역(`:249`), 복원 결과 토스트(`:195`) 적용
- 토스트 닫기 버튼 `aria-label="알림 닫기"` 적용

**에러 피드백**:
- 409(CONFIRMING/CANCELED 복원 시도): FE 버튼 비활성으로 1차 차단, `onError` 토스트로 2차 피드백 (`kind: 'danger'`)
- 403: `onError` 공통 처리 ("주문 복원에 실패했습니다."). 403 전용 메시지 미분리 — 권한 오류 시 구체적 피드백 부족

**[Minor] `PartnerOrderVersionHistoryPanel.tsx`:226 — 토스트 닫기 버튼이 DS Button이 아닌 native `<button>`**

토스트 인라인 닫기 버튼이 DS `Button` 컴포넌트 없이 raw `<button>` 태그로 구현되어 있다. `variant="ghost"` + `size="sm"` DS Button을 사용하는 것이 통일성 기준에 맞다. 단, 인라인 스타일 닫기(×) 용도이고 기능적으로는 문제없으므로 Minor로 분류.

---

## 결함 목록

| 등급 | 위치 | 문제 | 권장 |
|---|---|---|---|
| P1 | `partnerOrderRevision.ts`:57, `application.yml` 미설정 | `LocalDateTime` → JSON 배열 직렬화 가능성. `spring.jackson.serialization.write-dates-as-timestamps` 미설정 시 `createdAt`이 숫자 배열로 내려와 `formatLocalDateTime()`이 오작동 | BE `application.yml`에 `spring.jackson.serialization.write-dates-as-timestamps: false` 추가 요청, 또는 FE `formatLocalDateTime`에 배열/string 방어 분기 추가 |
| P1 | `PartnerOrderVersionHistoryPanel.tsx`:140 | `invalidateQueries({ queryKey: ['partner-orders', orderId] })` — 목록 캐시 무효화 불일치. 목록 queryKey에 orderId가 없어 prefix 매칭 실패 | `['partner-orders']`로 변경 (상위 prefix 무효화) |
| Minor | `PartnerOrderVersionHistoryPanel.tsx`:226 | 토스트 닫기 버튼이 native `<button>` — DS Button 미사용 | DS `<Button variant="ghost" size="sm">` 대체 |

---

## 결론

핵심 로직(복원 가드, slipResyncRequired 경고, UUID 비공개, revision 배지 exhaustive, DS 컴포넌트, Playwright testid 정합)은 모두 정확하다.

P1 결함 2건:
1. `createdAt` LocalDateTime 직렬화 포맷 미보장 — 운영 환경 jackson 설정 불명
2. `['partner-orders', orderId]` invalidate 키 오류 — 목록 캐시 F5 stale 회귀

두 결함 모두 수정 후 재검 필요. Minor 1건(DS Button 대체)은 P1 수정과 함께 처리 권장.
