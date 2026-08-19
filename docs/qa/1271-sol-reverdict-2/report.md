# PR #1271 CODEX SOL 적대검증 재판정서 — 2회차

## ① 검증 SHA · main 병합

- 검증 브랜치: `fix/dps-inbound-compare`
- 요청 SHA / 실제 HEAD: `46462ff1588c12244431a8fdf7486fd6ff24f456`
- `git fetch origin main` 후 병합한 `origin/main`: `3e4f44cc0e3312172a6f7ca8b3d87d875fd69428`
- `git merge origin/main --no-edit`: `Already up to date.`, 충돌 없음
- 검증 전 작업트리 변경: 0건
- `git add`, `git commit`, `git push`, 제품 코드 수정은 수행하지 않았다.

## ② 정규화 양방향 실측 · 매칭 증감 · 거짓 일치

### 레거시 원문

`tools/legacy-gas/DPS 입고기록 비교/Index.html:380-383`:

```js
function cleanStr(v) { return String(v || '').trim(); }
function cleanModelName(name) {
  if (!name) return "";
  return cleanStr(name).split('[')[0].split('(')[0].split('.')[0].replace(/\s+/g, '');
}
```

레거시는 양쪽 모두 같은 함수로 정규화한다. 이카운트 쪽은 `Index.html:398-399`, DPS 쪽은 `Index.html:421-423`에서 각각 `cleanModelName(...)` 결과를 키에 넣는다. 현행도 `DpsCompareService.java:362-374`에서 입고·DPS 양쪽 키 생성 시 동일한 `normalizeModel()`을 호출하며, `[`, `(`, `.` 중 가장 앞선 위치에서 자른 뒤 공백을 제거한다.

양방향 합성 실측:

| 입고 모델 | DPS 모델 | 정규화 결과 | 매칭 |
|---|---|---|---|
| `MODEL 01` | `MODEL 01[verify]` | `MODEL01` / `MODEL01` | 예 |
| `MODEL 02(old)` | `MODEL 02` | `MODEL02` / `MODEL02` | 예 — 접미사가 반대쪽에 있음 |
| `MODEL 03.001` | `MODEL 03` | `MODEL03` / `MODEL03` | 예 — 접미사가 반대쪽에 있음 |
| `MODEL 04` | `MODEL 040` | `MODEL04` / `MODEL040` | 아니오 |

실제 77행 E fixture를 수정 전 알고리즘과 현재 알고리즘으로 독립 계산하고, 현재 백엔드·화면에서도 다시 실행했다.

| 상태 | 입고 | DPS | 정상 매칭 | 불일치 | 유형 |
|---|---:|---:|---:|---:|---|
| 수정 전 | 77 | 77 | 76 | 2 | `DPS_NOT_FOUND` 1 + `SLIP_NOT_FOUND` 1 |
| 정규화 수정 후 | 77 | 77 | 77 | 0 | 없음 |

- 사라진 미발견: **2건**
- 증가한 정상 매칭: **1쌍**
- 새로 매칭된 쌍 전수: `0000098 ↔ 0000098[verify]` 1쌍
- 이 쌍의 레거시 정규화 결과는 양쪽 모두 `0000098`이다.
- 새로 늘어난 매칭 중 레거시 원문 규칙으로 같지 않은 쌍: **0쌍**. 즉 실측 거짓 일치 **0건**이다.

Playwright 화면도 `77/77/77/0`, 상세 0행이다: [05 E 정규화 수정](./screenshots/05-E-normalization-fixed-real-qa.png).

## ③ 중복 소비 전·후 불일치 수

현행은 `DpsCompareService.java:311-327`에서 같은 `납품번호+정규화 모델` 후보 중 수량과 금액이 모두 같은 미소비 행을 먼저 찾고, 없을 때만 첫 미소비 행으로 간다.

실제 77행에 같은 키의 불일치 행을 앞에 추가한 F fixture 결과:

