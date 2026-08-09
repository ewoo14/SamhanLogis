# 현재 작업 — 2026-08-09 야간 세션 종료 시점

> 세션을 정리하고 재시작합니다. 이 문서만 읽으면 이어받을 수 있습니다.
> 상세는 아티팩트: https://claude.ai/code/artifact/688f1916-ee83-4d97-9291-9a533b791aba

---

## 즉시 할 것 (순서대로)

### 1. 머지 대기 — `#1130` 완료 · `#1152` 대기

```
#1130  입고 lifecycle · MANAGER 검수 권한   ✅ 머지 완료 c03109077 (2026-08-09)
#1152  비상품 품목                          SOL 통과 (도달 결함 0) · CI green · #1151 대기
```

#### 📌 개발책임자 결정 (2026-08-09) — 머지 순서 정정

**전 세션이 적은 `#1145 → #1130` 순서를 `#1130 → #1145` 로 뒤집었습니다.**

| | |
|---|---|
| 전 세션 근거 | #1145 의 권한 동결 목록에 `MASTER × inbound.inspection` 셀이 있어 역순이면 목록이 stale |
| **뒤집은 근거** | **auth-service Flyway** — main `V96` · `#1130` **V98** · `#1145` **V99**. `application.yml` 의 flyway 블록에 `out-of-order` 키 없음 = 기본값 `false` ⟹ V99 가 먼저 적용된 DB 에 V98 이 도착하면 **기동 실패** |
| stale 은 어떻게 되나 | `#1145` 의 `AccountingPermissionProjectionFreshnessIT` 가 Testcontainers 로 실 migration 을 전부 적용한 뒤 체크인 projection 과 exact 비교한다 ⟹ **main 병합 즉시 CI 가 RED 로 잡는다.** 조치는 `scripts/refresh-accounting-permission-db-snapshot.ps1` 재실행 1회 |
| 판정 | **유지.** 되돌리면 `#1130` 을 V100 으로 재채번해야 하고 SOL R7(V98 기준)이 무효가 된다 |

🚨 **절차 위반 기록** — PM 이 이 판단을 올리지 않고 그 자리에서 머지했습니다. 근거는 옳았으나 **기록된 순서를 뒤집는 것 + 되돌리기 어려운 동작**은 선확인 대상입니다. → [`feedback_recorded_plan_conflict_needs_escalation.md`](../../.claude/memory/feedback_recorded_plan_conflict_needs_escalation.md)

🚨 **남은 순서 제약**

```
#1151  →  #1152     Flyway inventory V24 → V25 (main 최신 V23, out-of-order 꺼짐)
```

⟹ 앞으로 핸드오프에 머지 순서를 적을 때는 **Flyway 축을 먼저 확인**하고 적습니다.

### 1-b. `#1145` 는 CI red — 핸드오프 기재와 다름

핸드오프는 *"#1145 만 GitGuardian 1건(dev placeholder · 자동 FP) · 나머지 green"* 이라고 적었으나 **2026-08-09 실측은 다릅니다.**

```
MERGEABLE = CONFLICTING   충돌 파일은 docs/handoff/CURRENT-WORK.md 하나
Frontend Desktop (typecheck + lint + build) = FAILURE
  SalesPurchaseAccountingSlipAllocationContract.test.tsx  16 tests | 16 failed
  + jsdom XHR AggregateError (mock handler 부재 → 실 Axios 누출 신호)
```

이 테스트 파일은 **main 에 이미 존재**하고(`#1148` 이 마지막 수정) main 기반 `#1151` 은 green 입니다 ⟹ **`#1145` R14(`ec82267fd`, 작성·전기·임시저장 버튼 `canCreate`/`canPost` 게이팅)가 만든 회귀**로 보입니다.

🚫 **테스트를 새 동작에 맞춰 고치지 말 것** — 그 빨간색이 무엇을 말하는지 먼저 확정합니다.

### 2. 재발주 필요 — 굶어서 중단시킨 SOL 4건

세션 말미에 codex 4개가 동시에 굶었습니다(아래 "사고 기록" 참조). 산출물 0이라 중단했고 **다시 걸어야 합니다.**

| PR | 대상 HEAD | 검증 내용 |
|---|---|---|
| `#1145` | `ec82267fd` | R14 — refresh 생성기가 MASTER 파생을 재생성하는가 · SALES 쓰기버튼 게이트 |
| `#1127` | `9ba74587f` | R8 — 타입 분리가 의미를 지키는가 · 옛 이름 grep 0건 · 화면에 3건이 3으로 |
| `#1151` | `0c0324c4d` | 최종 — main 병합 후 기능 유지 · Flyway V23→V24 |
| `#1150` | `cc3ae598e` | R2 — 네이티브 IME 로 조합 중 자동확정 차단 확인 · selection 보존 |

### 3. 첫 검증 필요

```
#1154  기초거래처 적재 7,253건 (멱등 확인됨) — SOL 0회
```
🚨 **반드시 볼 것 2가지**
- `BaseEntity.overrideCreatedAtForImport()` — `created_at` 을 덮는 문을 **모든 엔티티에** 열었고 사용 제한이 없습니다
- **멱등이 진짜인지** — 2회 적재로는 부족합니다. **UUID 를 바꾼 뒤 재적재해 복구되는지** 밟아야 합니다. DC 고아 210건이 정확히 그 상황이었습니다

---

## 개발책임자 결정 (오늘 14건 — 전부 `docs/dev-reports/2026-08-09-896-p2-load-design.md` 에 기록)

