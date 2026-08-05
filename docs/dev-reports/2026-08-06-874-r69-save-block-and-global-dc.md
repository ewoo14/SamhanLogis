# R69 (#1057 / #874) 저장 차단·전역DC 수정 보고서

## 결론

R69에서 두 단절을 수정했다.

1. 최근단가 단건·bulk 조회가 실패하거나 5초 이상 응답하지 않아도 단가 fallback으로 수렴하고 저장 버튼이 영구 비활성화되지 않는다.
2. 전표 화면이 호출하는 `GET /api/v1/partner-dc-configs/{partnerCode}` 단건 API를 추가하고, 최근단가 miss/실패 시에도 이미 계산한 전역DC·고정DC 단가를 정가로 되돌리지 않는다.

## RED-first 원문

### 저장 차단 RED

수정 전 `usePartnerPriceRefresh.test.ts`에 무응답 Promise RED를 추가하고 실행한 결과:

```text
× 재조회가 끝나지 않아도 제한시간 후 CATALOG fallback 으로 저장을 막지 않는다
  → expected false to be true
```

이는 5초 경과 후에도 조회 Promise가 끝나지 않아 `isPending=true`인 원문이다.

### 전역DC API RED

수정 전 단건 GET 계약 테스트 실행 결과:

```text
PartnerPublicControllerIT > partnerDcConfig_returnsScreenCalculationFieldsForAuthorizedUser() FAILED
java.lang.AssertionError: Status expected:<200> but was:<403>
```

조사 결과 외부 컨트롤러에는 목록 GET과 PATCH만 있었고, 프론트가 호출한 단건 GET 매핑이 없었다. 인증된 권한 테스트로 이동한 뒤 단건 GET 응답 계약을 고정했다.

## 라이브 네트워크 확인 원문

로컬 게이트웨이 `127.0.0.1:8080`에 DB 쓰기 없는 GET을 보냈다.

```text
GET http://127.0.0.1:8080/api/v1/partner-dc-configs/4348703365
STATUS=401
BODY=
ERROR=원격 서버에서 (401) 권한이 없음 오류를 반환했습니다.
```

임의 인증 헤더를 붙인 재조회도 동일했다.

```text
STATUS=401
BODY=
```

인증 세션을 우회하지 않았고, 브라우저 제어 런타임은 설치본에 없어 authenticated browser network 원문은 확보하지 못했다. 대신 컨트롤러·권한 통합 테스트와 프론트의 실제 호출 경로(`/api/v1/partner-dc-configs/{partnerCode}`)를 계약으로 검증했다.

## 원인과 수정

- `SlipFormPage`는 `calculateSlipDiscount()` 결과가 있으면 최근단가 조회 전에 return했다. 그 결과 최근단가 조회가 호출되지 않았고, 전역DC 계산값과 최근단가 흐름이 분리되지 않았다.
- 최근단가 miss/실패 fallback이 `판매가`만 사용해, 이미 계산된 전역DC·고정DC 단가를 정가로 되돌릴 수 있었다. fallback 우선순위를 `DC 계산값 → 판매가`로 수정했다.
- `withPriceLookupTimeout()`을 단건·bulk 모두에 적용했다. 5초 초과는 실패 fallback으로 처리한다.
- 거래처 변경 시 이전 요청의 `lookupLoading`을 정리하고, 새 후보가 0건인 경로도 busy 상태를 정리한다.
- dc-config-service에 `GET /api/v1/partner-dc-configs/{partnerCode}`를 `sales.partner-dc-config VIEW` 권한으로 추가했다.

## 불변식 검증

- 전역DC: `1,080,000 × (1 - 48%) = 561,600` — 프론트 util 테스트 및 화면 저장 payload 회귀 통과.
- 고정DC 우선: `1,617,000 × (1 - 40%) = 970,200` — 프론트·서버 계약 통과.
- 전역DC 없음: 정가 유지 — 프론트·서버 계약 통과.
- 서버 `discountInfo`: `전역DC 48%` 설명 포함, UUID 미포함 — 서버 계약 통과.
- 조회 실패/무응답: CATALOG fallback 및 저장 가능 — 훅·화면 회귀 통과.

## 검증 명령과 결과

```text
npx vitest run src/renderer/routes/SlipFormPage.test.tsx src/renderer/utils/slipDiscount.test.ts src/renderer/utils/usePartnerPriceRefresh.test.ts
3 files passed, 73 tests passed

gradlew.bat :services:dc-config-service:test --tests ...DcConfigPermissionControllerIT.partnerDcGet_withViewGrant_returnsCalculationFields --no-daemon
BUILD SUCCESSFUL

gradlew.bat :services:slip-service:test --tests ...DiscountPriceCalculatorTest --no-daemon
BUILD SUCCESSFUL
```

React Router 기존 Future Flag warning만 출력됐으며, 이번 수정의 테스트 오류는 없다.

## 변경 파일

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- `clients/desktop/src/renderer/utils/usePartnerPriceRefresh.ts`
- `clients/desktop/src/renderer/utils/usePartnerPriceRefresh.test.ts`
- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsController.java`
- `services/dc-config-service/src/test/java/com/samhanair/logis/dcconfig/it/DcConfigPermissionControllerIT.java`

### 신규 파일 목록

- `docs/dev-reports/2026-08-06-874-r69-save-block-and-global-dc.md`

Docker 재빌드·재배포·중지는 하지 않았고, DB 쓰기 작업도 하지 않았다. 라이브 반영과 R69 재배포 후 실측은 다음 QA 라운드에서 수행한다.
