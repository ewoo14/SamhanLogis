# PR #1170 D-G1 S4a SOL 5.6 재검토6 — 머지 판단

- 대상 HEAD: `02554c793c67ecc434a8c34c44887861ccc02347`
- 기준: S4a 재검토6, 비ASCII 전수·UTF-8 가드 적대검증·PowerShell 5.1 직접 생성·9종 mutation·RED-B·라이브 QA
- git 조작: 0건
- 공유 DB write: 0건
- 판정: **MERGE BLOCKED — BLOCKING 2건**

## 1. 결함 및 지시서

### SOL-S4A-R6-01 — UTF-8 무결성 가드가 한글 mojibake를 놓친다 (BLOCKING)

현재 가드는 `accounting-slip-permission-contract.test.ts:89-94`에서 다음 네 조건만 검사한다.

```ts
expect(refreshScript).not.toContain('횞')
expect(refreshScript).toContain('PERMISSION_ROLES × PERMISSION_PAGE_CODES')
expect(dbSnapshot).not.toContain('횞')
expect(dbSnapshot).toContain('PERMISSION_ROLES × PERMISSION_PAGE_CODES')
```

뮤테이션 실측:

| 변이 | 결과 |
|---|---|
| generator의 `×`를 U+FFFD로 변경 | RED |
| snapshot의 `×`를 `횞`으로 변경 | RED |
| 같은 generator의 사용자 노출 한글 오류 문구 `DB 파생 …`를 유효한 유니코드 mojibake `DB ?뚯깮 …`로 변경 | **15/15 GREEN** |
| 정상 복원 | 15/15 GREEN |

즉 이 테스트는 “UTF-8 문자 무결성” 전수 가드가 아니라 `×` 문장 한 건의 정적 가드다. 이번 결함처럼 mojibake가 유효한 유니코드이면 strict UTF-8 decode도 성공하므로, decoder만 추가해도 막히지 않는다.

수정 지시:

1. generator·생성 snapshot·관련 checker의 **모든 비ASCII run/line을 canonical inventory로 고정**한다. 전체 파일 hash보다 비ASCII inventory가 의도된 ASCII 데이터 갱신과 분리되어 적절하다.
2. 최소한 generator의 한국어 오류 문구 8종, 한국어 주석, `×`; snapshot의 `×`; checker의 `↔`, `×`, 한국어 JSDoc을 exact 단정한다.
3. 적대 테스트에 (a) `×` 손상, (b) 한국어 오류 문구의 valid-Unicode mojibake, (c) checker 기호/한글 손상을 각각 넣어 모두 RED임을 증명한다.
4. 정상 파일은 strict UTF-8 decode와 canonical inventory를 모두 GREEN으로 통과해야 한다.

### SOL-S4A-R6-02 — 추적 라이브 스펙이 `-real-qa` 분류 규약 밖이다 (BLOCKING)

PR의 추적 스펙은 다음 경로다.

```text
clients/desktop/playwright/dg1-s4a-sales-commission-settlement/dg1-s4a.spec.ts
```

디렉터리와 파일명 어느 쪽도 `-real-qa` 접미사가 없다. 이 파일은 실제 화면 QA와 증거 PNG 생성을 수행하지만, 이름 때문에 `playwright.real-qa.config.ts`의 `**/*-real-qa.spec.ts` 집합에 들어가지 않고 real-QA scope/cleanup 규약의 분류를 우회한다. `resolveQaShotsDir()` 사용 자체는 정상이다.

수정 지시:

1. 예: `playwright/dg1-s4a-sales-commission-settlement-real-qa/dg1-s4a-sales-commission-settlement-real-qa.spec.ts`로 디렉터리와 파일명을 함께 변경한다.
2. 관련 실행 명령·보고서 참조를 새 경로로 동기화한다.
3. `npm run typecheck`의 real-QA scope/cleanup 테스트와 `playwright.real-qa.config.ts`의 명시 경로 실행을 모두 통과시킨다.
4. 증거 경로는 현재처럼 `resolveQaShotsDir()`만 사용한다.

## 2. 비ASCII 전수 육안 감사

strict UTF-8 decode 후 모든 비ASCII line을 출력해 원문을 눈으로 읽었다.