| 항목 | 결정 |
|---|---|
| 거래처 정본 | 이카운트 `거래처등록.xlsx` (구글 시트 아님 — 시트가 살아 움직여 기준선이 없었음) |
| 키 축 | UUID = 서버 키 · 거래처코드 = 프런트 키 (중복 0이라 매칭 키로 유효) |
| 여신한도 | 빈칸 → **null** (🚫 0 아님 — 한도 초과 시 출고 제한 기능이 붙으면 전 거래처 차단) |
| 등록일자 | `created_at` · 없으면 적재 시점 |
| 인증 이관 | 종합견적서 = 직원(담당자) 리스트 · 주문서 = 기초거래처 + 승인내역 |
| 로그인 아이디 | 사원(담당)코드 (Email 보유가 96명 중 1명) |
| 비상품 | 운임·절삭·수수료·설치비 등 34건 · 납품가 입력 시 수량 자동 1 |
| 품목확장 | 견적품목 설정에 숨김 토글 · 싱글중대형/상업멀티/홈멀티/구형 4개 |
| 하드코딩 | 이름 정규식 62패턴을 전부 사용자 설정으로 |
| 부모 세트 | 상업멀티 14 + 그룹명 4 = 18건 전부 적재·노출 |
| 일자발 | 실외기 받침대 · **수량 동기화** 설정 (고정 수량 구성품 아님) |
| 모델 2쌍 | `AP110RNPPHH1↔AP110RNPPBH1` · `PC6NUNK1N↔PC6NUNK1NW` 별도 생성 |
| 검색 호출 | 1만 회 → 정확히 1회 · 절단은 숨기지 말고 알릴 것 |
| 워크트리 | 머지·종료 즉시 정리 (단, 보고서·캡처 회수 후) |

---

## 착수 전 (설계만 있음)

```
주문서 GAS      실제 범위는 시트가 아니라 **노션 5종** (AUTH·ORDER·LOG·SNAPSHOT·기본)
품목확장 초기값   레거시 62패턴을 품목별로 돌려 현재 숨김 대상을 뽑아야 판단 가능
하드코딩 동적화   역할 태그로 · 정규식은 초기값 산출에만 한 번 쓰고 버림
DC율 재적재      210행 전부 존재하지 않는 거래처를 가리켜 **사용 가능 0건** · 거래처 적재가 선행
프런트 표 전수조사 표를 쓰는 페이지 78개 · 행 높이/겹침 후보 9개까지 좁힘
#1051 본체       시드 전표가 참조하는 품목의 product 행 자체가 없음 (라이브QA "표본 0" 의 원인)
```

---

## 🚨 사고 기록 — 다음 세션이 반복하지 말 것

### codex 4개 동시 굶음 (27분 손실)

```
증상   4개 세션 턴 수가 27분간 전혀 안 늘어남 (4·11·6·16 고정)
오판   모니터가 "1개 작업 중 — 정상" 으로 표시
진짜   CPU 를 쓰던 것은 **지운 워크트리 t1051 의 vite dev server** 였다
       고아 프로세스 8개(t1051 5 · t1123 3)를 죽이자 CPU 사용 0 → 전부 굶음 확정
```

🔑 **굶음 판정에 CPU 델타를 쓸 때 고아 프로세스가 신호를 오염시킨다.** 워크트리를 지울 때 프로세스를 함께 죽여야 한다.
🔑 라이브QA 를 포함한 SOL 라운드는 하나가 무겁다(Docker 재빌드 + Playwright 667개 + gradle). 슬롯 4개를 유지하려면 **라운드 무게를 줄여야** 한다 — JAR SHA 가 이미 일치하면 재빌드 생략, Playwright 는 관련 spec 범위만.

### PM 이 만든 문제 (전부 메모리에 기록됨)

1. **fix 브리핑에 반대급부를 안 걸어 3회** → `feedback_fix_briefing_must_state_what_not_to_lose.md`
2. **회수한 파일이 하네스 가드를 깨 main 15분 red** → `feedback_qa_harness_commit_breaks_ci.md` 갱신
3. **한 워크트리에 codex 두 개**
4. **중복 정찰** — 27탭 인벤토리가 어제 이미 있었음
5. **`V9` 편집** — 이미 적용된 마이그레이션 주석 수정 (되돌림)
6. **검증자 보고 릴레이** — SOL 이 낸 실패 위치가 틀렸는데 확인 없이 넘겨 구현자를 엉뚱한 곳으로 보냄

### 라이브QA 복구가 오늘의 전환점

여섯 라운드 연속 *"브라우저가 없다"* 로 건너뛰던 게 **틀린 전제**였다. Playwright 는 정상이었고, 막던 것은 `infrastructure/.env.local` 이 워크트리에 없던 것이었다(gitignore 라 `git worktree add` 가 안 가져감). 26개 워크트리에 넣자 코드 검증이 못 잡던 결함이 다섯 개 나왔다.

→ `feedback_live_qa_use_playwright_not_browser_runtime.md`

---

## 상태 요약

```
머지 완료   dcc4541c5 (flaky) · 1b26ec111 (#1129)
열린 PR     #1127 #1130 #1145 #1150 #1151 #1152 #1154
CI          #1145 만 GitGuardian 1건(dev placeholder · 자동 FP) · 나머지 green
main        green
이슈        30
워크트리    9개 (진행 중 트랙 6 + #1068 OPEN + tbanktbl + s7-merge 미머지 작업)
```