| 상태 | 입고 | DPS | 정상 매칭 | 불일치 | 결과 |
|---|---:|---:|---:|---:|---|
| 수정 전 첫행 소비 | 77 | 78 | 76 | 2 | 수량 불일치 1 + 입고전표 미발견 1 |
| 수정 후 정확행 우선 | 77 | 78 | 77 | 1 | 남은 추가행 `SLIP_NOT_FOUND` 1 |

소비 순서가 결과를 바꾸는 최소 2×2 합성 케이스도 별도로 계산했다.

```text
입고 순서: (2, 200), (1, 100)
DPS 순서 : (1, 100), (2, 200)

첫행 우선   → 정상 0, 불일치 2
정확행 우선 → 정상 2, 불일치 0
```

Playwright 실화면 F는 `입고 77 / DPS 78 / 정상 77 / 불일치 1`, 상세 1행이며 남은 추가행만 표시한다: [06 F 정확행 우선](./screenshots/06-F-exact-first-fixed-real-qa.png).

## ④ MANAGER 저장→복원 왕복 · V109 권한 범위

### 격리 DB 구성과 V109 적용

공유 `auth_db`는 읽기 전용 `pg_dump`로만 읽고, 격리 PostgreSQL `codex-1271-r2-pg`의 `auth_db`에 스키마·데이터를 선적재했다. 선적재 직후 최종 migration은 V108, 계정 33개였으며 `accounts` relation 누락 함정을 피했다. 브랜치 auth-service를 격리 DB에 연결하자 Flyway가 다음을 기록했다.

```text
109|grant manager dps history create|true
108|backfill group permission materialization|true
```

V109는 역할 템플릿(`V109:5-12`), MANAGER 기본그룹(`V109:14-21`), 기존 활성 계정(`V109:23-37`)의 `can_create`만 `TRUE`로 바꾼다. 권한 row가 없는 활성 MANAGER 계정은 갱신된 템플릿의 비트를 그대로 복제한다(`V109:39-63`).

적용 전 역할 비트:

```text
VIEW=true CREATE=false UPDATE=false DELETE=false RESTORE=false DOWNLOAD=true PRINT=false
```

적용 후 역할·기본그룹·활성 MANAGER 계정 3개 전수의 정확한 비트:

```text
VIEW=true CREATE=true UPDATE=false DELETE=false RESTORE=false DOWNLOAD=true PRINT=false
```

따라서 기존 VIEW·DOWNLOAD에 필요한 CREATE만 추가됐고 UPDATE/DELETE/RESTORE/PRINT 확대는 **0비트**다.

### 실제 화면 왕복

브랜치 inventory-service는 격리 `inventory_db`, 동적 권한 조회는 V109가 적용된 격리 auth-service를 사용했다. 실제 MANAGER 로그인, gateway attestation, headless Chromium으로 다음을 밟았다.

1. A 비교 실행 → `AUTO_LATEST` POST 200
2. 화면 새로고침 → latest GET 200 → `77/77/77/0` 복원
3. 「내역으로 저장」에서 고유 주제 입력 → `MANUAL_NAMED` POST 200
4. 새로고침 후 저장내역 행 클릭 → 상세 GET 200 → `77/77/77/0` 복원

자동 복원: [08 AUTO_LATEST 복원](./screenshots/08-auto-latest-restored-real-qa.png)  
명시 복원: [10 MANUAL_NAMED 복원](./screenshots/10-manual-history-restored-real-qa.png)

### 도달 결함 1건 — 명시 저장 직후 목록이 갱신되지 않음

명시 저장 POST는 200이고 격리 DB에도 새 활성 행이 생겼지만, 저장 성공 뒤 자동 전환된 「저장내역」에는 방금 저장한 고유 주제가 나타나지 않았다. 직전 목록 2행만 남았고 새 주제의 화면 count는 0이었다. 새로고침 후에야 새 주제가 나타나 상세 복원이 가능했다.

