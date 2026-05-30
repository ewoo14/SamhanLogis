# FE 코드 리뷰 — Phase 2.5 주문 보류+필터 (claude-fe-cycle1)

리뷰어: Claude FE agent
날짜: 2026-05-30
브랜치: feat/phase-2-5-partner-order-hold-status-filter (HEAD f8a3c211)

---

## 점검 결과 요약

| 항목 | 판정 | 심각도 |
|---|---|---|
| 1. API 계약 정합 | 부분 결함 | P1 |
| 2. 라벨 업무용어 통일 영향 | 이상 없음 | — |
| 3. 버튼 권한 게이트 | 부분 결함 | P1 |
| 4. invalidate 일관성 | 이상 없음 | — |
| 5. 기본 필터·드롭다운 옵션 | 이상 없음 | — |
| 6. design-system Button + 에러 피드백 | 부분 결함 | P1 |
| 7. typecheck | 결함 존재 | P1 |

---

## 1. API 계약 정합

**경로·HTTP method**  
BE `PartnerOrderHoldController`:
```
POST /api/v1/partner-orders/{id}/hold
POST /api/v1/partner-orders/{id}/release
```
FE `holdPartnerOrder` / `releasePartnerOrder` 모두 `POST`에 동일 경로로 호출하고 있어 경로·메서드 정합 OK.

**응답 unwrap**  
BE는 `ApiResponse<PartnerOrderDetailResponse>`로 반환. FE는 `ApiEnvelope<PartnerOrderDetail>` 래핑을 가정하여 `res.data.data` unwrap — ApiEnvelope = ApiResponse 구조 기준이면 정상.

**[P1] `getPartnerOrder` path param 불일치 위험**  
BE `PartnerOrderIdResolver.findByIdentifier`는 `id` path variable을 주문번호 또는 내부 UUID 양쪽 모두 수용한다. FE `getPartnerOrder(orderNumber)` 및 `holdPartnerOrder(orderId)` 는 URL route param `id` 값을 그대로 전달한다. `SalesPartnerOrderListPage`에서 `navigate`시 `toOrderPathId(o.orderNumber)` (슬래시→하이픈 치환)를 적용한 값이 `useParams({ id })`로 읽히므로 주문번호 `2026/05/04-1`이 `2026-05-04-1`로 전달된다. BE `PartnerOrderIdResolver`가 이 치환된 문자열을 주문번호로 인식할 수 있는지 확인 필요. BE 코드에서 `orderNo`로의 lookup 정규식·파서가 `/` 포함 원본 형식을 기대한다면 런타임 404 발생 가능. **BE 측과 식별자 인코딩 계약 명문화 필요.**

**`PartnerOrderDetailResponse.submittedAt` 타입 불일치**  
BE DTO는 `LocalDateTime submittedAt`(=`confirmedAt` alias)를 `LocalDateTime`으로 선언하고 있으나, FE `PartnerOrderSummary.submittedAt`는 `string | null`로 받는다. Jackson 직렬화 포맷 (`yyyy-MM-ddTHH:mm:ss`)이면 문자열 처리로 작동하지만 ISO 문자열 가정 여부를 명시적으로 검증하지 않았다. Minor 수준.

---

## 2. 라벨 업무용어 통일 영향

`PARTNER_ORDER_STATUS_LABEL` 사용처 전수:
- `SalesPartnerOrderListPage.tsx` L131, L133, L193 — 드롭다운 옵션 + 목록 badge
- `SalesPartnerOrderDetailPage.tsx` L382 — 상세 badge

변경된 라벨: `DRAFT: '진행중'`, `CONFIRMED: '완료'`

기존 `ESTIMATE_STATUS_LABEL` (`DRAFT: '작성중'`, `CONFIRMED: '확정'`)과 `SlipDetailPage` / `SlipCleanupPage` 등의 다른 도메인 라벨(`'작성중'`, `'확정'`)은 별도 Record를 사용하고 있어 `PARTNER_ORDER_STATUS_LABEL` 변경이 타 화면에 교차 영향을 주지 않는다. 전수 조사 결과 파급 없음. **이상 없음.**

---

## 3. 버튼 권한 게이트

**[P1] 정적 role 체크 vs 동적 RBAC 불일치**  
`SalesPartnerOrderDetailPage`는 `canEdit = EDIT_ROLES.includes(auth.role)` 로 정적 role 배열(`['SALES', 'MANAGER', 'MASTER']`)을 사용한다. 그러나 `AppLayout`은 `usePermissions()` / `dynamicCanAccess`를 통해 동적 RBAC(BE `sales.partner-order.edit` UPDATE 권한)로 사이드바 노출을 제어한다. BE `@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)` 와 비교하면 다음 시나리오에서 불일치가 발생한다:
  - SALES role이 해당 pageCode의 UPDATE 권한이 관리자에 의해 박탈된 경우 — FE 버튼은 보이지만 BE는 403 반환.
  - ACCOUNTANT role이 관리자 오버라이드로 UPDATE 허용된 경우 — FE 버튼이 숨겨지지만 BE는 허용.

기존 다른 화면(인쇄 권한 등)도 동일 정적 패턴을 쓰므로 리그레션은 아니지만, hold/release는 새로 추가된 기능이므로 동적 RBAC 게이트로 정렬하는 것이 바람직하다.

**[P1] hold/release 403 응답 피드백 부재**  
`holdMutation.onError` 와 `releaseMutation.onError`는 409만 처리하고 403 응답에 대한 별도 메시지가 없다. 권한 없는 사용자가 직접 API 호출(또는 RBAC 오버라이드 불일치)을 통해 403을 받으면 일반 오류 문구("보류 처리에 실패했습니다")만 표시된다. 사용자가 권한 부족임을 알 수 없어 혼란 유발 가능.

