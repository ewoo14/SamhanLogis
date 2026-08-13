# 현재 작업 — 2026-08-13 **회사PC** 세션 종료 (집PC 에서 이어받음)

> 이 파일만 읽으면 이어받을 수 있습니다.

---

## 0. 🚨 이어받는 사람이 가장 먼저 할 것

```text
1  git pull && .\scripts\sync-claude-memory.ps1
2  docker ps -a --filter "name=samhan-" --format "{{.Names}}\t{{.Status}}"
   🚨 있는 것만 읽지 말고 **없는 것을 세십시오**
3  수치는 그 PC 에서 다시 세십시오 (양 PC 시드 상이)
4  열린 PR 5건의 CI 를 exact SHA 로 다시 확인하십시오
```

### 🔴 회사PC 크래시 원인과 해결 — 집PC 에도 해당될 수 있습니다

회사PC 가 세션마다 꺼지던 원인을 확정했습니다. **16GB RAM 에 컨테이너 23개 + WSL2 기본 상한 7.718GB**.

```
이벤트 로그  bugcheck 0x164 (08-13 08:59) + BugcheckCode=0 하드행 4회
실측         컨테이너 23개 = 6.56 GiB · Windows+앱 ~7 GB ⟹ 상시 천장
```

🔑 **핵심 발견 — WSL2 는 컨테이너를 멈춰도 메모리를 안 돌려줍니다.**
```
16→12 컨테이너로 줄임   vmmemWSL  4.31 → 4.12 GB   (거의 안 줄어듦)
wsl --shutdown          즉시 4.3 GB 회수
```
⟹ `C:\Users\<user>\.wslconfig` 를 만들었습니다. **이 파일은 git 에 없으니 집PC 에도 따로 만드십시오.**
```ini
[wsl2]
memory=7GB
processors=6
swap=8GB

[experimental]
autoMemoryReclaim=gradual
sparseVhd=true
```
⚠️ 처음에 `memory=9GB` 로 적었다가 **기본값 7.718GB 보다 나빠서** 7GB 로 고쳤습니다. 올리지 마십시오.
적용 후 이 세션은 **크래시 0회**였습니다.

🚩 라이브QA 는 여유 RAM 이 **1.0GB 아래로 가면 중단**하도록 브리핑에 넣으십시오. Gradle IT 라운드(Testcontainers)와 라이브QA 를 **동시에 돌리지 마십시오** — 그 겹침이 크래시 조건입니다.

### 🔴 배포본이 main 보다 낡으면 없는 결함처럼 보입니다

라이브QA 브리핑에 **"띄운 스택이 어느 커밋 빌드인지"** 를 항상 명시하십시오. 이 세션에서 `#1189` 재수렴 QA 에 *"스택은 이전 커밋(b11f025ea) 빌드라 백엔드 변경이 안 올라가 있다"* 를 적어 둔 덕에 검증자가 백엔드 항목을 **억지로 판정하지 않고 관측 불가로** 남겼습니다.

### 🔴 `git push` 가 무한 대기하면

`credential.helper=manager` 가 비대화형 셸에서 프롬프트를 기다리는 것입니다. **전역 설정을 바꾸지 말고** 명령 단위로:
```bash
git -c credential.helper='!gh auth git-credential' push origin HEAD
```

---

## 1. 오늘 머지된 것

```
✅ #1196 견적 DC 분류 옵션    623bf96af   게이트 3개 충족
```

---

## 2. 트랙 현황 (5건)

### 🟢 `#1189` 되돌림 S1 + 창고 UUID — **가장 머지에 가깝습니다**

```
① 도달 결함   재수렴 통과 · 계열 sweep fix 완료 (1a894124c)
② CI green    45/45 (225fdb913) → 1a894124c 재확인 필요
③ 라이브QA    38장 완주 (round2 24 + round3 14)
```

**남은 것 하나** — sweep 이 **새로 손댄 4곳**을 실서버로 밟는 재수렴 QA.
```
판매·입고전표 생성  ['slips','query',mode]
매출 회계전표 생성  ['sales-accounting-slips']
매입 회계전표 생성  ['purchase-accounting-slips']
창고 수정           ['warehouses'] 추가 무효화
```
질문은 하나입니다 — **fix 가 새 표면을 만들었는가.** 깨끗하면 머지하십시오(PM 자율 위임).

🔑 이 트랙에서 배운 것: 재수렴 QA 가 재고실사에서 같은 결함을 찾았고, 그것 하나만 고치지 않고 **역할 축으로 mutation `onSuccess` 270건 전수**를 돌리자 **아무도 보고한 적 없는 4곳**이 더 나왔습니다. **판매전표 저장 후 목록 미갱신**이 그중 하나입니다 — 가장 많이 쓰는 화면인데 계속 안 보였습니다.

