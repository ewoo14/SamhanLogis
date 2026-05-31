# AC-3 거래처 자동완성 FE 코드 리뷰 — claude-fe-cycle1

- **리뷰어**: claude-fe (Claude Sonnet 4.6)
- **대상 브랜치**: `feat/ac-3-partner-autocomplete`
- **날짜**: 2026-05-31
- **결론**: CHANGES_REQUESTED

---

## Playwright 실제 실행 결과

```
cd clients/desktop
npx playwright test playwright/ac-3-partner-autocomplete --reporter=line

Running 7 tests using 1 worker

[1/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 1: 전표 작성 진입 — 거래처 combobox 렌더 확인
[2/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 2: "엘에이" 입력 → 후보 listbox 표시
[3/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 3: 후보 클릭 선택 → 입력란에 거래처명 표시 + 연락처/주소/대표자 채워짐
[4/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → 거래처명 반영
[5/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 5: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
[6/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 6: 거래처 선택 후 다른 텍스트 입력 blur → 필드 유지
[7/7] AC-3 거래처 자동완성 PartnerAutocomplete › 시나리오 7: 존재하지 않는 거래처 검색 → "검색 결과 없음" 표시

  7 passed (10.3s)
```

7/7 PASS.

---

## design-system 빌드 결과

```
cd clients/web/design-system
npm run build

vite v5.4.21 building for production...
147 modules transformed.
dist/style.css   91.27 kB │ gzip: 13.95 kB
dist/index.js   165.41 kB │ gzip: 42.35 kB
[vite:dts] Declaration files built in 3355ms.
built in 4.05s
```

빌드 성공. TypeScript 타입체크(`tsc --noEmit`) 오류 없음.

---

## desktop typecheck 결과

```
cd clients/desktop
npm run typecheck

tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
(오류 없음)
```

---

## 점검 결과

### 1. ProductAutocomplete 포팅 충실성

| 항목 | 확인 결과 |
|---|---|
| debounce (debounceMs=250) | 동일 구조 |
| per-instance useRef seq (instanceSeq / latestSeq) | AC-2 교훈 반영, 격리 정상 |
| 로딩 dropdown ("검색 중…") | 정상 |
| 빈 결과 ("검색 결과 없음") | 정상 |
| 에러 상태 ("검색 중 오류가 발생했습니다.") | 컴포넌트 내 구현 정상 |
| isCompact / ariaLabel | ProductAutocomplete 동형 |
| combobox role / aria-expanded / aria-controls / aria-activedescendant | 정상 |
| blur 더미 onChange 금지 | handleBlur 게이트 정상 — trimmed 빈 값 early return, 미매칭 시 onChange 미호출 |
| onMouseDown e.preventDefault() | blur 전 pick 처리 정상 |
| forwardRef | 정상 |
| useEffect 클린업 | blurTimer + debounceTimer 정상 클린업 |

AC-2 known-good 구조 충실히 포팅됨. 구조적 차이 없음.

### 2. 2단계 채움 (D-AC3-03)

| 항목 | 확인 결과 |
|---|---|
| 1단계 즉시 fill (name / phone) | setPartnerName(partner.name), setCustomerTel(partner.phone ?? '') 정상 |
| 2단계 detail fetch (address / representative) | lookupPartnerForAutoFill(partner.partnerCode) 재사용 정상 |
| detail 실패 시 graceful (1단계 값 유지) | try/catch → setAutoFillError 표시, 1단계 값 유지 정상 |
| partner=null 클리어 정책 | partnerName/customerTel/customerAddress/customerRepresentative 클리어 + setAutoFillError(null) 정상 |
| 수동 버튼 제거 후 제출/검증 로직 | partnerName state 자체는 살아있어 createSlip payload의 partnerName 전송 정상 |

### 3. searchPartners API 매핑

| 항목 | 확인 결과 |
|---|---|
| 경로 `/admin/partners/search?q=&size=20` | 정상 |
| AdminPartnerListResponse.items → PartnerOption[] 매핑 | partnerCode/name/bizNo/phone 정상 |
| 실패 시 빈 배열 반환 | catch → [] 반환 |
| UUID 비공개 | PartnerSummaryResponse에 UUID 없음, partnerCode/name 노출 정상 |

**[P1] searchPartners가 catch 내에서 빈 배열을 반환(reject 없음)** — design-system PartnerAutocomplete의 에러 상태(`status === 'error'`)는 searchPartners가 reject해야 트리거됨. 현재 구현에서는 네트워크 오류 시 에러 메시지 dropdown이 표시되지 않고 빈 결과로 처리됨. Storybook의 ErrorState 스토리는 makeMockSearch({ failAfterMs: 300 })으로 reject하므로 컴포넌트 에러 상태 자체는 동작하나, 실제 searchPartnersApi는 에러 상태를 절대 발생시키지 않는 의도적 설계와 스토리 간 불일치. ProductAutocomplete의 searchProductsApi도 동일 패턴인지 확인 필요.

### 4. 회귀 확인

| 항목 | 확인 결과 |
|---|---|
| ProductAutocomplete 무변경 | git diff 변경 없음 확인 |
| WarehouseAutocomplete 무변경 | git diff 변경 없음 확인 |
| index.ts 중복 export | `export * from './components/PartnerAutocomplete'` 1회만 존재, 중복 없음 |
| partnerApi 기존 fn 영향 | searchPartners 신규 추가만, 기존 함수 무변경 |

### 5. Playwright 7/7 PASS 확인

위 실행 결과 참고.

---

## Findings

### [P1] SlipFormPage — payload에 partnerCode 미전송

