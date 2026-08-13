# 현재 작업 — 2026-08-13 집PC 세션 종료 (회사PC 에서 이어받음)

> 이 파일만 읽으면 이어받을 수 있습니다.

---

## 0. 🚨 이어받는 사람이 가장 먼저 할 것

```text
1  docker ps -a --filter "name=samhan-" --format "{{.Names}}\t{{.Status}}"
   🚨 있는 것만 읽지 말고 **없는 것을 세십시오**
2  git pull && .\scripts\sync-claude-memory.ps1
3  수치는 그 PC 에서 다시 세십시오 (양 PC 시드 상이)
4  열린 PR 7건의 CI 를 exact SHA 로 다시 확인하십시오
```

### 🔴 배포·복구 시 `--no-deps` 를 빠뜨리지 마십시오

`--no-deps` 없이 돌리면 postgres·eureka·gateway 가 재생성돼 스택이 `Created` 로 멈춥니다.

```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml \
  up -d --build --no-deps <svc>
```

🚩 **`-f docker-compose.local-portfix.yml` 은 집PC 전용이라 커밋되지 않습니다.**
파일 머리에 *"🚫 커밋 대상 아님 — 이 PC 한정"* 이라고 적혀 있습니다.
집PC 에서 `influxd` 가 `127.0.0.1:8086` 을 점유해 `slip-service` 호스트 포트 공개가 실패하는
문제를 피하려고 `8186` 으로 돌린 것입니다(2026-08-11 실측).
**회사PC 에서는 이 인자를 빼고 돌리십시오.** 같은 충돌이 나면 그 PC 에서 다시 만드십시오.

### 🔴 배포본이 main 보다 낡으면 서비스가 죽고, **없는 결함처럼 보입니다**

`#1143` 라이브QA 가 `2,027~5,099ms` 를 쟀는데 그 값이 **예전 timeout 설정과 정확히 일치**했습니다.
현재 commit 으로 신선 빌드하니 **`123ms`** 였습니다. **없는 결함을 고칠 뻔했습니다.**

⟹ 라이브QA 는 **띄운 스택이 현재 commit 의 빌드인지 먼저 확인**하고 원문을 남기십시오.

---

## 1. 🚩 이 세션에서 가장 크게 걸린 것 — CI 인프라

**`electron` postinstall 이 밤새 10회 넘게 실패했습니다.** 코드 문제가 아닙니다.

```text
npm error path clients/desktop/node_modules/electron
npm error command sh -c node install.js
npm error RequestError: socket hang up
npm error HTTPError:  Response code 503 (Service Unavailable)
```

영향받는 체크 — `Frontend Desktop` · `Desktop Playwright` · `Harness Guard` · `Docs Guard`

🔑 **판별법**: 실패 스텝이 `의존성 설치` / `npm ci` 이고 `node_modules/electron` 경로가 찍히면 인프라입니다.
그 뒤 `silent-skip 가드` 가 `results.json 없음` 으로 연쇄 실패하는 것도 같은 원인입니다.

⟹ **`gh run rerun <id> --failed`** 로 재실행. 코드를 고치지 마십시오.

---

## 2. 머지 완료 (이 세션)

| PR | 내용 |
|---|---|
| **#1195** | main 공통 2건 — `/app/version` 404 · 알림 API UUID 노출. 라이브QA 결함 0 · CI green |
| **#1187** | `#1111+#1143` 세트 구성품 — 드롭박스 2개(특징+형상) · 수량동기화 모달 + 부자재 칩. 라이브QA9 결함 0 · CI green. 이슈 `#1143`·`#1111` 종료 |

워크트리·브랜치 정리 완료.

### 정리 실행 결과

```text
잔여 프로세스   144개(node/codex/electron, ≈10GB) → 3개
고아 워크트리   17개 삭제
                🚩 w1191 · wmock 2개는 여전히 Device or resource busy
                   (다음 세션 시작 시 rm -rf 재시도)
```

---

## 3. 열린 PR 7건 — 상태와 다음 한 걸음

### 🟢 #1187 `#1111+#1143` 세트 구성품 — **머지 직전**

```text
게이트 ①  실 사용자 경로 재현 가능한 결함 0   ✅  (아래 정정으로 충족)
게이트 ②  CI green (exact SHA 44b1840cb)      ⏳  Desktop Playwright 진행 중
게이트 ③  라이브QA 실서버 실제 실행            ✅  라이브QA9
```

🔑 **라이브QA9 가 올린 결함 1건은 PM 이 요구값을 잘못 잡은 것**이었습니다. 개발책임자 정정:

> *"1187은 짧게 특징 값을 하기로 했잖아. 그러면 요구값을 변경해줘야지."*

```text
기본 · 유선 · 컬러                    ← ✅ 정본 (짧은 값). 현재 구현이 맞음
기본 · 유선리모컨 · 컬러유선리모컨       ← ❌ PM 이 잘못 넣은 요구값
```

⚠️ **데이터 정본은 그대로입니다** — 리모컨 모델코드는 `AWR-` 로 시작하고 `MWR-` 는 실 DB **0건**,
실 변형 분포는 `기본(188) · 유선리모컨(62) · 컬러유선리모컨(65)` 입니다.
이번 정정은 **드롭박스 라벨을 짧게 쓴다**는 것이지 데이터 정본을 바꾸는 것이 아닙니다.

**다음 한 걸음** — Playwright green 확인 후 **머지**.

---

### 🟢 #1181 `#910+#935` 클라이언트 자동 업데이트 — **인프라 재실행만 남음**

```text
Applied Flyway Migration Guard   ✅ 통과 (b86cb28da)
arologis CI · QA E2E · CI        ✅
Harness Guard · Docs Guard       ⏳ electron 503 재실행 중
```

이 세션에서 고친 것 — **`origin/main` 에 이미 있는 `V7__app_release_client_identity.sql` 을 수정**하고 있었습니다.
체크섬 불일치로 기존 DB 가 기동 불가가 될 뻔했습니다.

```text
V7   origin/main 과 바이트 동일하게 원복
V8   __add_internal_chat_desktop_client_type.sql 신설
     DROP CONSTRAINT IF EXISTS → pg_constraint 확인 후 ADD
     ⟹ V7 적용 DB · fresh DB 양쪽에서 같은 최종 상태
번호 근거  이 브랜치 / origin/main / 머지 안 된 열린 PR 전체 → V8 충돌 0
```

🚩 직전에 보였던 `Vitest worker unexpected exit` 은 **재현되지 않았습니다** (`264 files / 2,281 tests / 2 skipped`). 고치지 않았습니다.

**다음 한 걸음** — 두 가드 green 확인 후 **머지**. `#910` 배포처·코드서명·채널 분리는 **결정 대기**.

---

### 🔴 #1196 견적 화면 거래처 DC 미적용 — **CI 실패 (진짜 결함)**

**개발책임자 결정: 소급 안 함.** 신규 견적부터만 DC 적용, 기존 견적 5건은 저장 금액 그대로.

```text
DC 거래처 신규 견적      316,800원 → 266,800원
DC 없는 거래처           316,800원 유지
기존 견적 5건            소급 계산·DB 쓰기 0
```

🔴 **그런데 CI 가 실패합니다.**

```text
src/renderer/utils/estimatePrice.test.ts:29
  expect(...).toEqual({ unitPrice: 266800, appliedRate: 0 })
  -   "unitPrice": 266800,
  +   "unitPrice": 316800,
```

⚠️ 구현자는 *"관련 테스트 최종 165/165 통과"* 라고 보고했는데 **CI 와 어긋납니다.**
필터된 부분집합만 돌린 것으로 보입니다. **증거 무결성 문제이므로 다음 라운드에서 정정해야 합니다.**

### 라이브QA (화면 축) 결과 (`a655e8c46`) — 결함 2건

금액은 **화면 축으로도** 정상입니다.

```text
DC 신규 견적       266,800원
비DC 견적          316,800원
기존 견적 5건      변경 없음      ← 소급 안 함 결정 준수
변환된 전표        266,800원 · 이중 할인 없음
collab API         400/403/404/500  0건
```

🔴 **결함 2건**

```text
① 견적 → 전표 변환 후 견적 상세에 전표로 가는 링크가 없다
   사용자가 판매관리에서 전표를 다시 찾아야 함
② 판매전표 상세 URL 과 관련 API 요청·응답에 UUID 노출
   (화면 본문 UUID 는 0건)
```

🚩 **증거 무결성 정정** — 구현자 `165/165` → 실측 **`175/175`**

🚩 **미해소 — 라이브QA 와 CI 가 어긋납니다**

```text
CI (81e61678e)   estimatePrice.test.ts:29  expect 266800 → 실제 316800   ❌
라이브QA          관련 테스트 전량 175/175                                ✅
```

⚠️ **둘 중 하나가 다른 경로를 재고 있습니다.** 이 트랙은 애초에 *"API·DB 축 266,800 / 화면 축 316,800"* 으로 갈라져 시작된 건이라 **이 불일치 자체가 발견일 수 있습니다.**