⚠️ 새로 넣은 `inventory-mutation-cache.contract.test.ts` 는 **소스 문자열 `toContain`** 방식이라 동작이 아니라 문자열 존재만 증명합니다. 도달 결함은 아니라 게이트에 안 세되, 알고 계십시오.

🚩 PM 정정 기록: 재고실사 목록은 `refetchInterval: 30_000` 이 걸려 있어 **"새로고침 전까지"가 아니라 "최대 30초"** 입니다. 그래도 결함입니다(코드 주석 자신이 이 폴링을 *"멀티 워크스테이션 동기화 안전망"* 이라 적어 뒀습니다 — 내 저장을 보여 주는 수단이 아닙니다).

---

### 🟡 `#1197` 종합견적서 2페이지

```
① ② 충족 · CI 45/45 (f5f3161e0)
③ 라이브QA  시나리오 1~4 만 관측 · 5~10 미실시
```

**개발책임자 지적을 세 번 만에 제대로 처리했습니다.** *"열크기랑 너비가 잘 안 맞는다"* 를
```
1차  칸 수 문제로만 좁힘 → 헤더 10칸 vs 행 11칸 고침 (숨은 collab wrapper span)
2차  라이브QA 가 진짜 정체를 찾음 — 1440px 에서 품목명 열이 18px 로 붕괴, 헤더가 '품/목/명' 3줄
3차  minmax(140px,1fr)+min-width 1080px+overflow-x 로 타협 → 이것도 아님
정본 "판매전표와 똑같이" = SlipFormPage 의 .lineRowVat 정책을 그대로
```
```ts
const ESTIMATE_LINE_GRID_TEMPLATE =
  'var(--col-line-no) minmax(100px, 1.5fr) minmax(100px, 1.5fr) 86px var(--col-qty) var(--col-price) 108px 92px var(--col-sum) var(--col-delete)'
// 모델명·품목명 각 399px@1440 / 639px@1920 (이전 18px)
```

**남은 것**
```
· 시나리오 5~10 라이브QA (특히 10 = 종합견적서 스냅샷 분기계산 왕복 — 한 번도 실행된 적 없음)
· 🚩 웹 종합견적서 목록 HTTP 404
     이 PR 전제가 "종합견적서 탭에 웹 저장분이 보인다" 인데 그 API 가 404 면 탭이 빕니다.
     백엔드가 다른 브랜치(#1189) 빌드였을 수 있어 **먼저 신선 빌드로 재확인**하십시오.
```

---

### 🟡 `#1198` 계정과목 3자리 → 이카운트 4자리 통일 (이슈 `#1072`)

```
① 미확정 · ② CI FAIL 64건 (25b974670) · ③ 미실시
```

**CI 실패 64건은 전부 IT(실 DB)이고 단위 테스트는 하나도 안 깨졌습니다.** 이 비대칭이 원인을 확정합니다 — 단위는 mock 이라 시드를 안 탑니다. 깨진 건 로직이 아니라 **테스트 fixture 가 폐기된 3자리 계정을 쓰는 것**입니다.

🚨 **그러나 빨간 테스트를 지우지 마십시오.** 특히 이 둘은 없어지면 안 됩니다.
```
JournalControllerIT               '통제 계정 사용 시 400'
MonthlyIncomeStatementControllerIT '통제 계정 직접 분개 제외'
LedgerControllerIT Q3-2            '시드 미존재 code → accountName=null fallback'
```

**PM 이 확정해 둔 대응표** (레거시 원문 `V1__init_accounting_service.sql` + `V101` 시드 대조, 추측 아님)

| 옛 | 옛 정의 (V1) | 새 | 근거 |
|---|---|---|---|
| `230` | 단기차입금 LIABILITY leaf | `2515` 단기차입금 | 이름 일치 |
| `951` | 이자비용 NON_OPERATING leaf | `9319` 이자비용 | 이름 일치 |
| `400` | 매출 REVENUE **통제(is_leaf=false)** | `4011` 매출 (자식 4019·4029… → 트리거가 false) | 이름+성질 일치 |
| `500` | 매출원가 COST_OF_SALES 통제 | `5019` 재료비 | leaf · 자금/차입금 아님 · **상대 계정 전용**이라 단정에 안 걸림 |
| `120` | 미수금 ASSET leaf | V101 시드에서 미수금 |
| `130` | 상품 ASSET leaf | V101 시드에서 상품 |
| `150` | 재고자산 ASSET leaf | V101 시드에서 대응 확인 필요 |
| `140` `850` | ❌ **어느 마이그레이션에도 없음** | **바꾸지 말 것** | 계정과목이었던 적이 없다 · `Q3-2` 가 이 경우를 지원 케이스로 명시 |

