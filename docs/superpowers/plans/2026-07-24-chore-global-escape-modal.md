# 전역 chore 기획서 — LIKE escape 누락(축 A) · 모달 인쇄 배경 겹침(축 B)

- 작성: OPUS 4.8 기획자 (2026-07-24)
- 브랜치(현재): `chore/global-like-escape-modal-print` (origin/main 3b3123e71 기반 — #907·#881·#909·#914 머지 포함)
- 성격: 슬라이스 sweep(#907·#909)이 드러낸 **pre-existing 횡단 결함** 2축. 개발책임자 "전역 chore 로 묶어 처리" 승인.
- 이 문서는 **기획서 전용**(코드 미수정). 구현은 CODEX LUNA 5.6.

---

## 0. 결론 요약 (PM/개발책임자용)

| 항목 | 결론 |
|---|---|
| **PR 분리** | **두 PR 로 분리 권고** (surface·검증 toolchain·iteration cadence 전부 disjoint). 근거 §1. |
| **축 A 공통 유틸** | **불채택 권고** — 각 서비스 로컬 static helper(기존 slip/partner/product 선례와 동일). shared 유틸은 별도 리팩터 chore 로. 근거 §3.4. |
| **축 A 도달성** | 5 검색 **전부 화면 도달 가능**(각 검색창 실측). 도달 불가 0. §3.5. |
| **축 A family 확장** | 플래그된 5건 외 **user 3건 + accounting 2~4건 동일 계열 추가 발견** — 전수 처리 필요. §3.3. |
| **축 B 차폐 방법** | 순수 desktop `global.css` — `@media print { body:has([data-testid='ds-modal-backdrop']) .app-main { display:none } }`. **design-system 미수정**. §4. |
| **예상 규모** | 축 A: 5서비스 × (repo 쿼리 + service escape) + IT, production 대략 +40~70줄. 축 B: global.css +2~6줄 + real-qa spec. |

---

## 1. 🔑 PR 분리 권고 — **두 PR**

두 축은 **표면·검증 방법·iteration 주기·CI 트리거가 완전히 disjoint** 하며, 유일한 공통점은 "같은 sweep 에서 발견됐다"는 **출처 우연**뿐이다. 이는 merge/rollback 을 결합할 이유가 못 된다.

| 구분 | 축 A (BE escape) | 축 B (FE 모달 인쇄) |
|---|---|---|
| 표면 | Java · SQL(native/JPQL/Criteria) · 5 서비스 repo+service | CSS 1파일(desktop `global.css`) |
| 검증 toolchain | `gradlew :services:*:test` 서비스별 IT(Testcontainers PG) · %/_ 실입력 | Playwright real-qa 인쇄 스샷 · 배경 차폐 확인 |
| 라이브QA | API %/_ 실입력 5화면 | Ctrl+P 인쇄 스샷(모달 배경) |
| CI 트리거 | 5개 백엔드 서비스 빌드 | Desktop Playwright/typecheck |
| iteration 예상 | 1~2 라운드(SQL 결정론적) | **3~5 라운드 가능**(인쇄=반복 정정 — `feedback_print_design_iteration.md`) |
| 리뷰어 mental model | SQL LIKE·escape·DB 방언 | CSS `@media print`·portal·stacking |

**근거:**
1. **iteration cadence 불일치가 치명적** — 메모리 `feedback_print_design_iteration.md` 는 인쇄/디자인 작업이 3~5회 반복됨을 경고한다. 저위험·빠른 BE escape(1~2R)를 인쇄 CSS(다수 시각 라운드)에 묶으면 **BE fix 가 인쇄 수렴까지 인질**이 된다. 머지 게이트(도달가능 0 + CI green + 라이브QA)를 두 세계가 동시에 넘어야 하므로 마감이 느린 축에 빠른 축이 종속된다.
2. **검증 표면이 겹치지 않아 결합 이득이 없다** — 한 PR 로 묶어도 리뷰어는 BE-SQL ↔ FE-CSS-print 를 매 라운드 context-switch 해야 하고, 라이브QA 세션이 "API %/_ 실입력 5화면 + 인쇄 스샷"으로 비대해진다.
3. **CI/rollback 도메인 분리** — 축 A 결함이 나오면 5 백엔드를 재빌드, 축 B 결함이면 Playwright 재실행. 묶으면 매 라운드 양쪽을 전부 돌린다. 한 축만 회귀해도 다른 축 머지가 막힌다.
4. **개발책임자 초기 견해도 분리** — 본 기획의 독립 분석이 이를 강하게 재확인.

**단, 현재 브랜치 명이 두 축을 모두 담고 있다.** 분리 채택 시 PM 은 두 브랜치로 재편(예: `chore/like-escape-5services`, `chore/modal-print-background-hide`)해야 한다. **브랜치 재편은 코드 이동만 있고 커밋 미발생 상태이므로 비용 낮음.**

> 한 PR 을 선호할 경우의 조건부 절차(참고): BE 커밋을 먼저 안착시키고 인쇄 CSS 를 이후 반복, 두 축 모두 green 일 때 머지. 그러나 이는 축 B 반복이 축 A 를 계속 붙잡는 구조라 **비권장**.

---

## 2. 참조 구현 — #907 이 slip 에 적용한 패턴 (전파 원본)

축 A 는 #907 이 **이미 slip-service 에 한 fix 의 전파**다. 3개 서비스가 이미 동일 패턴으로 고쳐져 있어 **선례가 3벌** 존재한다(중복 현황 자체가 §3.4 공통유틸 판단의 근거).

**A. 서비스 계층 문자열 escape (3벌 동일 — 본문 identical)**

| 서비스 | 메서드 | 가시성 | 위치 |
|---|---|---|---|
| slip | `SlipQueryService.escapeLikeLiteral` | private static | `service/SlipQueryService.java` |
| partner | `PartnerService.escapeLikeLiteral` | package static | `service/PartnerService.java` (Excel export 가 재사용) |
| product | `ProductService.escapeLikeWildcards` | public static | `service/ProductService.java` (Controller 가 static import) |

```java
// 세 서비스 공통(이름만 다름):
value.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
```

**B. 쿼리 계층 ESCAPE 선언** — 방언별로 스펠링이 다르나 **의미는 전부 "backslash 를 escape 문자로"**:
- **native @Query(text block)**: `... LIKE LOWER(CONCAT('%', CAST(:x AS varchar), '%')) ESCAPE E'\\\\'` (slip·partner native) 또는 `ESCAPE '\\'` (product native). Java text block `\\\\`→`\\`, PG E-string `E'\\'`→ backslash 1자.
- **JPQL @Query(concat string)**: `... ESCAPE '\\'` (partner `searchAdmin`/`searchDirectory`). Java `\\`→`\`, JPQL escape char = backslash.

**C. 🔑 #907 실측 핵심(뮤테이션 보고)** — *"SlipRepository ESCAPE 한 줄만 제거한 뮤테이션은 PostgreSQL 기본 backslash escape 가 남아 GREEN. 서비스 계층 % escape 제거 뮤테이션으로 RED 재확인."*
→ **PostgreSQL 에서 LIKE 의 기본 escape 문자가 backslash 이므로, 실제 결함을 고치는 load-bearing 변경은 "서비스 계층 wildcard escape"다.** 쿼리의 `ESCAPE` 절은 자기문서화·DB 비의존성을 위한 belt-and-suspenders(제거해도 PG 에선 green 유지 가능). **테스트 전략(§7)의 뮤테이션은 반드시 "서비스 계층 escape 제거"로 RED 를 잡아야 하며, "ESCAPE 절 제거"만으로는 false-green 가능**(slip 선례).

---

## 3. 축 A — LIKE escape 누락 상세

### 3.1 플래그된 5 사이트 + 경로·방언·도달성

| # | 서비스 | 검색(화면) | 리포지토리 메서드 / 방언 | 서비스 진입점(escape 삽입 위치) | 현재 상태 | 화면 도달(testid) |
|---|---|---|---|---|---|---|
| A1 | inventory | 창고(`/admin/warehouses`) | `WarehouseRepository.searchAdmin` — **JPQL** `CAST(:q AS string)`, code/name/address 3 LIKE, **ESCAPE 없음** | `WarehouseService.searchAdmin(q,...)` (q 미escape 전달) | 결함 | ✔ `admin-warehouses-search-input` |
| A2 | partner-order | 주문 목록 | `PartnerOrderQueryService` — **2경로**: native `buildNativeWhereClause` + **Criteria** `toSpec`, 둘 다 `like()` helper 사용, **ESCAPE 없음** | private `like(String)` (line ~439) — `"%"+trim().toLowerCase()+"%"`, **wildcard escape 없음** | 결함 | ✔ `SalesPartnerOrderListPage` `searchKeyword` |
| A3 | user | 사용자 관리 | `EmployeeRepository.searchAdmin`(fullName/loginId/email) — **JPQL** `CAST(:q AS string)`, **ESCAPE 없음** | **`AdminUserController` 가 repo 직접 호출**(service 없음) — controller-level escape(product 선례) | 결함 | ✔ `admin-user-search-input` |
| A4 | accounting | 결재참조 분개 | `JournalRepository.searchApprovalReferences` — **JPQL**, **ESCAPE 없음** | `AccountingDocumentSearchService.normalize(q)` = **`q.trim()` 만**(wildcard escape 안 함) | 결함 | ✔ `DocumentReferencePicker`(그룹웨어 결재 첨부) |
| A5 | accounting | 세금계산서 검색 | `TaxInvoiceRepository.searchTaxInvoiceReferences` — **JPQL**, **ESCAPE 없음** | 동일 `normalize(q)` | 결함 | ✔ 동일 picker |

> **A2 partner-order 가 가장 복잡**: 동일 `like()` 를 (1) native SQL 문자열 경로(`listIncludingDeleted`)와 (2) Criteria 경로(`listActiveOnly` → `toSpec`, `cb.like(expr, pattern)`) 가 함께 소비. `like()` 한 곳에 escape 를 넣으면 **문자열 측은 두 경로 모두 해결**되나, 쿼리 측 ESCAPE 선언은 방언별로 별도(§3.2).

### 3.2 방언별 fix 방법 (동일 원본, 방언만 다름)

- **JPQL 사이트(A1·A3·A4·A5)**: ① 서비스 진입점에서 사용자 입력을 `escapeLikeLiteral` 로 escape(단, **Java 측 toLowerCase 는 추가하지 말 것** — SQL 이 `LOWER()` 양측 적용, partner JPQL 선례와 동일). ② 각 JPQL LIKE 에 `ESCAPE '\\'` 절 추가(partner JPQL 선례). 
  - 주의: PG 에선 ①만으로도 기능상 통과(기본 backslash). ②는 자기문서화·비의존성용(§2-C).
- **native 사이트(A2 native 경로)**: `buildNativeWhereClause` 의 각 LIKE 에 `ESCAPE E'\\\\'`(또는 `'\\'`) 추가 + `like()` 에서 escape. PG native 라 escape 만으로도 통과하나 명시 권장.
- **Criteria 사이트(A2 Criteria 경로)**: `cb.like(expr, pattern)` → **escape-char 오버로드 `cb.like(expr, pattern, '\\')`** 로 교체. `like()` helper 가 이미 escape 하면 pattern 은 안전.
  - 🔑 **A2 escape 삽입 규칙**: 감싸는 `%...%` 는 wildcard 로 **유지**하고, **사용자 값만** escape. 즉 `"%" + escapeLikeLiteral(value.trim().toLowerCase()) + "%"`. 감싸는 `%` 를 escape 하면 전건 검색이 깨진다.

### 3.3 🚨 family sweep 확장 — 플래그 5건이 전부가 아니다

메모리 `feedback_defect_family_sweep_fix.md`(1건 지적=계열 전수 grep) + `feedback_recon_grep_false_negative.md`(grep 0/미측정 ≠ 부재) 준수. 구현 착수 전 아래를 **전수 grep 후 처분표(fix/제외+사유)로 박제**할 것. 정찰에서 실제로 **다음 동일 계열을 추가 발견**:

**user-service — EmployeeRepository 에 동일 broken LIKE 4종(플래그는 admin 1종만):**
- `searchInternalApprovers`(그룹웨어 결재자 picker, fullName/loginId) — **JPQL, ESCAPE 없음, 사용자 free-text → 도달 가능**
- `searchInternalActiveRecipients`(메신저 수신자 검색) — 동일 → **도달 가능**
- `searchEmployeeDirectory`(종합견적서 담당자 directory, `CAST(:q AS string)`) — 동일 → **도달 가능**
- admin 검색(플래그된 A3) — 동일
→ **4종 모두 같은 원인. 각 service 진입점 escape + 각 JPQL ESCAPE 절.** admin 만 고치면 다음 라운드 재발견(선례 회고).

**accounting-service — normalize() 가 4개 검색을 공유:**
- `AccountingDocumentSearchService.normalize()` 는 journals/tax-invoices/**statements/ledger-partners** 4개 검색 전부에 쓰임. **normalize() 한 곳에 wildcard escape 추가 → 4개 검색 문자열 측 일괄 해결.** 그 다음 4개 JPQL(`searchApprovalReferences`·`searchTaxInvoiceReferences`·`searchStatementReferences`·`searchLedgerPartnerReferences`)에 `ESCAPE '\\'` 절 추가. **statements·ledger-partners 도 같은 picker 표면 → 도달 가능, 함께 처리.**

**accounting-service — partnerCode LIKE 계열(미측정 — 반드시 실측 후 처분):**
- `SalesAccountingSlipRepository`·`PurchaseAccountingSlipRepository`·`TaxInvoiceRepository` 의 `partnerCode LIKE ... CAST(:partnerCode AS string)` — ESCAPE 없음. #907 sweep 이 **측정 안 함**. 구현자는 (a) 호출자, (b) partnerCode 가 free-text 입력인지 선택코드(도달 낮음)인지, (c) 실제 %/_ 입력 반응을 **실측**해 fix 또는 제외(사유) 결정.
- `AccountingAdminQueryService`(native `LIKE CAST(:partnerName AS text)`) — pattern 전체를 바인딩(호출자가 `%`+escape 공급). 호출자 escape 여부 확인 후 처분.

**제외 후보(사유 명시):**
- inventory `StockTransferRepository`(`transfer_no LIKE (:prefix || '%')`) — 시스템 prefix, 사용자 free-text 아님 → 제외.
- partner-order `like()` 는 `partnerId` 필터(273/366)도 소비 → `like()` escape 시 자동 커버(파트너 스코프 코드, 무해).

### 3.4 🔑 공통 escape 유틸 판단 — **로컬 helper 권고(shared 유틸 불채택)**

**사실관계:**
- 이미 3벌의 로컬 static helper 존재(slip/partner/product, 본문 identical). 5 사이트 추가 시 ~7~8벌.
- **16개 서비스 전부가 `shared:common` 의존**(build.gradle 확인). 즉 shared 유틸을 새 의존 없이 채택 가능. `shared/common/.../common/` 하위에 `dto·financial·http·excel` 등 패키지 존재(자연스런 위치: `common.query` 또는 `common.text` 신규 패키지 + `LikeEscape`).

**그럼에도 로컬 helper 권고 — 근거:**
1. **공유 가능한 부분이 미미** — 유틸이 대체하는 건 3줄 문자열 replace 뿐. 본 chore 작업량의 대부분(native/JPQL/Criteria 방언별 ESCAPE 절)은 **공유 불가**. DRY 이득이 작다.
2. **선례가 이미 로컬** — 코드베이스가 3회에 걸쳐 "서비스별 로컬 copy"를 선택. defect chore 도중 4번째 메커니즘(shared 유틸)을 도입하면 오히려 **비일관**.
3. **blast radius 최소** — `shared/common` 수정은 16개 서비스 재컴파일 유발. 로컬은 해당 서비스만.
4. **리팩터 스코프 크리프 방지** — shared 유틸 도입 + 기존 3벌 이관 = 동작 중 코드를 건드리는 리팩터를 defect fix 에 밀반입. 메모리(최소 변경·범위 동결) 위배.

**대안(문서화):** 단일 `LikeEscape` 로의 수렴을 원하면 **별도 리팩터 chore**(6곳 일괄 이관)로. 단 신규 이슈 등록은 개발책임자 사전 허락 필요(`feedback_backlog_burndown_issue_bar.md`). → **개발책임자 판단 포인트(§10).**

### 3.5 도달성 결론

플래그 5건 **전부 화면 검색창 실측 확인**(A1 `admin-warehouses-search-input` / A2 `searchKeyword` / A3 `admin-user-search-input` / A4·A5 `DocumentReferencePicker`). #907 이 이미 **라이브 실입력**으로 4/4·2020/2020·24/24·20/20·12/12(전건=결함) 측정 → API·UI 양측 도달 확정. **도달 불가로 우선순위 낮출 항목 없음.** family 확장분 중 accounting partnerCode 계열만 미측정 → §3.3 실측 후 처분.

---

## 4. 축 B — 모달 인쇄 배경 겹침 상세

### 4.1 `@media print` 현황 (desktop `global.css`, 주 블록 line ~2641)

현재 인쇄 시 숨기는 것:
- `.no-print { display:none !important }` — **`.app-sidebar`·`.app-header`·`.app-drawer-*` 는 JSX 에서 `no-print` class 부여**(AppLayout.tsx 631·1629·1624·1635) → 인쇄 시 숨겨짐.
- #909 가 추가한 **업데이트 모달 3종 차폐**: `[data-testid='ds-modal-backdrop']:has([data-testid='app-version-blocking-modal' | 'app-version-recommend-modal' | 'app-version-minor-detail-modal'])` → `display:none`.
- `.app-shell{display:block}`, **`.app-main{padding:0; overflow:visible}`** — ⚠️ **`.app-main` 은 숨기지 않는다.**

**왜 `.app-main` 을 안 숨기나(의도적):** `.app-main` 은 **전체 페이지 인쇄 라우트**(`.print-page`·`.dispatch-page` 등, 전표 상세 페이지 인쇄)의 **인쇄 컨테이너**다. 상시 숨기면 그 정식 인쇄가 깨진다. 그래서 `.app-main` 은 JSX 에서 `no-print` 를 **일부러 안 붙였다**(AppLayout.tsx 1628 = `<main className="app-main">`).

### 4.2 결함 메커니즘

`SlipDetailModal`(배차보드) 은 design-system `<Modal>`(SlipDetailModal.tsx line 14·53) 사용 → **createPortal(document.body)** 로 backdrop(`ds-modal-backdrop`)이 **`#root` 형제**(= `.app-main` 밖) 로 렌더. 내부에 실제 인쇄 문서 `DispatchDocument` 포함. Ctrl+P 시:
- 모달 문서 = `:has(app-version-*)` selector 에 **미매치 → 인쇄됨(정상, #909 의도)**.
- 그러나 **배경 `.app-main`(배차보드 목록)은 여전히 미차폐** → 인쇄 시 fixed/backdrop 의 z-index·반투명이 인쇄 flatten 에서 무력화되어 **배경 목록이 문서와 겹쳐 출력**.

### 4.3 🔑 차폐 방법 — 순수 CSS `:has()`(문서는 인쇄, 배경만 숨김)

`.app-main` 은 "모달 없을 땐 인쇄 컨테이너, 모달 있을 땐 배경". **조건부로만 숨기면 됨** — #909 가 확립한 `:has()` portal-aware 기법을 그대로 확장:

```css
@media print {
  /* 문서 모달(DS Modal, body 직속 portal)이 열려 있으면 배경 본문만 차폐.
     모달 문서(ds-modal-backdrop 자손, .app-main 밖)는 그대로 인쇄된다. */
  body:has([data-testid='ds-modal-backdrop']) .app-main {
    display: none !important;
  }
}
```

- 모달은 `body > [ds-modal-backdrop]`(=`.app-main` 밖)이라 **문서는 안 지워지고**, 배경 `.app-main` 만 사라짐 → **모달 문서만 인쇄**.
- **모달 없을 때**(`:has` false)는 규칙 미발동 → 전체 페이지 인쇄 라우트 정상.
- **#909 업데이트 모달 불변식 보존**: 업데이트 모달 열림 시 배경 + 업데이트 backdrop(#909 규칙) 모두 숨김 → 백지(업데이트 모달은 인쇄 대상 아님 = 정상).
- **modal-agnostic**: 어떤 문서 모달이든(현재 SlipDetailModal, 미래 추가분) 동일 동작 → §4.4 전수 열거가 fix 정확성의 전제가 아님(견고성 이점).

**대안(더 공격적, 필요 시):** `body:has([data-testid='ds-modal-backdrop']) #root { display:none !important }` — 모달 외 앱 전체 차폐. 단 sidebar/header 는 이미 `no-print` 라 **`.app-main` 만 숨겨도 충분**. 1차 권고 = `.app-main` 타겟(최소·정밀). 정찰에서 `.app-main` 외 미차폐 배경이 나오면 `#root` 로 승격.

### 4.4 문서 모달 전수 재확인 (#909 SOL "SlipDetailModal 이 유일" 주장 검증)

- `DispatchDocument`/print view 를 **모달 안에** 담는 곳 재grep: **`SlipDetailModal` 이 인쇄 대상 문서 모달로 확정적 유일**. `ExternalCarrierDispatchModal` 은 DispatchDocument 를 인쇄 목적으로 렌더하지 않음(외부배차 발송 폼) — 구현자 최종 확인 항목.
- DS `<Modal>` 소비처는 56+ 개(확인). 그러나 §4.3 규칙이 **modal-agnostic** 이라 열거 완전성은 fix 정확성의 전제가 아니다. #909 SOL 주장은 **"문서 인쇄 모달 = SlipDetailModal 1개"로 재확인**하되, 규칙은 전 모달에 안전.
- 구현자 검증 의무: 비문서 모달(확인 dialog 등)이 열린 채 인쇄 시 배경 차폐 + 그 모달 인쇄 — 드문 edge, #909 철학("나머지 모달은 그대로 인쇄")과 정합. 불변식 위반 아님.

### 4.5 design-system 여부 — **미수정(desktop 로컬)**

- 차폐는 desktop `global.css` 만 수정. **design-system 패키지 미변경.** #909 도 동일(3개 testid 는 desktop 이 Modal children 에 넣은 것이라 CSS 로 표적 가능; `ds-modal-backdrop` 는 DS 가 부여하나 CSS selector 로만 참조).
- → 메모리 `feedback_design_system_playwright_mock_suite.md`(공용 컴포넌트 변경 = mock 스위트 필수)의 **트리거 아님**(DS 코드 미변경). mock 스위트 불요. 단 real-qa 인쇄 검증은 필수(§7).

### 4.6 #914 와의 무충돌 확인

#914(`미리보기 인쇄 겹침`)의 print 블록(line ~3382)은 **`.document-template-*`(결재 문서 양식 편집기)의 표 fragmentation**(마감문구가 표 위로 끼어드는 Chromium 조각화) 처리 — **모달-배경 겹침과 다른 문제**. 축 B 는 `.app-main` 차폐만 추가 → #914 규칙 불변. `pr914Residual.test.tsx` 회귀 없어야 함(구현자 확인).

---

## 5. 불변식 (각 축)

**축 A:**
- IA-1: 검색어의 `%`·`_`·`\` 는 SQL wildcard 가 아니라 **입력 리터럴 그대로** 매칭된다(전건 반환 금지).
- IA-2: 정상 검색어의 부분 일치는 **불변**(escape 가 정상 검색을 좁히지 않음 — `%`/`_` 없는 입력은 기존과 동일 결과).
- IA-3: 대소문자 무시 매칭 **불변**(escape 는 case 로직에 무영향).
- IA-4: **화면 결과 = 파일(Excel export) 결과**(export 가 같은 검색 경로를 타면 escape 도 함께 — partner 선례. inventory/user 는 export 없음 확인).
- IA-5: family 전수(user 4종·accounting 4+종) 잔존 0 — 처분표로 박제.

**축 B:**
- IB-1: 문서 모달(SlipDetailModal 등) 인쇄 시 **문서는 나오고 배경(배차보드 목록/`.app-main`)은 안 나온다.**
- IB-2: **업데이트 모달 3종 차폐 유지**(#909 불변식 — 인쇄에서 제외).
- IB-3: **모달 없는 전체 페이지 인쇄 라우트**(전표 상세 등)는 **불변**(배경 차폐 규칙 미발동).
- IB-4: #914 `.document-template-*`·approval-doc fragmentation 규칙 **불변**.

---

## 6. 범위 (건드릴 파일 + 슬라이스 밖)

**축 A (예상 변경 파일):**
- inventory: `WarehouseRepository.java`(JPQL ESCAPE) · `WarehouseService.java`(escape 삽입 + 로컬 helper) · `WarehouseRepositoryIT.java` 또는 신규 IT(%/_ 테스트)
- partner-order: `PartnerOrderQueryService.java`(`like()` escape + native ESCAPE 절 + Criteria `cb.like(...,'\\')`) · 대응 IT(`PartnerOrderListIT` 확장)
- user: `EmployeeRepository.java`(4종 JPQL ESCAPE) · **각 repository-메서드 호출부** escape — ⚠️ admin `searchAdmin` 은 **`AdminUserController` 가 직접 호출**(service 없음, product `ProductCatalogController` 선례처럼 controller-level escape) · approver/recipient/directory 는 각 호출 service · 로컬 helper · IT
- accounting: `AccountingDocumentSearchService.java`(`normalize()` wildcard escape) · `JournalRepository.java`·`TaxInvoiceRepository.java`(4~다 JPQL ESCAPE 절) · partnerCode 계열 처분 결과 반영 · IT
- 각 서비스 **로컬 static helper**(신규, slip/partner/product 선례 복제) — 공통유틸 불채택 시.

**축 B (예상 변경 파일):**
- `clients/desktop/src/renderer/styles/global.css`(주 print 블록에 `body:has(ds-modal-backdrop) .app-main{display:none}` +2~6줄)
- `clients/desktop/playwright/<slug>-real-qa/*.spec.ts`(인쇄 배경 차폐 real-qa 신규)
- (선택) `SlipDetailModal.test.tsx` 회귀 보강

**슬라이스 밖(명시적 제외):**
- 기존 3벌 helper(slip/partner/product)의 shared 유틸 이관 = **별도 리팩터 chore**(개발책임자 허락 시).
- design-system `Modal` 수정 = 불요·범위 밖.
- inventory `StockTransferRepository` prefix LIKE, 기타 시스템 prefix LIKE = 제외(사유: 사용자 free-text 아님).
- #914 문서 템플릿 fragmentation·#909 업데이트 게이트 로직 = 불변 유지(수정 대상 아님).

---

## 7. 테스트 전략

**축 A — 서비스별 %/_ 실입력 IT (RED-first + PG 진짜 실행):**
- 참조: slip `SlipQueryRedesignIT.tc3b_literalWildcardCharacters` — `...-percent%` 행과 `...-percentX` 행 2개 생성, `...-percent%` 검색 시 **total=1** 기대(escape 없으면 2). 각 서비스 이 패턴 복제:
  - inventory: `admin-warehouses-search-input` 경로 — `HQ%`·`HQ_` 등 리터럴 검색이 wildcard 행까지 안 잡는지.
  - partner-order: `searchKeyword` — **native·Criteria 두 경로 모두** %/_ 테스트(includeDeleted true/false 로 경로 분기 커버).
  - user: 4종(admin/approver/recipient/directory) 각 %/_ .
  - accounting: 4종(journals/tax-invoices/statements/ledger-partners) 각 %/_ + normalize() 단위.
- 🚨 **RED-first + 뮤테이션은 "서비스 계층 escape 제거"로** (§2-C: ESCAPE 절 제거만으론 PG 기본 backslash 로 false-green — slip 실측). RED 원문 제출 후 fix.
- 🚨 **fresh Postgres**(Testcontainers `AbstractPostgresIT` 기존 harness 활용, Windows skip 가림 주의 — `feedback_migration_fresh_postgres_probe`). gradle 캐시 false-green 방지(`--rerun-tasks --no-build-cache`).
- 라이브QA: 5화면 %/_ 실입력 → 전건 미반환 스샷(+ 정상어 양성 대조), 화면=Excel parity(export 있는 곳).

**축 B — 인쇄 배경 차폐 real-qa (실서버·실 인쇄):**
- Playwright real-qa: 배차보드 → SlipDetailModal 열기 → 인쇄 매체 emulation(`page.emulateMedia({media:'print'})`) → **`.app-main` 이 `display:none`**(배경 차폐) & **`ds-modal-backdrop` 내 `DispatchDocument` 가시**(문서 인쇄) 단언 + 스샷.
- 회귀: (a) 모달 없이 전체 페이지 인쇄 라우트 → `.app-main` 가시(IB-3), (b) 업데이트 모달 차폐 유지(IB-2), (c) #914 문서 템플릿 규칙 무회귀.
- design-system 미변경 → **mock 스위트 불요**. desktop typecheck(CSS-only 라 TS 무변경이나 관례 실행).
- 인쇄 작업 특성상 **3~5 라운드 반복 가정**(`feedback_print_design_iteration.md`) — 매 라운드 GUI 스샷(`feedback_live_qa_every_round_screenshots`).

---

## 8. 회귀 위험

**축 A:**
- R-A1: escape 가 **정상 검색을 좁힘**(감싸는 `%` 를 잘못 escape) → IA-2 테스트로 방어(정상어 부분일치 유지 단언). A2 는 특히 "값만 escape, 감싸는 `%` 유지" 규칙 준수.
- R-A2: **JPQL Java-측 toLowerCase 중복 추가** → SQL `LOWER()` 와 이중 적용은 무해하나 partner 선례(escape만, lower는 SQL)와 이탈. escape만 삽입.
- R-A3: partner-order **두 경로 정합** — native/Criteria 결과가 escape 후에도 동일해야(#757 R2 500 선례처럼 경로 불일치 주의). 두 경로 %/_ 테스트로 방어.
- R-A4: family 누락 → 다음 라운드 재발견(회고 선례). §3.3 전수 처분표로 방어.
- R-A5: accounting `normalize()` 가 4검색 공유 → 한 변경이 4곳 영향(의도된 이득이나 4곳 전부 테스트).

**축 B:**
- R-B1: `:has()` 미지원 브라우저 — Electron/Chromium 런타임이라 지원(#909 가 동일 블록서 이미 사용). 
- R-B2: **모달 열린 채 인쇄하는 비문서 모달** edge → 배경 차폐 + 그 모달 인쇄(허용 edge, #909 정합). 불변식 위반 아님.
- R-B3: `.app-main` 만 차폐로 부족한 미차폐 배경 존재 가능성 → 정찰서 미발견, 발견 시 `#root` 승격(§4.3 대안).
- R-B4: 전체 페이지 인쇄 라우트 회귀(IB-3) — `:has` 조건부라 위험 낮으나 회귀 테스트 필수.

---

## 9. 기존 결정 교차검증 (메모리 대조)

- `feedback_defect_family_sweep_fix.md` — 준수: 플래그 5건 외 user 4종·accounting 4+종 family **전수 grep + 처분표**(§3.3). 정찰도 전수.
- `feedback_recon_grep_false_negative.md` — 준수: 도달성을 grep 아닌 **실 검색창 testid + #907 라이브 실측**으로 확증(§3.5). accounting partnerCode 계열 "미측정 ≠ 부재"로 실측 지시.
- `feedback_print_design_iteration.md` — 반영: 축 B 3~5 라운드 반복 가정, PR 분리 근거(§1)로 채택.
- `feedback_design_system_playwright_mock_suite.md` — 반영: 축 B 가 DS **미변경**이므로 mock 스위트 트리거 아님 명시(§4.5). DS 를 건드리면 발동이나 본 설계는 desktop 로컬.
- #907 dev-report(`docs/dev-reports/2026-07-24-907-luna-fix.md`) — 참조: slip escape 패턴·뮤테이션 실측(ESCAPE 절 제거 false-green)·5 사이트 sweep 표를 §2·§7 에 반영.
- `feedback_backlog_burndown_issue_bar.md` / `feedback_fix_in_current_pr_no_split.md` — 반영: 공통유틸 수렴/신규 이슈는 **개발책임자 사전 허락**(§10). PR 2분할은 "새 이슈 등록"이 아니라 **동일 chore 의 표면 분리**(surface disjoint) — 개발책임자 승인 범위 내 재편.

---

## 10. 개발책임자 판단 필요 지점

1. **PR 분리 승인** — 본 기획 권고 = **두 PR**(§1). 현재 단일 브랜치를 두 브랜치로 재편할지 확정.
2. **공통 escape 유틸** — 로컬 helper 권고(§3.4). 단일 `LikeEscape`(shared/common) 수렴을 **별도 리팩터 chore** 로 원하는지(신규 이슈 등록 허락 필요) 여부.
3. **accounting partnerCode LIKE 계열**(§3.3) — 실측 결과 도달 가능으로 판명 시 본 chore 에 흡수할지, 아니면 별도 처리할지(흡수 권고).
4. **축 B 차폐 강도** — `.app-main` 타겟(권고) vs `#root` 승격 — 정찰상 `.app-main` 로 충분하나, 더 공격적 차폐 선호 여부.