**파일**: `clients/desktop/src/renderer/routes/SlipFormPage.tsx` (mutation.mutationFn 내 payload 빌드)

**현상**: AC-3 이후 `selectedPartner.partnerCode`가 `createSlip` payload에 포함되지 않음.

```typescript
// 현재 (line 437 부근)
partnerName: partnerName.trim() || undefined,
// partnerCode 필드 누락 — CreateSlipRequest에 partnerCode 없음
```

`CreateSlipRequest` 타입(`clients/desktop/src/renderer/api/slip.ts` line 194~)에 `partnerCode` 필드 자체가 정의되어 있지 않음. `SlipDetail`(line 82)과 `SlipUpdateRequest`(line 182)에는 `partnerCode?: string | null`이 있으나 생성 요청에는 빠짐.

**영향**: 전표 신규 생성 시 거래처 코드가 BE로 전달되지 않아, 전표에 partnerCode가 저장되지 않을 수 있음. spec D-AC3-03에서 "partnerCode fill"을 명시하고 있으므로 BE contract와의 정합 확인이 필요.

**조치 필요**: `CreateSlipRequest`에 `partnerCode?: string` 추가 후, payload에 `partnerCode: selectedPartner?.partnerCode ?? undefined` 포함 여부를 BE와 contract 확인 후 결정.

---

### [P1] searchPartners — 에러 시 빈 배열 반환 (에러 상태 도달 불가)

**파일**: `clients/desktop/src/renderer/api/partnerApi.ts` (line 563~566)

```typescript
} catch {
  // 네트워크/서버 오류 시 graceful 빈 배열 반환
  return []
}
```

**현상**: `searchPartners`가 네트워크 오류 시 reject하지 않고 `[]`를 반환. `PartnerAutocomplete` 내부의 에러 상태(`status === 'error'`, "검색 중 오류가 발생했습니다." 메시지)가 실제 운영 환경에서 절대 표시되지 않음.

**배경**: ProductAutocomplete의 `searchProducts`(productApi.ts)도 동일 패턴인지 확인 필요. 만약 AC-2 기준으로 동일하게 설계된 의도라면 P2로 강등 가능. 그러나 Storybook ErrorState 스토리와 design-system 컴포넌트의 에러 상태 코드가 실사용에서 데드코드가 됨.

**조치 필요**: (a) 의도적 silent degradation이면 주석에 명시 + 스토리 주의 문구 추가, (b) 에러 상태 UX가 필요하면 catch → `throw`로 변경.

---

### [P2] mock.ts — `GET /admin/partners/{code}` 라우팅 배치 주석 오해 소지

**파일**: `clients/desktop/src/renderer/api/mock.ts` (line 2740)

```typescript
// 주의: /admin/partners/search 보다 반드시 뒤에 배치 (search 가 더 specific 하므로 먼저 매칭됨)
const adminPartnerDetailMatch = url.match(/\/admin\/partners\/([^/?]+)$/)
```

주석이 "search가 더 specific 하므로 먼저 매칭됨"이라고 설명하지만, 실제로 두 핸들러는 서로 다른 `if` 분기이며, `url.includes('/admin/partners/search')`(line 2634)가 먼저 있고 `adminPartnerDetailMatch`가 나중에 있으므로 순서상 올바름. 그러나 `url.includes('/admin/partners/search')` 조건이 `/admin/partners/search`로 정확히 끝나지 않는 경우(예: `?q=search&size=20` — q 파라미터에 "search" 문자열이 포함된 경우)에는 오탐 가능성이 이론상 있음. 실무 위험은 극히 낮으나 주석 명확화 권장.

---

### [P2] Playwright 시나리오 5 UUID 가드 — authMock의 userId UUID 노출 미차단

**파일**: `clients/desktop/playwright/ac-3-partner-autocomplete/ac-3-partner-autocomplete.spec.ts` (line 66~68)

```typescript
const auth = {
  userId: '00000000-0000-0000-0000-000000010001',  // UUID
  ...
}
```

시나리오 5의 UUID 가드 단언(`expect(bodyText).not.toMatch(UUID_PATTERN)`)은 `body` 텍스트에서 UUID 미노출을 검사하는데, `window.samhanAuth.userId`가 DOM에 렌더링되지 않는다면 문제없음. 실제로 AppHeader 등에서 userId를 텍스트로 렌더링하지 않는다면 통과하나, 만약 어딘가 노출된다면 test가 실패할 것이므로 spec 자체로 검증됨. 단, authMock 내부 userId가 UUID인 점은 메모리 `feedback_uuid_no_user_visibility` 원칙상 토큰/내부 auth 객체는 허용 범위.

---

## 요약

| Finding | 심각도 | 조치 |
|---|---|---|
| SlipFormPage payload partnerCode 미전송 | P1 | BE contract 확인 후 `CreateSlipRequest` 및 payload 보완 |
| searchPartners 에러 시 reject 안 함 (에러 상태 도달 불가) | P1 | 의도 명확화 또는 throw로 변경 |
| mock.ts search 핸들러 주석 오해 소지 | P2 | 주석 명확화 (선택) |
| Playwright authMock userId UUID — DOM 미노출 확인 | P2 | 현행 유지 가능 (spec 자체가 검증) |

**Playwright 7/7 PASS 확인됨. design-system build/typecheck 오류 없음. desktop typecheck 오류 없음.**

P0 finding 없음. P1 2건(payload partnerCode 누락 + searchPartners graceful degradation 설계 불명확). P1 중 partnerCode payload 누락은 BE contract 의존 사안으로 명확화 필요.

**결론: CHANGES_REQUESTED** (P1 두 건 해소 후 재검)