- 코드 근거: 저장 성공 시 `setActiveTab(1)`만 호출한다(`InventoryDpsComparePage.tsx:203-205`).
- 목록 query key는 `['dps-history-list', programType, query]`이고(`DpsHistoryTab.tsx:24-29`), 저장 성공 시 invalidate/refetch가 없다.
- 실화면 증거: [09 저장 직후 새 주제 미노출](./screenshots/09-manual-save-immediate-history-real-qa.png). 화면의 기존 2행 어디에도 새 주제 `SOL 2회차 신규 저장 1787017855276`이 없다.
- 새로고침 후 같은 주제가 나타나고 복원된 화면은 10번 캡처다.

실 사용자는 저장 성공 뒤 자신이 방금 저장한 내역이 없다고 보게 되므로 화면 도달 결함으로 센다.

## ⑤ 헤더 행 탐색

- 레거시는 `Index.html:345-351`에서 첫 시트 전체를 순회해 DPS 헤더(`납품일자`, `모델`, `납품번호`)가 함께 있는 행을 찾는다.
- 현행은 `DpsExcelParser.java:164-172`에서 전체 행을 순회하고 모델/품번과 수량 헤더가 함께 있는 행을 반환한다. 데이터 시작은 찾은 행 다음 줄이다(`DpsExcelParser.java:72-90`).
- 표지 3행 + 4행 헤더인 실제 A 파일을 Playwright로 업로드했다. 77행 전부 파싱되고 `77/77/77/0`이었다.
- fresh parser test 4/4 통과. 헤더 탐색은 **구현·라이브 확인**이다.

## ⑥ 잃으면 안 되는 것 재현

실제 브랜치 slip-service의 `GET /internal/slips/inbound-lines?from=2025-01-01&to=2026-08-17`가 HTTP 200, **77행**을 반환했다. 브랜치 inventory-service와 renderer를 함께 띄운 Playwright 실측:

| 케이스 | 입고전표 라인 | DPS 행 | 정상 | 불일치 | 상세 |
|---|---:|---:|---:|---:|---:|
| A 표지 3행 + 실제 헤더 | 77 | 77 | 77 | 0 | 0 |
| C 수량 동일·금액 변경 | 77 | 77 | 76 | 1 | 1 |
| D 수량 변경 | 77 | 77 | 76 | 1 | 1 |
| B 전량 동일 | 77 | 77 | 77 | 0 | 0 |

- C: `입고수량 1 = DPS수량 1`, `입고합계 11,000 ≠ DPS합계 12,000`, 「합계금액 불일치」 검출.
- D: `입고수량 1 ≠ DPS수량 2`, 「수량 불일치」 검출.
- 집계 카드 라벨은 「입고전표 라인」이며 출고 잔재는 0건이다.
- fresh `DpsCompareServiceTest` 18/18, `DpsExcelParserTest` 4/4 통과.

## ⑦ 스크린샷 · 행 수 · 경로

모든 PNG를 원본 해상도로 직접 열어 카드·상세행·복원 배너·저장내역을 확인했다. 캡처는 `resolveQaShotsDir()` 경유, Chromium headless, `-real-qa.spec.ts`로 실행했다.

| 번호 | 증거 | 상세 행 |
|---|---|---:|
| 01 | [A 실제 헤더 77/77/77/0](./screenshots/01-A-real-header-77-rows-real-qa.png) | 0 |
| 02 | [C 금액 불일치 77/77/76/1](./screenshots/02-C-same-qty-amount-mismatch-real-qa.png) | 1 |
| 03 | [D 수량 불일치 77/77/76/1](./screenshots/03-D-quantity-mismatch-real-qa.png) | 1 |
| 04 | [B 전량 일치 77/77/77/0](./screenshots/04-B-all-match-zero-mismatch-real-qa.png) | 0 |
| 05 | [E 정규화 수정 77/77/77/0](./screenshots/05-E-normalization-fixed-real-qa.png) | 0 |
| 06 | [F 정확행 우선 77/78/77/1](./screenshots/06-F-exact-first-fixed-real-qa.png) | 1 |
| 07 | [A AUTO_LATEST 저장 원본](./screenshots/07-A-auto-save-source-real-qa.png) | 0 |
| 08 | [AUTO_LATEST 새로고침 복원](./screenshots/08-auto-latest-restored-real-qa.png) | 0 |
| 09 | [명시 저장 직후 새 주제 미노출](./screenshots/09-manual-save-immediate-history-real-qa.png) | 목록 2행, 신규 0행 |
| 10 | [명시 저장 상세 복원](./screenshots/10-manual-history-restored-real-qa.png) | 0 |

