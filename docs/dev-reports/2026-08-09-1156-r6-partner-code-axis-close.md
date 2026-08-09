# PR #1156 R6 — partnerCode 축 폐쇄

라운드: `R6` · 기준 HEAD: `d607e74c3` · 작업 브랜치: `fix/1155-inbound-partner-code`

## 결론

거래처코드(`partnerCode`)와 사업자번호(`businessNumber`/`bizNo`)가 서로의 fallback으로 들어가던 6개 지점을 수정했다. `partnerCode`는 서버가 준 거래처코드만 전달하고 없으면 빈 값(`''`)이며, 사업자번호는 `bizNo`/`businessNumber` 자리에만 남는다.

## RED — fix 전 실패 원문

생산 코드 수정 전에 추가한 `partner-code-axis.test.ts`를 현재 HEAD에서 실행했다.

```text
partnerCode 축 분리 (3 tests | 3 failed)
× 견적 거래처 옵션과 business number fallback을 서로 섞지 않는다
  expected ... to contain 'partnerCode: row.partnerCode'
× 전표 controlled option은 거래처코드만 partnerCode에 넣는다
  expected ... to contain 'partnerCode: code'
× 견적 상세와 거래처 검색 fallback은 사업자번호를 거래처코드로 대체하지 않는다
  expected ... to contain "partnerCode: e.partnerCode ?? ''"
```

실패 원인은 각각 `row.businessRegistrationNumber`, `bizNo`, `e.partnerBusinessNo`가 `partnerCode` 슬롯에 들어가던 현재 코드였다. 이후 최소 수정했고 동일 테스트는 3/3 통과했다.

## 6개 결함 지점 수정 표

| 지점 | fix 전 원문 | fix 후 | 화면/영향 표면 |
|---|---|---|---|
| `EstimateFormPage.tsx:1100` | `partnerCode: row.businessRegistrationNumber` | `partnerCode: row.partnerCode ?? ''` | 견적 작성/편집 거래처 자동완성 후보 |
| `EstimateFormPage.tsx:1160` | `businessRegistrationNumber: option.bizNo ?? option.partnerCode` | `businessRegistrationNumber: option.bizNo ?? ''` + `partnerCode: option.partnerCode` | 후보 선택 직후 견적 거래처 snapshot·협업 헤더 |
| `EstimateFormPage.tsx:1927` | `partnerCode: partner.businessRegistrationNumber` | `partnerCode: partner.partnerCode ?? ''` | 견적 편집 화면의 controlled 거래처 선택값 |
| `SlipDetailPage.tsx:2900` | `partnerCode: bizNo` | `partnerCode: code` | 매입·매출 전표 수정 모달 거래처 autocomplete |
| `sales.ts:327` | `partnerCode: e.partnerBusinessNo ?? ''` | `partnerCode: e.partnerCode ?? ''` | 견적 상세 API → 견적 편집 hydrate/표시 |
| `sales.ts:985` | `businessRegistrationNumber: row.bizNo ?? row.partnerCode` | `businessRegistrationNumber: row.bizNo ?? ''` | 거래처 검색 후보의 사업자번호; 코드 fallback 제거 |

## partnerCode 대입·fallback 전수 표

대상: `clients/desktop/src/renderer` production `.ts/.tsx`, `partnerCode\s*[:=]` 및 `partnerCode` fallback을 grep하고, 타입 선언/함수 매개변수/테스트 fixture는 값 대입과 구분했다.

| 위치 | 넣는 값 | 화면/용도 판정 |
|---|---|---|
| `EstimateFormPage.tsx:1100` | `row.partnerCode ?? ''` | 견적 autocomplete |
| `EstimateFormPage.tsx:1161` | `option.partnerCode` | 견적 선택 snapshot/협업 |
| `EstimateFormPage.tsx:1928` | `partner.partnerCode ?? ''` | 견적 편집 autocomplete |
| `SlipDetailPage.tsx:89` | `row.partnerCode ?? ''` | 전표 autocomplete 후보 |
| `SlipDetailPage.tsx:655` | `slip.partnerCode ?? ''` | coedit header 값 |
| `SlipDetailPage.tsx:1522` | `salesPartnerCode` | 매출 편집 fingerprint |
| `SlipDetailPage.tsx:1546` | `purchasePartnerCode` | 매입 편집 fingerprint |
| `SlipDetailPage.tsx:2062` | `data.partnerCode ?? ''` | 매입 hydrate 및 편집 필드 |
| `SlipDetailPage.tsx:2121` | `data.partnerCode ?? ''` | 매출 hydrate 및 편집 필드 |
| `SlipDetailPage.tsx:2710` | `option.partnerCode` | 거래처 선택 후 다음 코드 |
| `SlipDetailPage.tsx:2900` | `code`(호출자는 `salesPartnerCode`/`purchasePartnerCode`) | 매입·매출 controlled autocomplete |
| `SlipDetailPage.tsx:2921` | `purchasePartnerCode.trim() || null` | 매입 PUT body |
| `SlipDetailPage.tsx:2944` | `salesPartnerCode.trim() || null` | 매출 PUT body |
| `sales.ts:327` | `e.partnerCode ?? ''` | 견적 상세 정규화 |
| `sales.ts:646` | `raw.partnerCode ?? ''` | 주문 상세 정규화 pass-through |
| `sales.ts:687` | `raw.partnerCode ?? ''` | 주문 목록 정규화 pass-through |
| `sales.ts:984` | `row.partnerCode` | 거래처 검색 정규화 |