| 파일 | 비ASCII line | 판정 |
|---|---:|---|
| `scripts/refresh-accounting-permission-db-snapshot.ps1` | 14 | BOM 1, 정상 한국어 주석/오류 문구 12, `×` 1 |
| `accounting-slip-permission-db-snapshot.ts` | 1 | `PERMISSION_ROLES × PERMISSION_PAGE_CODES` 정상 |
| `accounting-slip-permission-snapshot.ts` | 0 | ASCII only |
| `accounting-slip-permission-contract.test.ts` | 4 | 의도된 negative sentinel `횞` 2, 정상 `×` 2 |
| `permission-contract-checker.ts` | 7 | `↔` 2, 정상 한국어 JSDoc 3, `×` 2 |

다섯 파일 모두 strict UTF-8 decode 성공, U+FFFD 0이다. 생성기/생성 snapshot에 남은 실제 mojibake는 보지 못했다. `횞`은 산출물이나 오류 문구가 아니라 현재 가드의 negative sentinel에만 2회 존재한다.

## 3. PowerShell 5.1 직접 생성과 육안 확인

- 런타임: Windows PowerShell `5.1.26100.8972`
- 공유 DB 대신 전체 migration을 적용한 일회성 PostgreSQL 컨테이너를 사용했다.
- 실행 2회 모두 exit 0.
- 전/1회/2회 SHA-256 동일:
  `8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B`
- 생성물: 15,818 bytes, LF-only 413줄, CRLF 0, BOM 없음.
- 생성물 4행을 직접 읽은 원문:

```text
// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.
```

- `횞` 0, U+FFFD 0.
- 생성한 컨테이너/네트워크는 종료·제거했다. 2026-08-09 생성의 기존 미연결 network `accounting-permission-refresh-77c5a160cfc8`은 타 작업 소유라 건드리지 않았다.

## 4. 9종 mutation 회귀

각 변이는 RED 확인 직후 원복했다.

| # | 변이 | 결과 |
|---:|---|---|
| 1 | bucket snapshot ACCOUNTANT target을 `1000000`과 `1110000`에 중복 | RED, duplicate snapshot cell |
| 2 | TS DB snapshot MASTER target을 `0000000`과 `1110000`에 중복 | RED, duplicate projection cell |
| 3 | 같은 TS 중복을 Java freshness parser가 읽음 | RED (`--rerun-tasks`; 일반 Gradle cache 결과는 근거에서 제외) |
| 4 | freshness DB query에 ACCOUNTANT/accounts 중복 row 추가 | RED |
| 5 | mock ACCOUNTANT edit source에 target 중복 | RED |
| 6 | V101 DRIVER grant 초과 | RED |
| 7 | V101 ACCOUNTANT grant 누락 | RED |
| 8 | V101 MASTER row 중복 | RED |
| 9 | MASTER 중복 + DRIVER 초과 조합 | RED |

복원 후:

- desktop exact permission contract: **15/15 GREEN**
- `SalesCommissionSettlementPermissionSeedTest`: **5/5 GREEN**
- `AccountingPermissionProjectionFreshnessIT`: **2/2 GREEN**
- V101 SHA-256: `B173883CED1D2A54A0FE378285DA460D03011EDA110E409D42DCC7D2D1C12327`

## 5. RED-B 보존

| 표면 | 재검증 결과 |
|---|---|
| V101 정상 | 5/5 GREEN, 11역할 exact 계약 |
| SALES runtime deny | 라이브 QA에서 직접 route가 dashboard로 복귀, 메뉴 0 |
| accounting HTTP 403 | `SalesCommissionSettlementHttpGuardIT` 1/1, 실제 HTTP 403 + `FORBIDDEN` |
| activeTargets | 33 entries / 33 unique / target 1 |
| 회계 렌더 메뉴 | 44 exact |
| 권한 matrix 회계 pageCode | 62 entries / 62 unique / target 1 |
| 기존 route | MASTER 43/43 hash 유지, NotFound/login 0 |
| native Link | 목록 2행 모두 실제 `A` element |
| scroll | `720 → detail → back → 720` |
| UUID | ACCOUNTANT visible body 정규식 0; 내부 route key로만 사용 |
| S1 채번 | NumberSequenceIT 9/9 |
| S2 versioned | RateVersionIT 2/2 |
| CONFIRMED snapshot | CalculationSnapshotTest 2/2 |
| desktop 전체 | **2,167 passed / 1 skipped / 0 failed** |
| accounting 전체 | **1,871 tests / 0 failures / 0 errors / 10 skipped** |
| typecheck | exit 0, TS + real-QA cleanup/scope GREEN |