## ⑧ 미구현 · 판정 불가 축

- 요청한 정규화 양방향, 거짓 일치, 정확행 우선 소비, 격리 V109 권한, AUTO/MANUAL 저장 복원, 헤더 탐색, A/C/D/B 회귀는 모두 판정했다.
- **판정 불가 축: 없음.**
- **미구현/불완전:** 명시 저장 성공 뒤 저장내역 query 무효화·재조회가 없어 신규 행이 즉시 표시되지 않는다. 새로고침이 필요하다.

## ⑨ CI 귀속

REST로 PR head `46462ff1588c12244431a8fdf7486fd6ff24f456`와 check-runs를 직접 확인했다. workflow job은 **22 성공 / 2 실패**다. `Set up job` 실패나 GitHub 장애는 없었다.

1. `빌드 + 테스트 (shared+auth+gateway)` — **PR 귀속 실패**
   - CI 원문: `AccountingPermissionProjectionFreshnessIT` 실패.
   - 로컬 fresh 재현 원문: `MANAGER|inventory.dps db=1100010 projection=1000010`.
   - 즉 V109는 CI Testcontainers DB에 적용돼 MANAGER CREATE 비트가 실제로 `1`이 됐지만, 체크인 projection `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts:123-167`은 이전 `1000010`으로 남았다.
   - 별도 fresh V109 권한 IT는 4/4 통과했다.
2. `Frontend Desktop` — **PR 귀속 실패**
   - 이 PR이 추적한 `docs/qa/1271-label-parity/renderer-5942.err` 때문에 extension census가 `.err` 미분류로 실패했다.
   - 원문: `expected ['.err'] to deeply equal []`, Desktop 전체는 300 files 통과·1 file 실패.

따라서 현재 CI는 green이 아니며 두 실패 모두 이 PR 산출물에 귀속한다.

## ⑩ 최종 판정 — 머지 불가 · 도달 결함 1건

**머지 불가 — 실 사용자가 화면으로 재현 가능한 도달 결함 1건.**

1. MANAGER 명시 저장은 서버·DB에서 성공하지만, 저장 성공 후 자동 전환된 저장내역 화면에 방금 저장한 행이 나타나지 않는다. 새로고침해야만 확인·복원할 수 있다.

1차 도달 3건 중 정규화, 정확행 우선 소비, MANAGER CREATE 403은 이번 SHA에서 모두 해소됐다. 다만 위 신규 화면 결함과 PR 귀속 CI 실패 2개가 남아 있어 머지할 수 없다.

## ⑪ 프로세스 회수

- 기동했던 branch auth-service `28081`, inventory-service `28085`, slip-service `28086`, renderer `5942`를 모두 종료했다.
- 격리 PostgreSQL `codex-1271-r2-pg`를 삭제했다.
- fresh Gradle Testcontainers PostgreSQL·Ryuk도 JVM 종료 후 회수된 것을 확인했다.
- 종료 확인 포트 `28081/28085/28086/5942/25471`: listener 0.
- 공유 `samhan-*` 컨테이너: 시작 전후 **24개**, 중지·재시작·변경 0건.
- 회수 직후 실행 컨테이너 총수는 24개였다. 최종 보고 직전 다른 세션의 Testcontainers PostgreSQL·Ryuk 2개(`sessionId=c726d8ed-...`)가 새로 나타나 총수는 26개지만, 본 검증 소유가 아니므로 건드리지 않았다. 본 검증 소유 컨테이너 잔여는 0개다.
- 임시 `-real-qa.spec.ts`와 임시 로그를 제거했다. 최종 작업트리 변경은 이 보고서 디렉터리뿐이다.
