# 현재 작업 — 2026-08-09 새벽 (야간 자율 진행 중)

> 개발책임자 취침 · PM 자율 진행. **이 문서만 읽으면 즉시 이어갈 수 있습니다.**

---

## 0. 🚨 아침에 결정해 주실 것 — 이것부터 읽어 주십시오

### ① #1145 회계전표 권한 — **이 PR 은 여기서 막혀 있습니다**

SOL 이 실 계정으로 라이브 로그인해 확인했습니다.

```
login=manager@samhan.test  loginStatus=200   role=MANAGER
accounting.sales-slip.accounting=            ← 비어 있음
/admin/sales-slips   status=403
/admin/purchase-slips status=403

kind     blocked_view_accounts immediately_loginable
purchase 13                    12
sales    13                    12
```

이 PR 은 *"FE/BE PageCode 불일치라서 13명이 403"* 이라는 진단으로 시작했는데, **그 13명은 애초에 `.accounting` 권한이 없습니다.** `V37` 이 그렇게 정한 것입니다. 진단이 업무 의미를 추론한 것이었을 수 있습니다.

**질문 1 — 회계전표(매출·매입)를 `MANAGER`·`SALES` 도 볼 수 있어야 합니까?**

| | 결과 |
|---|---|
| 예 | 권한을 부여하는 migration 이 필요합니다 (업무 정책 변경) |
| 아니오 | 지금 상태가 맞습니다. 403 나는 화면을 메뉴에 띄우던 것이 오히려 결함이었고, 이 PR 은 그대로 머지 가능합니다 |

**질문 2 — 수신 세금계산서도 같습니까?** 대상: `dev_manager` · `janyeonggu` · `manager@samhan.test` 3명 + `매니저` 그룹 1개

### ② 그 밖의 대기 목록

```
#1144  P0-A (VAT 표시 33,000원 차이) · P0-C (채무 원장) · P0-D (분개 인과)
       착수 승인 — 금액·원장에 닿아 PM 이 보류
#1142  역연산 API 4개를 별도 트랙으로 뺄지 함께 갈지
#896   재현 불일치 83건 처리 — 분류 라운드 진행 중, 결과가 결정 시트로 나옵니다
#922   바로빌 계약·자격증명 (착수 블로커)
```

---

## 1. 밤 사이 한 일

### 머지 3건
| PR | 이슈 | 머지 SHA |
|---|---|---|
| #1138 QA 증거 덮어쓰기 가드 | #1116 ✅ | `70677436d` |
| #1137 적용 Flyway 마이그레이션 편집 가드 | #1136 ✅ | `e027bf6bf` |
| #1120 전역 입력 UX | #825 ✅ | `6e05ec9f3` |

### 잡은 결함 셋 — 셋 다 원문을 직접 열어서 나왔습니다

**#1124 출고 마감시각 게이트가 자정 넘어 통째로 풀렸다** (`bc00649af`)
```java
// 결함
if (!slipDate.equals(LocalDate.now(clock.getZone()))) return;
// clock 에서 존만 꺼내 쓰고 시각은 실제 시스템 시계
```
테스트가 `TODAY = 2026-08-08` 을 고정해 두어, 날짜가 넘어가자 첫 관문에서 조기 return. **마감을 초과해도 아무것도 막지 않았습니다.** 어제까지 우연히 green 이던 테스트입니다. `LocalDate.now(clock)` 으로 고쳐 `tests=20 failures=0` 확인(PM 직접 `--rerun-tasks`).

**#1145 migration 이 MANAGER 에게 회계전표 전권을 줄 뻔했다** (`0e31a5933`)
```
role       .list   .accounting
MANAGER    1111    0000     ← 복제하면 0000 → 1111
SALES      1000    0000
```
V97 이 `.list` 비트를 정본 코드로 복제하는 구조였습니다. **적용 전이라 머지 전에 잡았습니다.**

**main 을 깬 것은 PM 이었다**
`#896` P0 스크립트를 하네스 가드 확인 없이 커밋했습니다. 지금 고치는 중입니다.

---

## 2. 🚨 PM 이 낸 오류 — 같은 함정 세 번째

구현자가 `const baselineDir = 'docs' + '/qa/...'` 로 문자열을 쪼개 놓은 것을 **"스캐너 회피"** 로 판단해 되돌리고 커밋했습니다.

근거는 로컬 실행이었는데, **위반 목록이 124건이라 vitest 메시지가 잘렸고 잘린 앞부분에 없다는 이유로 "없다" 고 결론냈습니다.** CI 는 정확히 그 파일을 잡았습니다.

