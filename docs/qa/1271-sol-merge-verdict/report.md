# PR #1271 CODEX SOL 적대검증 판정서

## ① 검증 SHA · main 병합

- 요청 검증 SHA: `6a14897a3a73f690996c4c1a1db8237e18de9c7f`
- 검증 브랜치: `fix/dps-inbound-compare`
- 시작 시 `git fetch origin` 후 `git merge origin/main --no-edit` 실행
- 병합한 main: `1c9ebfc447a7ec50ad5b6eb9cbf52573e5300b11`
- 병합 결과: 충돌 없음, 로컬 검증 HEAD `acf8f5ba210192bd8aab5b2523dfae99ac7f22c9`
- `git add/commit/push`는 수행하지 않았다. 위 merge 명령이 생성한 로컬 병합 커밋만 존재한다.

## ② 정찰 6축 대조표 — 레거시 ↔ 현행 수정 후

| 축 | 레거시 | 현행 수정 후 실측 | 판정 |
|---|---|---|---|
| ① 우리 쪽 원천 | 사용자가 올린 이카운트 입고 엑셀 | `DpsCompareService.compare()` → `getInboundSlips()` → 실제 `GET /internal/slips/inbound-lines`; 2025-01-01~2026-08-17 **77행**, `totalAmount` 포함 | **INBOUND 전환 구현** |
| ② 실제 DPS 헤더 | `납품일자·납품번호·모델·수량·매입단가·공급가·인도처명·부가세·합계` | 같은 9헤더, 표지 3행이 있는 파일을 업로드해 77행 파싱 | **구현** |
| ③ 비교값 | 수량 + 합계금액 엄격 비교 | 수량 동일·금액만 11,000→12,000인 행을 `AMOUNT_MISMATCH`로 검출 | **구현** |
| ④ 매칭 키 | 납품번호(적요) + 레거시 모델 정규화 | 납품번호 + 모델 키는 사용하나 모델 정규화가 공백 제거·대문자화뿐이다. 레거시의 `[`, `(`, `.` 뒤 제거는 없음 | **부분 구현 · 도달 결함 1건** |
| ⑤ 중복 처리 | 같은 키 배열에서 정확 일치→수량 일치→금액 일치→남은 첫 행 순으로 행별 1:1 소비 | `boolean[] consumed`로 행별 1:1 소비는 한다. 그러나 같은 키의 **첫 행부터** 소비해 레거시 우선순위가 없음 | **부분 구현 · 도달 결함 1건** |
| ⑥ 헤더 행 | 첫 시트 전체에서 헤더 탐색 | `findHeaderRow()`가 전 행을 순회한다. 표지 3행 뒤 4행 헤더 실파일 성공 | **구현** |

## ③ 레거시 원문 직접 인용

출처: `tools/legacy-gas/DPS 입고기록 비교/Index.html:398-402`

```js
r._name = cleanModelName(r['품명 및 규격']);
r._key = cleanStr(r['적요']) + '_' + r._name;
r._qty = parseNum(r['수량_1'] || r['수량']);
r._sum = parseNum(r['합 계'] || r['합계']);
```

금액을 실제 정상 판정에 쓰는 원문은 `Index.html:444-454`의 다음 부분이다.

```js
let mIdx = rg.findIndex((r, i) => !usedR[i] && l._qty === r._qty && l._sum === r._sum);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i] && l._qty === r._qty);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i] && l._sum === r._sum);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i]);
// ...
let ok = (l._qty === r._qty && l._sum === r._sum);
```

모델 정규화 원문은 `Index.html:379-384`다.

```js
function cleanStr(v) { return String(v || '').trim(); }
function cleanModelName(name) {
  if (!name) return "";
  return cleanStr(name).split('[')[0].split('(')[0].split('.')[0].replace(/\s+/g, '');
}
```

## ④ 금액 불일치 직접 재현

최신 병합 HEAD의 branch slip-service `28086`, branch inventory-service `28085`, renderer `5942`를 모두 기동하고 headless Chromium Playwright로 화면을 조작했다. 자격은 `resolveQaCredential()`, 캡처는 `resolveQaShotsDir()`를 사용했다.