**다음 한 걸음** — CI·라이브QA 불일치 규명을 **첫 질문**으로 → 결함 2건 fix (RED-first) → 재검증.

---

### 🔴 #1189 `#1142` 검수완료 전표 되돌림 — **CI 실패 3건 (재확인 필요)**

`origin/main`(`#999` opaque token) 머지 완료. **UUID 결함은 그 머지로 자연 해소**됐습니다.

```text
충돌 2건 — 서로 다른 기능이라 양측 보존
  slip.ts                  getSlipRevertability(읽기 전용)
                         + main 의 getSlipByNumber·getOutboundSlipBySlipNo
  StockInstanceRepository  전표번호 count(판정용) + main 의 serialKey 조회
  SlipController           main 의 String id + OpaqueUuidDeserializer.decode
                         + S1 판정 endpoint — 충돌 표식 0
```

### ✅ 적대검증 결과 (`feb147c28`) — 핵심 불변식은 통과

```text
판정 전후 전표·재고·배차 스냅샷 해시   완전 일치   ← 🔑 "아무것도 되돌리지 않는다"
13건 판정                              13/13 일치
목록·검색·신규/구형 상세               정상
상세 URL·화면·전표 상세 응답 UUID      0
collab 400/403/404/500                 0건
머지 충돌 2건                          양쪽 기능 보존 확인
```

### 🔴 결함 3건 — UUID 노출

```text
① /inventory/warehouses                 id UUID 4개
② collab/presence · presence/join       sessionId UUID
③ 완료 전표 목록 응답                    레거시 salesPersonName 에서 UUID 1개
```

🚩 ②는 오늘 세 트랙에서 반복해서 샌 `collab/*` 계열입니다.
🚩 ③은 **레거시 필드**라 새 계약이 안 덮은 구멍 — **기존 행**에서 나왔습니다.
🔑 fix 는 `OpaqueUuidSerializer` 경로를 옮기십시오. 새 방식 발명 금지.

### 🚩 증거 무결성 — 구현자 실측이 재현되지 않았습니다

| | 구현자 보고 | 실측 |
|---|---|---|
| 목록 응답 UUID 노출 | `0건` | **③ 재현됨** |

### 🔴 CI 실패 (`b345ff4c9` 기준, 미해소)

```text
Frontend Desktop      vitest 1 failed / 2286 passed — codef-scope-conflict (:245)
빌드 + 테스트          :services:slip-service:test 실패
Desktop Playwright    electron 503 (인프라)
```

⚠️ 머지 커밋 라운드에서 구현자가 **slip-service 전량을 못 돌렸고**(timeout) **desktop typecheck 도 못 했습니다**. CI 가 정확히 그 미검증 구간에서 터졌습니다. **미실행은 검증 안 된 것입니다.**

**다음 한 걸음** — UUID 3건 fix (RED-first, 응답 본문·URL 양쪽 훑는 테스트) → CI 2건이 이 브랜치 회귀인지 main 공통인지 규명.
🚨 `#1142` 되돌림 **권한·범위·연결 처리·이력**은 **결정 대기** — S1 을 넘어가지 마십시오.

---

### 🟡 #1197 견적서 관리 2페이지 분리 — **구현 완료 · 회귀 2건 fix 필요**

**개발책임자 신규 결정 (오늘).** `#1092` 가 만든 하단 「통합 목록」 표를 없앱니다.

> *"그냥 견적서 관리 메뉴에는 페이지를 2개로 나눠서 '종합견적서', '주문서' 이렇게 구분하여 각 웹에서 저장하는 견적서를 2페이지로만 나누도록 하자."*
> *"견적서 관리 메뉴가 있으면 상관 없잖아."*

```
견적서 관리  (/sales/estimates)
 ┌──────────┐┌───────┐
 │ 종합견적서 ││ 주문서 │
 ┴──────────┴┴───────┴────────────────
 출처      문서번호       거래처    금액
 데스크톱  2026/08/13-1   대영   3,168,000
 웹        Q-260812-004   한성   2,240,000
```

| 페이지 | 담는 것 |
|---|---|
| **종합견적서** | 데스크톱 작성 견적서(`estimate`) **+** 웹 종합견적서 저장분(`web-quote-snapshot`) |
| **주문서** | 웹 주문서 저장분(`web-partner-order-draft`) |