🚨 **접근법 — 3자리를 일괄 치환하지 마십시오.** 3자리를 쓰면서도 통과하는 IT 가 실제로 있습니다(`FundsFlowComparisonControllerIT` 가 증거 — 실패 목록에 없습니다). **먼저 18개 실패 클래스를 실행해 RED 원문을 받고, 원문이 지목한 것만** 고치십시오. 원문 없이 치환하다 결정 불가 코드에 두 번 부딪혔습니다.

실패 18개 클래스:
```
ChartOfAccountSeedIT FundsStatusControllerIT JournalApprovalGateIT JournalControllerIT
LedgerControllerIT MonthlyIncomeStatementControllerIT P04ValidationIT
PartnerLedgerBalanceFix3RealQaIT PartnerLedgerBalanceFix4RealQaIT Phase9VendorIntegrationIT
ReportValidationSeedIT SliceBValidationIT SliceCValidationIT TaxInvoiceBatchEndToEndIT
TaxInvoiceControllerIT TaxInvoiceEmitNtsIT TaxInvoiceP04IT TrialBalanceControllerIT
```

🚩 **이번이 "이관이 남긴 하드코딩" 의 다섯 번째**입니다. 매번 이관 검증은 통과했는데 다음 것이 CI 에서 나왔습니다.
```
1  컬럼 DEFAULT      cash_receipts.debit_account_code DEFAULT '102'
2  애플리케이션 상수  CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE = "102"
3  집계 MV           partner_aging_snapshot 이 101/102/110/201 하드코딩
4  **이름 조회**     Mig9CashJournalService 가 '지급수수료' 로 조회
                    → V101 이 '지급수수료(판)' 로 개명해 0건 반환, 전 지급행 거부
5  테스트 fixture    ← 이번
```
→ [[feedback_data_migration_leaves_hardcoded_values]]

**이후 남은 것**: 결정 7(leaf 전용 게시) 애플리케이션 제약 라운드 → `#1144` 구현

---

### 🟡 `#1181` 9개 앱 버전 계약 + 자동 업데이트 (이슈 `#910`+`#935`)

```
① ② 충족 (CI 55/55 ff972a2da) · ③ 라이브QA **0회**
브랜치 feat/910-935-client-auto-update   ← 워크트리 w1181
```

Electron 자동 업데이트라 라이브QA 가 까다롭습니다(릴리스 서버·서명 빌드 필요). **관측 가능성 정찰**을 발주했으나 세션 종료로 산출물 없이 끝났습니다. 집PC 에서 재발주하십시오 — 목표 산출물은 `docs/qa/2026-08-13-1181-observability-recon.md`, 질문은 **"게이트 ③을 어디까지 실측할 수 있고 어디부터 못 하는가"** 하나입니다.

🚩 조사 항목 A~F: 서버 `/app/version` curl / 관리자 화면 `versionCheckSupported` 표기 / 웹 3앱 reload 경로 / Electron 배너·"나중에" 버튼 / 사내 메신저 신설분 / Expo OTA 활성 여부. **`app_release` 게시 건수를 먼저 세십시오** — 0 이면 대부분 경로가 안 밟힙니다(표본 0 = 판정 불가).

🚨 **"Playwright 없음" 은 틀린 문장입니다.** chromium-1217 설치돼 있고 정상 동작합니다. *"관측 불가"* 를 쓰려면 실패 명령과 원문 출력을 붙이게 하십시오 — 이 저장소에서 여섯 번 연속 없는 이유로 포기한 실측이 있습니다.

개발책임자 정책 결정 4건은 `docs/decisions/2026-08-13-client-auto-update-policy.md` 에 있습니다(강제 즉시 설치 유지 / 사내 메신저 경로 신설 / `allowDowngrade=true` / 9건 일괄).

---

### 🔴 `#1162` IT 임시 자격 — **GitGuardian 이 막고 있고 원인 미확정**

```
① 미확정 · ② 다른 체크 전부 SUCCESS · **GitGuardian FAILURE** · ③ 미실시
SHA 4535b919f · 72 파일 · +649 -257
```

🚨 **제 가설이 틀렸습니다.** *"GitGuardian 이 기본 브랜치의 `.gitguardian.yaml` 을 읽어서"* 라고 생각했는데, 실측하니 **다른 4개 PR 은 전부 SUCCESS 이고 `#1162` 만 FAILURE** 입니다. 환경 문제가 아니라 **이 PR 내용에 반응하는 것**입니다.