- 원천: 실제 `/internal/slips/inbound-lines` 77행
- 대상: 전표 `2026/08/14-16`, 품번 `0000098`
- 입고: 수량 1, 합계 11,000
- DPS: 수량 1, 합계 12,000
- API: HTTP 200, `AMOUNT_MISMATCH`, `expectedQty=1`, `actualQty=1`, `expectedAmount=11000`, `actualAmount=12000`
- 화면: 정상 일치 76, 불일치 1, 상세 1행 `합계금액 불일치`

증거: [02-C 금액 불일치](./screenshots/02-C-same-qty-amount-mismatch-real-qa.png)

## ⑤ 출고 계열 문구 잔재

- 실제 라이브 화면 body를 A~F 케이스에서 검사한 결과 `출고|OUTBOUND|발송` 사용자 노출 문구는 **0건**이다.
- `InventoryDpsComparePage.tsx`와 `dpsCompareApi.ts` 사용자 노출 범위 정적 검색도 0건이다.
- 비교 실행 경로 바깥 호환 타입 `OutboundSlipLineSummary`, 일반-purpose `getOutboundSlips()`는 남아 있으나 실제 비교는 `getInboundSlips()`를 호출한다.
- 사용자 비노출 Javadoc `RowMismatch.java`에는 출고 계열 설명 5곳이 남아 있다. 화면 도달 결함으로 세지 않았다.

## ⑥ 커밋 캡처 4장 직접 검증

4장 모두 2400×1200 PNG를 원본으로 직접 열었다.

| 캡처 | 카드의 DPS 행 | 상세 표 행 | 직접 확인한 내용 |
|---|---:|---:|---|
| `01-A-real-header-77-rows-real-qa.png` | 77 | 0 | 입고전표 77, 정상 77, 불일치 0 |
| `02-C-same-qty-amount-mismatch-real-qa.png` | 77 | 1 | 수량 1=1, 합계 11,000≠12,000, 금액 불일치 |
| `03-D-quantity-mismatch-real-qa.png` | 77 | 1 | 수량 1≠2, 수량 불일치 |
| `04-B-all-match-zero-mismatch-real-qa.png` | 77 | 0 | 정상 77, 불일치 0 |

커밋 캡처의 주장과 화면 수치는 일치했다.

## ⑦ SOL 신규 스크린샷

- [01 A 실제 헤더 77행·상세 0행](./screenshots/01-A-real-header-77-rows-real-qa.png)
- [02 C 수량 동일·금액 불일치 상세 1행](./screenshots/02-C-same-qty-amount-mismatch-real-qa.png)
- [03 D 수량 불일치 상세 1행](./screenshots/03-D-quantity-mismatch-real-qa.png)
- [04 B 전량 일치 상세 0행](./screenshots/04-B-all-match-zero-mismatch-real-qa.png)
- [05 모델 정규화 결함 상세 2행](./screenshots/05-E-legacy-model-normalization-defect-real-qa.png)
- [06 중복 우선순위 결함 상세 2행](./screenshots/06-F-duplicate-priority-defect-real-qa.png)
- [07 MANAGER 저장 403 후 닫히지 않은 저장창](./screenshots/07-manager-history-create-403-real-qa.png)

7장 모두 headless Chromium 산출물을 직접 열어 화면과 측정 JSON이 일치함을 확인했다.

## ⑧ 저장 이력

### 구현 계약

- DB entity는 `programType`, `saveMode`, `topic`, `requestParams`, **전체 `responsePayload`**를 저장한다.
- 자동 저장은 사용자+프로그램별 최신 1건을 soft-delete 교체하고, 명시 저장은 누적한다.
- 상세/latest 응답은 `responsePayload`를 반환하며 화면은 이를 `DpsCompareResponse`로 복원한다.

### 라이브 실측 — 도달 결함 1건

격리 PostgreSQL `codex-1271-sol-pg`와 branch inventory-service로 저장 경로를 분리했다. 실제 MANAGER 자격으로 비교 자체는 200이었으나:

- 자동 저장 POST `/warehouse/audit/dps-history`: **403**
- 명시 저장 POST: **403**
- 원문: `동적 권한 deny — page=inventory.dps action=CREATE ... account permission missing`
- 격리 DB `dps_save_history` 행 수: **0**
- 새로고침 latest: 404, 비교 결과 복원 불가
- 명시 저장 실패 후 다이얼로그는 열린 채이고 오류 문구도 표시되지 않았다.