구현자의 쪼개기는 회피가 아니라 **유일한 수단**이었습니다 — 가드가 `copyFileSync(원본, 목적지)` 의 **인자 전체**를 쓰기 대상으로 세고 전이 폐포까지 있어 중간 변수로도 못 피합니다.

지금은 문자열로 숨기는 대신 **가드가 목적지만 세도록 정밀화**하는 라운드가 돌고 있습니다. 메모리에 남겼습니다 → `feedback_exit_code_measurement_traps.md` 함정 3.

---

## 3. 트랙별 상태

### #1124 마감날짜 — 머지 직전, main 만 기다림
브랜치 `feat/1123-closed-date-guard` · 워크트리 `t1123` · HEAD `3cb7f0daa`
```
게이트 ①  도달 결함 0        SOL 재수렴 + 라이브QA 진행 중
게이트 ②  CI                 실패 2잡 — 둘 다 같은 가드 하나(main 원인)
게이트 ③  라이브QA           진행 중
```
재배포 완료: `slip-service` (2026-08-09 00:56 KST · healthy)

🔑 이 트랙의 교훈: `inspect()` 하나 → 복원·revision → PUT/DELETE 로 **세 번 반복된 뒤에야** 전수 차집합으로 바꿨고, 그러자 8개가 한 번에 나왔습니다.

### #1145 회계전표 P0-B — 판단 대기
브랜치 `feat/1144-accounting-slip-spec` · 워크트리 `t1144` · HEAD `a1837c93c`
R1→R2→R3 완료, 코멘트 3건 게시. 🚫 **더 이상 fix 라운드 돌지 않습니다** — 남은 것은 엔지니어링이 아니라 결정입니다.

### #896 구글 의존성 제거 — 조사 완료 · P0 완료
```
수식 인벤토리   3,391건 → 2,648그룹
parity          불합격 확정 (같은 커밋 재측정으로 confound 제거)
시트 탭         27개 중 code-read 17개 전부 CSV 확보
열 계약         납품가-2 = 문맥 가격 · 141개는 배분 "가중치"
재현 검증       일치 22 · 불일치 83 · 판정불가 36   ← 분류 라운드 진행 중
셀 의미         $L$2·$I$1 = 변동DC 여부 · '용량' 단위 = kW (개발책임자 답변)
```
🚨 앱 기본 소스는 **이미 DB** (`CATALOG_SOURCE` 기본값 `db`).

### #1142 되돌리기 — B 범위 확정
```
🚨 품목·금액 수정은 DRAFT/SAVED 에서만 가능 → 거기까지 되돌려야 함
🚨 역연산 없는 재고 API 4개: deduct · ship-batch · lots/inbound · instances/batch
되돌림 대상 60건 (INBOUND 20 + OUTBOUND 40)
설계안: docs/dev-reports/2026-08-08-1142-inverse-ops-design.md
```

---

## 4. 운영 규칙 — 이번 세션에서 배운 것

```
🚨 부재를 증명하려면 목록이 온전한지부터 확인한다
   잘린 출력에 grep 해서 "없다" 는 근거가 아니다. 판별축은 git ls-files
🚨 구현자가 이상해 보이는 코드를 썼으면 무엇을 피하는지부터 확인한다
   되돌리기 전에 되돌린 상태를 실제로 재라 — CI 로
🚨 이슈를 늘리지 말고 기존에 흡수한다 (개발책임자 지시)
🚨 codex 잔재를 죽이기 전에 워크트리를 먼저 본다
🚨 "구현됐다" 는 기록을 그대로 믿지 않는다
🚨 docker compose up --build <svc> 는 의존 서비스까지 빌드하려다 실패한다
   → --no-deps 를 붙인다 (eureka jar 없어 재배포가 조용히 안 됐던 실측)
```

---

## 5. 환경

```
Docker   slip-service = #1124 브랜치 빌드 (3cb7f0daa 시점, 00:56 KST)
         override 필수: -f docker-compose.yml -f docker-compose.local-all.yml
                        -f docker-compose.slip-port-override.yml
         재배포는 --no-deps 와 함께
SA 키     C:\dev\samhan-homepage-260f8ae469cc.json  (프로젝트 상위 폴더)
시트 CSV  scratchpad/live_sheet* · live_sheet_more
```

🚨 **백엔드를 바꿨으면 push 직후 PM 이 재배포한다.**