PR 이 추가한 자격 형태 문자열은 전부 `CHANGE_ME_LOCAL_ONLY` 플레이스홀더로 보입니다.
```
SAMHAN_JWT_SECRET=CHANGE_ME_LOCAL_ONLY
POSTGRES_PASSWORD=CHANGE_ME_LOCAL_ONLY
X-Internal-Token: 'CHANGE_ME_LOCAL_ONLY'   … 등
```
그러나 **무엇이 실제로 검출됐는지는 확인하지 못했습니다** — `detailsUrl` 이 `dashboard.gitguardian.com` 뿐이고 접근 권한이 없습니다.

⟹ **집PC 에서 할 일**: 개발책임자께 대시보드 확인을 요청하거나, 검출 항목을 알 수 있는 다른 경로를 찾으십시오. 🚫 **무엇이 걸렸는지 모르는 채로 "false positive" 로 판정하고 머지하지 마십시오.** 자격 관련 PR 이라 특히 그렇습니다.

---

## 3. 이 세션에서 확정된 업무 규칙 (개발책임자)

```
· UUID 는 무엇이든 비공개 — 오직 서버에서 PK 로만 사용
    docs/decisions/2026-08-13-uuid-never-exposed.md
· 계정과목은 자체 3자리 폐기, 이카운트 4자리로 통일
    docs/decisions/2026-08-13-account-code-unification.md
· 창고 별칭: 삼성=초월=삼한 → 00003 / 이화=상일물류=상일창고 → 2
    .claude/memory/project_warehouse_name_aliases.md
· 재고이동은 금액 개념이 없다 — 수량만 변동, 재고수불부에만 반영   🆕
    .claude/memory/project_stock_transfer_no_amount.md
```

### 🆕 재고이동 금액 — 현재 구현은 이미 규칙과 일치합니다

```java
// StockTransferLine — 금액 필드 없음
productId · requestedQuantity · shippedQuantity · receivedQuantity · sourceLotId · destinationLotId
```
```
TransferFormPage.tsx:7  "이동전표는 단가/금액 개념이 없으므로 모델명 + 품목명 + 수량만 입력."
```
⚠️ 재고**실사**에는 `차이금액` 열이 있습니다 — 장부↔실물 차이를 금액 평가하는 것이라 성격이 다르고, 메뉴가 인접해 스크린샷만 보면 헷갈립니다.

🚩 **미확인 — 다음 세션에서**: 이동 확정이 재고수불부에 **출고행 + 입고행을 함께** 만드는가(한쪽만이면 총 재고 불일치). 확정 상태 표본이 있는지부터 세십시오.

---

## 4. 미착수 / 보류

```
· 거래처·제품 id UUID 계약 — 별도 트랙(결정 a)이나 UUID 전면 정책의 적용 대상
· collab presence sessionId opaque 화 — 5개 서비스 소비 경계 함께 바꿔야 함
    🚩 응답만 바꾸면 usePresence.ts:21 dedup 과 :123 leave-removal 이 깨진다 (실측)
· 가입고 Excel 파서에 확정된 창고 별칭표 적용
· #1144 구현 (#1198 결정 7 라운드 이후)
```

---

## 5. 🚨 이 세션에서 PM 이 반복한 실수 — 같은 것을 하지 마십시오

```
1  fix 좌표를 하나로만 줘서 계열이 안 닫혔다
   재고이동만 지목 → 재고실사·판매전표·회계전표 2종·창고수정 4곳이 남음
   ⟹ 좌표는 파일이 아니라 **역할 축**으로

2  브리핑 전제를 실측 안 하고 적어 codex 를 세 번 멈추게 했다
   ① "V101 매핑표가 유일 권위" (실제로는 데이터 있던 코드만)
   ② 브랜치명 오기 (feat/910-935-app-version-contract → -client-auto-update)
   ③ 범위를 "3자리 쓰는 파일" 로 읽히게 씀 (실패한 18개만이 대상)
   🔑 세 번 다 **"전제가 틀리면 고치지 말고 중단·보고"** 조항이 살렸다. 항상 넣으십시오.

3  개발책임자 지적을 좁게 해석했다
   "열크기랑 너비" → 칸 수만 보고 폭을 놓침. 세 번 만에 정본에 도달.
   ⟹ 지적이 두 가지를 가리킬 수 있으면 **둘 다** 확인하십시오.

4  가설을 실측 전에 결론처럼 적었다
   GitGuardian "기본 브랜치 설정 탓" → 다른 PR 은 전부 통과라 틀림
```