따라서 저장 구조와 복원 코드는 있으나, 실제 허용 대상이라고 문서화된 **MANAGER 사용자는 저장·복원을 사용할 수 없다.**

## ⑨ 미검증 · 미구현 축

- 미검증한 정찰 축: **없음**
- 미구현/불완전:
  1. ④ 레거시 모델 정규화(`[`, `(`, `.` 뒤 제거) 미구현
  2. ⑤ 중복 키 내 정확 일치→수량→금액 우선 소비 미구현
  3. 저장 이력 `inventory.dps CREATE`의 MANAGER 권한 미부여
- ⑥ 표지 3행 뒤 헤더 탐색은 구현·라이브 확인했으므로 미구현으로 세지 않았다.

## ⑩ CI 귀속

확인 시각 기준 PR head는 `6a14897a3`다. 구현자 보고의 “기존 mock 1건 + GitHub 429”는 현재 상태와 다르다.

| 체크 | 현재 결과 | main 대조·귀속 |
|---|---|---|
| Frontend Desktop | 실패 | PR이 새로 추적한 `docs/qa/1271-label-parity/renderer-5942.err` 때문에 extension census가 `.err`를 거부. main `1c9ebfc44` 동일 잡은 성공. **PR 귀속** |
| 하네스 거짓 green 가드 | 실패 | 위와 같은 `.err` 1개가 원인. main 하네스 성공. **PR 귀속** |
| Desktop Playwright mock hard gate | 실패 | 최종 실패는 `sp-08-2-dps-history.spec.ts:103`, `dps-history-tab-run` 미발견. main 전체 CI는 성공. 라이브 화면에서는 해당 탭이 보였으나 CI 자체는 **PR 귀속 미해소** |
| Android 2잡 | 통과 | 현재 `Set up job` 포함 통과. 현재 실행에서 GitHub 429 없음 |

- PR CI: <https://github.com/ewoo14/Samhan-Public/actions/runs/32085368274>, <https://github.com/ewoo14/Samhan-Public/actions/runs/32085368288>, <https://github.com/ewoo14/Samhan-Public/actions/runs/32085368326>
- main 대조 CI 성공: <https://github.com/ewoo14/Samhan-Public/actions/runs/32084521369>
- 로컬 fresh 테스트: `DpsCompareServiceTest`, `DpsExcelParserTest`, `DpsSaveHistoryServiceTest` — Gradle `BUILD SUCCESSFUL` (23 tests, 실패 0)
- 라이브 스펙: `1271-dps-inbound-compare-real-qa.spec.ts` — **1 passed (19.2s)**

## ⑪ 머지 판정 — 머지 불가, 도달 결함 3건

**머지 불가. 실 사용자가 화면으로 재현할 수 있는 도달 결함은 3건이다.**

1. **모델 정규화 오불일치**: DPS 모델 `0000098[verify]`는 레거시 규칙상 `0000098`과 같아야 하나, 화면은 `DPS 미발견`과 `입고전표 미발견` 2행을 표시한다.
2. **중복 정확행 우선소비 누락**: 같은 납품번호·모델의 불일치 추가행을 정확행보다 먼저 두면, 레거시는 정확행을 먼저 소비해 추가행 1건만 남겨야 한다. 현행은 `수량 불일치`와 `입고전표 미발견` 2행으로 과대 표시한다.
3. **MANAGER 저장·복원 불가**: 비교는 가능하지만 자동·명시 저장이 모두 CREATE 403이다. DB에 결과가 남지 않아 복원할 수 없고 화면은 자동저장 실패를 숨긴다.

별도로 현재 필수 CI 3개가 실패 중이므로 CI 기준으로도 머지할 수 없다.

## ⑫ 프로세스 회수

- 제가 기동한 branch slip-service PID 회수 완료
- 제가 기동한 branch inventory-service PID 회수 완료
- 제가 기동한 Vite renderer PID 회수 완료
- Playwright/Chromium 종료 완료
- 격리 컨테이너 `codex-1271-sol-pg` 삭제 완료
- 포트 `28085`, `28086`, `5942` listener 0
- 공유 `samhan-*` 컨테이너 **24개 그대로 유지**
- 최종 실행 컨테이너: 공유 24개 + 다른 작업의 격리 컨테이너 2개 = 26개; 본 검증 잔여 컨테이너 0