- 데스크톱 작성 견적서는 **'종합견적서' 페이지로 합칩니다** (개발책임자 확정).
- 🚫 **`주문서 관리`(`/sales/partner-orders`) 는 건드리지 않습니다.**
- 🔑 **통합 목록이 지금 웹 저장분을 볼 유일한 경로**입니다. 없애기만 하면 회귀입니다.

### 판매 계열 내부 페이지 전수 sweep — **지울 것이 없었습니다**

개발책임자 추가 지시: *"견적서 관리 페이지뿐 아니라 주문서나 관련 페이지 내부에 있는 페이지들도 모두 삭제."*

```text
전수 13개 항목 조사      비유일 삭제 대상  0건
나머지는 전부 자기 메뉴 소관
  (주문서 라인·전환표·협업 패널·DC 이력·승인 미리보기 등)
⟹ 기능 삭제 0 · 죽은 링크·라우트 0
```

보고서: `docs/dev-reports/2026-08-13-1092-remove-embedded-pages-luna.md`

### ✅ 유일 경로 2건 — 개발책임자 결정 완료

| 항목 | 위치 | **결정** |
|---|---|---|
| **A. 카테고리별 단가변동** | `EstimatePricingConfigPage.tsx:174–545` | 🔨 **제품 메뉴로 옮긴다** |
| **B. 웹 저장분 상세** | `WebEstimateSourceDetailPage.tsx:13–55` | ✅ **그대로 둔다** |

**A 는 아직 미착수입니다.** `products.price-schedule` 권한과 API 는 이미 있는데 **제품 메뉴에 라우트가 없어** `/sales/estimate-config` 안이 유일 경로였습니다.
⟹ 제품 메뉴에 라우트를 먼저 만들고 옮기십시오. 🔑 **옮기기 전에 데이터 접근 공백이 생기지 않게** 하십시오.

### 🔴 이 트랙 회귀 2건 — 다음 라운드 첫 작업

```text
pretest 실패    estimateSourceSeparatedListModel.ts:94:14
                requesterName raw actor display read
mock.test.ts    새 테스트의 '데스크톱-견적-1' · 'Q-2026-001' 이
                문서번호 계약을 위반
```

🚩 나머지 Vitest 미통과 3건은 환경입니다 (`jest-dom` import 해석 실패 · `out/main` 미생성).
🚩 `npm run typecheck` 은 design-system `dist` 부재로 중단됐습니다.

**다음 한 걸음** — 회귀 2건 fix → A(단가변동 이동) 구현 → 적대검증 + 라이브QA.
🔑 라이브QA 에 **종합견적서 스냅샷 분기계산 왕복**을 반드시 넣으십시오 (§7 참조).

---

### ⏸️ #1188 `#922+#1098` 바로빌·알리고 — **외부 자격 확보 전 진행 불가**

### 🟡 #1180 `#901` 클로드 대화 — **결정 대기** (권한 범위 · 되돌릴 수 없는 작업 포함 여부)

### 🔴 #1162 IT 임시 자격 전환 — **방치됨 (2026-08-10 이후 갱신 없음)**

```text
JUnit 테스트 결과 (accounting+partner)   FAILURE
빌드 + 테스트 (accounting+partner)       FAILURE
GitGuardian Security Checks              FAILURE
```

통합테스트가 **실제 개발 스택 자격을 소스에 박고 있던 것**을 고치는 보안 트랙입니다.
워크트리를 만들었다가 세션 종료로 되돌렸습니다(`.claude/worktrees/w1162` 디렉터리가 프로세스에 잡혀 남아 있을 수 있음 — `git worktree prune` 후 수동 삭제).

---

## 4. 🔴 개발책임자 결정 — 확정된 것과 남은 것

### ✅ 이 세션에서 확정