전수 grep에서 사업자번호를 `partnerCode`에 넣는 production 표현은 0건이다. 반대로 `businessRegistrationNumber`에는 `row.bizNo ?? ''`, `option.bizNo ?? ''`만 남겼다. `partnerCode` 타입 선언/URL 파라미터/테스트 fixture는 값의 출처를 정하는 대입 지점이 아니므로 별도 오탐으로 분리했다.

## 새 조합과 실행 결과

- 코드 있음 + 사업자번호 있음 → `(P-2026-0001, 113-07-10031)` 분리 유지.
- 코드 없음 + 사업자번호 있음 → `(, 113-07-10031)`; 코드에 사업자번호를 채우지 않음.
- 코드 있음 + 사업자번호 없음 → `(P-2026-0001, )`; 사업자번호에 코드를 채우지 않음.
- 견적 검색 후보 → 선택 → hydrate → controlled value → 각 단계에서 코드/사업자번호 축 유지.
- 전표 거래처 재선택 → 매입/매출 coedit header → PUT body에서 축 유지.

자동 검증은 `partner-code-axis.test.ts`, `SlipDetailPage.partner-code.test.ts`, `EstimateFormPage.coedit.test.tsx`를 실행했다. 결과는 각각 3건, 1건, 56건 통과다.

## 라이브 QA — R6

정상 renderer `vite.renderer.dev.config.ts`로 포트 `5330`을 사용했다. 잘못된 `vite.web.config.ts`는 사용하지 않았다. fix 전은 기존 renderer `5316`, fix 후는 현재 renderer `5330`에서 같은 DRAFT 화면을 열었다. 저장 버튼 요청은 Playwright에서 200 synthetic fulfill로 차단했으며 공유 DB PUT은 수행하지 않았다.

| 표본 | fix 전 | fix 후 | PUT body |
|---|---|---|---|
| 매입 `2026/08/09-2` | `fix-before-5316-inbound.png` | `fix-after-inbound.png` | `partnerCode=P-2026-0001`, `businessNumber=113-07-10031` |
| 매출 `2026/08/10-16` | `fix-before-5316-outbound.png` | `fix-after-outbound.png` | `partnerCode=P-2026-0001`, `businessNumber=113-07-10031` |

증거 JSON: `docs/qa/2026-08-09-1156-r6/direct-put-payload-evidence.json` (UUID/자격증명 비공개). 두 표본 모두 PUT 전 실제 네트워크는 상세 GET과 price-memory POST만 관측했고 PUT은 synthetic fulfill이었다.

## R4·R5 및 R2·R3 보존

- R4/R5 direct PUT 계약: 매입·매출 모두 코드와 사업자번호가 분리된 본문으로 유지됐다.
- R2/R3 백엔드 동작: 이번 라운드는 공유 DB write 금지로 mutation 자체를 서버에 전달하지 않았으므로 lookup 실패 send/confirm, 재전송 code 보존, A→B code 변경, DRAFT→SENT 보강을 라이브 재실행하지 않았다. 기존 R2/R3 테스트/증거를 변경하지 않았다.
- 보정 endpoint `backfill-committed-partners`는 호출하지 않았다. 거래처 `1068689215`를 조작하지 않았다. SELECT 외 공유 DB 변경은 없었다.

## 신규 생성 파일

- `clients/desktop/src/renderer/routes/partner-code-axis.test.ts`
- `clients/desktop/playwright/1156-r6-partner-code-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r6-partner-code-real-qa/1156-r6-partner-code-real-qa.spec.ts`
- `docs/qa/2026-08-09-1156-r6/direct-put-payload-evidence.json`
- `docs/qa/2026-08-09-1156-r6/fix-before-5316-inbound.png`
- `docs/qa/2026-08-09-1156-r6/fix-before-5316-outbound.png`
- `docs/qa/2026-08-09-1156-r6/fix-after-inbound.png`
- `docs/qa/2026-08-09-1156-r6/fix-after-outbound.png`
- 본 보고서

`docs/qa/2026-08-09-1156-r6/_local`은 존재하지 않는다. `tools/legacy-gas/**`는 변경하지 않았다.

## 검증 명령

```text
npx vitest run src/renderer/routes/partner-code-axis.test.ts src/renderer/routes/SlipDetailPage.partner-code.test.ts
→ 2 files / 4 tests passed

npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx src/renderer/routes/SlipDetailPage.partner-code.test.ts src/renderer/routes/partner-code-axis.test.ts
→ 3 files / 60 tests passed

npm run typecheck
→ exit 0

npx playwright test 1156-r6-partner-code-real-qa.spec.ts --config playwright.config.ts
→ 1 passed (R6 live, 5330, DB write 차단)
```

커밋·push는 수행하지 않았다.