## 6. 직접 Playwright 라이브 QA

- 실행 위치: `clients/desktop`
- 런타임: `@playwright/test` 1.59.1, headless Chromium-1217 계열, project `renderer`
- 임시 스펙 경로: `playwright/dg1-s4a-sol-review6-real-qa/dg1-s4a-sol-review6-real-qa.spec.ts`
- 디렉터리·파일명 모두 `-real-qa`, screenshot path는 `resolveQaShotsDir()` 경유
- renderer: `VITE_MOCK_MODE=1`, `vite src/renderer --config vite.config.ts`, HashRouter
- 다른 워크트리의 8080 응답 혼입을 막기 위해 `VITE_API_BASE_URL=http://127.0.0.1:59999`로 격리; 포트는 사전 미사용 확인
- 최종 결과: **3 passed (11.6s)**
- 관측: native links 2, UUID visible false, scroll `720->720`, menu 44, legacy routes 43, failures 0, SALES denied true
- 기동한 Vite PID `109512`만 종료, 5196 listener 0. 타 프로세스는 조작하지 않았다.
- 임시 스펙/빈 디렉터리는 실행 후 제거했다.

QA 증거:

1. [ACCOUNTANT 목록](../qa/2026-08-11-dg1-s4a-sol-review6/01-accountant-list.png)
2. [DRAFT 상세](../qa/2026-08-11-dg1-s4a-sol-review6/02-accountant-draft-detail.png)
3. [CONFIRMED 상세](../qa/2026-08-11-dg1-s4a-sol-review6/03-accountant-confirmed-detail.png)
4. [목록 scroll 720 복귀](../qa/2026-08-11-dg1-s4a-sol-review6/04-accountant-list-back-720.png)
5. [SALES 차단](../qa/2026-08-11-dg1-s4a-sol-review6/05-sales-denied.png)
6. [관측 JSON](../qa/2026-08-11-dg1-s4a-sol-review6/qa-observation.json)

모든 PNG를 생성 후 직접 열어 한글, 역할, 목록/상세 상태, SALES dashboard 낙착을 육안 확인했다.

## 7. 탐색 실행 정리

초기 교차검증에서 `vite.web.config.ts` BrowserRouter 및 현재 다른 서버의 8080 응답을 사용했을 때 `/accounting/admin/migration-ops`가 401로 세션을 지워 `/login`으로 이탈했다. 원인은 이 기존 화면의 `/dashboard/ecount-mig` mock fixture 부재와 외부 8080 상태 혼입이었다. 정식 renderer HashRouter를 비사용 API 포트로 격리한 최종 실행에서는 43/43이 통과했으므로, 이 탐색 결과는 PR 결함 수에 포함하지 않았다. 실패 탐색 PNG도 최종 증거에서 제거했다.

## 8. 이 라운드가 보지 않은 표면

- Electron 패키징 산출물에서의 네이티브 window/preload 동작
- production web BrowserRouter 배포와 service worker
- 실제 공유 auth/accounting 서비스 계정으로 수행하는 end-to-end UI
- 모바일/PWA 화면
- 전체 Playwright mock/real-QA 집합 전체 실행(이번 라이브는 S4a 표면 3개만 실행)
- 실제 운영 데이터의 금액·정산 결과 정확성 및 부하/장시간 polling

## 9. PM 머지 판단

**현재 머지 금지.** R6-01과 R6-02를 모두 수정하고 다음을 재제출해야 한다.

1. 한글 valid-Unicode mojibake mutation RED + `×`/`↔` mutation RED + 정상 GREEN.
2. 추적 S4a live spec의 디렉터리·파일명 `-real-qa` 정규화 및 scope/cleanup GREEN.
3. PowerShell 5.1 2회 SHA 동일, LF 413, no BOM과 9종 mutation RED 재보존.
4. desktop/accounting/typecheck/V101 및 본 라이브 QA 재실행.