| 건 | 결정 |
|---|---|
| **통합 목록** | 없애고 견적서 관리를 '종합견적서'/'주문서' 2페이지로. 데스크톱 견적은 '종합견적서' 로 합침 |
| **판매 계열 내부 페이지** | 전수 sweep 결과 **지울 것 0건** — 나머지는 다 자기 메뉴 소관 |
| **카테고리별 단가변동** | 🔨 **제품 메뉴로 옮긴다** (아직 미착수 · PR #1197 후속) |
| **웹 저장분 상세** | ✅ **그대로 둔다** — 각 저장분이 자기 탭 + 출처 칼럼으로 보임 |
| **#1196 DC 소급** | **소급 안 함.** 신규 견적부터만. 기존 5건은 저장 금액 그대로 |
| **#1140 구형 37품목 baseline** | **B — 현재 단일가를 baseline 에 복제.** 출고가·납품가 차이 0원(37/37), 토글 전환 no-op. UI 만 생기고 금액은 안 바뀜 |
| **#1187 리모컨 특징 라벨** | **짧은 값(`기본`·`유선`·`컬러`)이 정본.** 현재 구현이 맞음 |

### ⏳ 남은 결정 4건

| 건 | 무엇이 막히나 |
|---|---|
| **#1072 미정 계정과목 9건** (`103`·`104`·`105`·`201`·`919` · `142`·`210`·`220`·`255`·`900`) | 🔑 **`#1144` 의 선행 결정.** 이게 없으면 분개·원장·세금계산서·출금 쓰기 구현을 시작할 수 없습니다 |
| **#901 클로드 대화** | 권한 범위 · 되돌릴 수 없는 작업 포함 여부 |
| **#1142 되돌림** | 권한 · 범위 · 연결 처리 · 이력 — S1(판정)에서 더 못 나감 |
| **#910 배포** | 배포처 · 코드서명 · 채널 분리 |

---

## 5. `#1144` 회계전표(매출·매입) 정찰 결과 — **구현 전 반드시 읽을 것**

산출물: `docs/dev-reports/2026-08-13-1144-recon-sol.md` (브랜치 `feat/1144-accounting-slip-link`, PR 미개설)

```text
✅ 이미 있는 것   매출·매입 회계전표 엔티티 · 테이블 · API · 화면 · N:M 연결 구조
                  ⟹ "새로 만들자" 로 시작하면 그 자체가 결함입니다

실 데이터        생성 가능한 실 전표  매출 2건(5라인) · 매입 0건
                  활성 회계전표 0건
🚩 삭제된 매출전표 아래 활성 allocation 1건이 남아 있음
🚩 매입 CONFIRMED 1건은 UUID 만 있고 거래처 코드가 비어 있음
   → 조인 키로 쓰는 코드 컬럼이 빈 채 UUID 만 채워진 기존 함정과 같은 형태

🔴 #1072 미정 9건(실제 코드 10개)이 #1144 의 선행 결정
```

---

## 6. 미해결 정리 항목

```text
공유 DB QA 잔재 1건   slip_db.estimates  '2026/08/08-2' = 'S26 ??? ???'
잔여 QA DB 3개        slip_db_qa_e2estimate
                      sol951_2ra_20260727_1420utc
                      sol951_r2_6897d36597
고아 워크트리 디렉터리   프로세스가 cwd 로 잡고 있어 `Device or resource busy`
                      (w1162 포함 — prune 후 수동 삭제)
#999 후속             QR 스캔 입출고 + 재고이동이 수불 이력에 안 남는 문제 (이슈 열려 있음)
#894 S3~S7            자동 로그인 · 부재중 · 알림 · 파일전송 · 이모티콘
```

---

## 7. 🚩 이 세션에서 확인한 것 — 종합견적서 스냅샷 복원

개발책임자 질문: *"종합견적서 스냅샷을 다시 그대로 레거시처럼 웹에서 복원도 가능한거 맞지? 분기계산 페이지 포함해서 말야."*

**소스 실측 결과 — 예, 분기계산 포함해 복원됩니다.**

```text
저장  clients/web/estimate-app/views/index.ejs
  :16998  snapshotBranchState() 로 분기상태를 뜬다
  :17007  brData = JSON.parse(JSON.stringify(window.GLOBAL_BRANCH_STATE))
  :17165  branch: brData          ← 스냅샷 최상위 키

복원  applySnapshot()  (:17171)
  :17586  if (shot.branch) {
  :17587    window.GLOBAL_BRANCH_STATE = shot.branch
  :17591    buildBranchView()          ← 분기 화면 다시 그림
  :17593    applyBranchState(shot.branch)
  :17599    out-slot 입력값 개별 복원
  :17606    recomputeBranchCodes()     ← 분기관 코드 재계산

저장소  QuoteSnapshot.snapshotState 가 jsonb 한 칸 (domain/QuoteSnapshot.java:51)
        웹 목록의 '복원' 버튼(:18210) → restoreSnapshot() → decodeSnapshotState() → applySnapshot()
```

🚩 **다만 확인한 것은 소스 코드이지 실제 실행이 아닙니다.**
`slip-service` 스냅샷 IT 전체에서 `branch` 를 언급하는 곳이 **1건뿐**이라,
**분기 상태 왕복(저장→복원)을 실제로 단언하는 테스트가 사실상 없습니다.**

⟹ `fix/1092-split-unified-list` 트랙의 라이브QA 에 **분기계산 포함 왕복**을 넣으십시오.
