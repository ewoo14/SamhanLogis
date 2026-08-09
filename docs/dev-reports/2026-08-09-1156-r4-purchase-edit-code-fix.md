# PR #1156 R4 — 매입 직접 수정 거래처코드 저장 결함

## 판정

원인은 확정했고 FE 원천 매핑을 수정했다. `partnerCode`와 `businessNumber`가 검색 API 경계에서 서로 다른 체계로 보존되도록 했다. BE의 direct PUT은 요청 값을 그대로 도메인에 전달하는 계약이므로 이 라운드에서 BE 저장 로직을 임의 보정하지 않았다.

## 원인: 파일:줄

표본 거래처는 `partnerCode=P-2026-0001`, `bizNo=113-07-10031`이었다.

1. `clients/desktop/src/renderer/api/sales.ts:937`의 `PartnerSummary`에는 거래처코드 필드가 없었다.
2. 같은 파일 `:971-984`의 검색 응답 변환이 서버의 `row.partnerCode`를 버리고 `businessRegistrationNumber: row.bizNo ?? row.partnerCode`만 만들었다. 이 경계에서 거래처코드 체계가 소실됐다.
3. 수정 전 `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:2880-2888`은 `partnerCode: row.businessRegistrationNumber`로 사업자번호를 `PartnerOption.partnerCode`에 넣었다.
4. 수정 전 선택기 `:2696-2717`은 그 값을 `partnerCode`와 CRDT header에 함께 기록했고, 저장 `:2909-2916`은 그대로 PUT했다.
5. BE `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipUpdateService.java:119-129`와 `SalesSlipUpdateService.java:112-122`는 요청의 `partnerCode`를 `Slip.updateHeader/updateSalesHeader`로 전달하고, `Slip.java:786-799`/`:855-869`는 그대로 저장한다.

따라서 최초 변환 지점은 BE가 아니라 `sales.ts` 응답 정규화 + `SlipDetailPage.tsx` 옵션 매핑이다. 서버가 잘못 해석한 것이 아니며, 화면 선택기가 원본 API 필드를 받기 전에 코드 체계를 잃은 것이다.

## RED 원문

R3의 실제 GUI 재현 원문:

```text
selectedPartnerName         (주)서울에어컨
expected partnerCode        P-2026-0001
request.partnerCode         113-07-10031
response.partnerCode        113-07-10031
Playwright 전체             3 passed (9.5s)
```

R4 라이브 스펙을 수정 전 renderer `http://127.0.0.1:5316`에서 재실행한 원문:

```text
Expected: "P-2026-0001"
Received: "113-07-10031"
at 1156-r4-code-fix-real-qa.spec.ts:105
```

이 RED는 PUT request payload에서 실패했다. 즉 DB/API 응답 이전부터 값이 사업자번호였음이 확인됐다.

## 수정

- `sales.ts:921-924,981-984`: `PartnerSummary.partnerCode`를 보존하고 검색 응답에서 `row.partnerCode`를 별도 필드로 전달.
- `SlipDetailPage.tsx:86-94`: `toSlipPartnerOption` 추가. `partnerCode=row.partnerCode`, `bizNo=row.businessRegistrationNumber`를 독립 매핑.
- `SlipDetailPage.tsx:2710-2732`: 선택 시 거래처코드는 `partnerCode`, 사업자번호는 `businessNumber`에 각각 기록.
- `SlipDetailPage.tsx:2895-2896`: 매입·매출 direct edit 검색 결과 모두 공통 정규화 함수 사용.
- `SlipDetailPage.partner-code.test.ts`: 두 표본 값을 나란히 넣어 체계가 뒤바뀌지 않는 계약 고정.

## `partnerCode` 기입 지점 전수 표