**상태 조건부 렌더 정확도**  
- 보류 버튼: `status === 'DRAFT'`에서만 노출 — 정확.
- 보류 해제 버튼: `status === 'ON_HOLD'`에서만 노출 — 정확.
- `CONFIRMING`, `CONFIRMED`, `CANCELED` 상태에서는 두 버튼 모두 숨겨짐 — 정확.
- 두 버튼이 동시에 표시되는 시나리오 없음 — 정확.

---

## 4. invalidate 일관성

`holdMutation.onSuccess`:
```ts
queryClient.setQueryData(['partner-order', id], updated)          // 상세 즉시 갱신
await queryClient.invalidateQueries({ queryKey: ['partner-orders'] }) // 목록 무효화
await queryClient.invalidateQueries({ queryKey: ['partner-order', id, 'audit-logs'] }) // 감사 무효화
```
`releaseMutation.onSuccess`: 동일 패턴.

요구사항(`['partner-orders']` + `['partner-order', id]` 무효화) 충족. `setQueryData`로 상세를 즉시 갱신하고 목록을 invalidate하여 UX 반응성도 적절. **이상 없음.**

---

## 5. 기본 필터·드롭다운 옵션

`useState<PartnerOrderStatus | ''>('DRAFT')` — 기본값 `DRAFT`(진행중) 적용 정확.

드롭다운은 `Object.keys(PARTNER_ORDER_STATUS_LABEL)`을 순회하여 옵션을 생성:
- `''` 전체 상태 (별도 option)
- DRAFT → 진행중
- ON_HOLD → 보류
- CONFIRMING → 확정 처리중
- CONFIRMED → 완료
- CANCELED → 취소

5종 + 전체 = 6개 옵션. 사양의 "진행중/보류/확정처리중/완료/취소" 5종과 일치. `Object.keys` 순서는 JS 명세상 정수 키 우선 후 삽입 순이므로 enum 선언 순(DRAFT→ON_HOLD→CONFIRMING→CONFIRMED→CANCELED)대로 렌더링됨. **이상 없음.**

---

## 6. design-system Button 사용 + 에러 피드백

**design-system 컴포넌트 사용**  
보류/보류해제 버튼 모두 `@samhan/design-system`의 `Button` 컴포넌트 사용. native `<button>` 직접 사용 없음 — **규칙 준수.**

**에러 피드백**  
- 409 (상태 불일치): 한국어 메시지 표시 (`holdErrorMessage` state → `errorBanner` div, role="alert").
- 일반 오류: "보류 처리에 실패했습니다" / "보류 해제에 실패했습니다" 표시.
- **[P1] 403 (권한 없음) 미처리**: 위 항목 3 참조. 전용 메시지 없음.
- `disabled={holdMutation.isPending}` / `disabled={releaseMutation.isPending}` — 중복 클릭 방지 OK.

---

## 7. typecheck

`npm run typecheck` 실행 결과 **오류 1건 확인**:

```
src/renderer/api/mock.ts(2276,7): error TS2322
Type '(DRAFT_ROW | ON_HOLD_ROW | CONFIRMED_ROW)[]' is not assignable to
type 'typeof DRAFT_ROW[] | typeof ON_HOLD_ROW[] | typeof CONFIRMED_ROW[]'
```

**원인**: `mock.ts` L2267에서 `content` 변수 타입을 유니온 배열(`typeof DRAFT_ROW[] | typeof ON_HOLD_ROW[] | typeof CONFIRMED_ROW[]`)로 선언한 후 L2276에서 세 종류를 혼합한 배열(`[DRAFT_ROW, ON_HOLD_ROW, CONFIRMED_ROW]`)을 할당하려 하여 타입 불일치 발생.

**수정 방향**: `content` 타입을 `PartnerOrderSummary[]`로 변경하거나 `(typeof DRAFT_ROW | typeof ON_HOLD_ROW | typeof CONFIRMED_ROW)[]`로 수정.

이 오류는 `mock.ts`에 국한되며 실제 프로덕션 코드(`sales.ts`, `SalesPartnerOrderDetailPage.tsx`, `SalesPartnerOrderListPage.tsx`)에는 타입 오류 없음. 그러나 **typecheck 0 유지 요건 미충족.**

---

## 결함 목록

| ID | 위치 | 심각도 | 내용 |
|---|---|---|---|
| FE-01 | `mock.ts:2267` | P1 | typecheck TS2322 오류 — content 타입 유니온 배열 vs 혼합 배열 불일치 |
| FE-02 | `SalesPartnerOrderDetailPage.tsx:69` | P1 | 정적 role 체크(`EDIT_ROLES`)가 동적 RBAC(`sales.partner-order.edit` UPDATE)와 불일치 — BE 403 시 FE 버튼 제어 미대응 |
| FE-03 | `SalesPartnerOrderDetailPage.tsx:147,169` | P1 | holdMutation/releaseMutation onError에서 403 케이스 피드백 메시지 없음 |
| FE-04 | `sales.ts:464,479` | P1 | `toOrderPathId` 슬래시→하이픈 치환된 id를 hold/release 경로에 전달 — BE 식별자 resolver와 인코딩 계약 미검증 |

---

## 판정

**FE HOLD** — 결함 4건(FE-01~FE-04 전부 P1) 수정 후 재검토 필요.

- FE-01: mock.ts 타입 수정 (1줄)
- FE-02: `canEdit` 산출 로직을 `dynamicCanAccess('sales.partner-order.edit', 'update')` 패턴으로 전환 또는 BE 403 핸들링으로 보완
- FE-03: hold/release onError에 `error.response?.status === 403` 분기 추가
- FE-04: BE 담당자와 `toOrderPathId` 치환값 수용 여부 확인 후 계약 문서화