| 지점 | 값 출처 | 체계 판정 |
|---|---|---|
| `SlipService.create` `SlipService.java:354` | partnerId resolve 결과의 거래처코드 | 거래처코드, R3 실 GUI 통과 |
| `SlipService.editHeader` `SlipService.java:409-412` | 공통 partnerId→code sync | 거래처코드, R3 A→B 통과 |
| `SlipService.updateSlip` `SlipService.java:492-505` | 공통 partnerId→code sync | 거래처코드, R3 동일/생략/A→B 통과 |
| `SlipService.send/confirm` `SlipService.java:901-902,1401-1402,1863-1869` | partnerId resolve 또는 기존 snapshot | 거래처코드, R3 timeout/fail-open 통과 |
| `EstimateToSlipConverter.java:80-90` | partnerId resolve 결과 | 거래처코드, R3 GUI convert 통과 |
| `SlipSeeder.java:406-423` | 지역 deterministic partnerCode | 거래처코드, 사용자 경로 아님 |
| `SlipDuplicateService.java:97-147` | 복제 원본 partnerId resolve | 거래처코드 |
| `SlipPublishService.java:150-176,236-260,339-361` | 검증된 요청 partnerCode | 거래처코드 |
| `MobilePartnerOrderService.java:125-147` | 검증된 모바일 요청 code | 거래처코드 |
| `Slip.java:2228-2237` revision restore | snapshot의 id/code 쌍 | 거래처코드 |
| `SlipPartnerBackfillService.java:52-65` | code↔id 보정 | 거래처코드, R4 실행 금지 |
| `SlipUpdateService.java:119-129` | FE PUT request.partnerCode | 수정 전 사업자번호가 유입될 수 있었음; FE 수정 후 거래처코드 |
| `SalesSlipUpdateService.java:112-122` | FE PUT request.partnerCode | 매입과 동일한 미러 구조; 별도 실 write 없음 |

표본 형태 대조: `P-2026-0001`은 거래처코드, `113-07-10031`은 사업자번호이며 서로 다른 체계다. 수정 후 옵션 매핑은 첫 값을 `partnerCode`, 둘째 값을 `bizNo`로 유지한다.

## 라이브 확인

### 수정 전

R4 스펙은 실제 인증 후 기존 실행 renderer에서 매입 직접 수정 화면을 열고 거래처를 `(주)서울에어컨`으로 변경했다. PUT payload의 `partnerCode=113-07-10031`을 확인했다. 캡처는 최종 제출 경로 `docs/qa/2026-08-09-1156-r4/01-direct-put-before-save.png`에 남겼다. 실행 중간 산출물 `_local`도 남아 있으나, `_local`은 `resolveQaShotsDir`의 덮어쓰기 보호 기본 경로다.

### 수정 후

현재 소스 renderer를 별도 `5328`에서 기동해 같은 스펙을 실행했으나, 웹 renderer가 `purchase-slip-edit-open`을 끝내 렌더링하지 않아 180초 timeout 됐다. 따라서 수정 후 라이브 PUT/DB 값을 성공했다고 주장하지 않는다. 수정 후 대체 검증은 아래 자동 테스트와 타입 컴파일까지 완료했다.

## RED-B / RED-C 회귀

R3에서 확인한 RED-B 경로(`editHeader` A→B, DRAFT→SENT 보강, 동일 partnerId 재전송 보존, lookup 실패 send/confirm 성공)는 이번 변경이 검색 옵션 변환 함수에 한정되어 있으므로 BE/transition 코드를 건드리지 않았다. 기존 R3 라이브 원문과 SlipDetail 관련 회귀 테스트로 보존을 확인했다. 사업자번호가 partnerCode에 남지 않는 RED-C는 `toSlipPartnerOption` 계약 테스트로 고정했다.

## 검증

```text
SlipDetail 관련 6개 test file / 132 tests PASS
TypeScript tsc -p tsconfig.node.json --noEmit PASS
TypeScript tsc -p tsconfig.web.json --noEmit PASS
git diff --check PASS
```

`npm run typecheck`의 마지막 real-QA scope 단계는 기존 미추적 파일 `clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts` 때문에 종료코드 1이었다. 이번 라운드가 생성한 R4 스펙 자체는 `-real-qa` 디렉터리 규칙을 따른다.

## 신규 파일

- `clients/desktop/src/renderer/routes/SlipDetailPage.partner-code.test.ts`
- `clients/desktop/playwright/1156-r4-code-fix-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r4-code-fix-real-qa/1156-r4-code-fix-real-qa.spec.ts`
- `docs/dev-reports/2026-08-09-1156-r4-purchase-edit-code-fix.md`
- `docs/qa/2026-08-09-1156-r4/01-direct-put-before-save.png` (라이브 실패 재현 캡처)

## 못 한 것 / 제한

- 수정 후 라이브 GUI PUT 및 공유 DB SELECT 전후 대조: 새 renderer가 edit 버튼을 렌더링하지 않아 미완료.
- 매출 direct PUT 별도 실 GUI write: 매입과 동일 FE 검색·매핑 및 BE 미러 구조만 전수했고, 공유 DB write를 늘리지 않았다.
- `backfill-committed-partners` 실행하지 않음.
- 보호 거래처 `partner_code=1068689215` 미접촉.
- git commit/push 하지 않음.
