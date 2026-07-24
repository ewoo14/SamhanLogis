# chore 축 A — LIKE 검색 `%`·`_` escape 누락 전수 (BE 5서비스)

- PR: #919 · 연관 이슈: #907(sweep 원천)
- 기간: 2026-07-24 (회사PC, 하루)
- 파이프라인: OPUS 기획(집PC) → **LUNA 구현(fresh 재디스패치)** → OPUS 적대검증 3표면 + PM 라이브QA 1·2부 → CODEX SOL 2차 + SOL 라이브QA → **양측 도달가능 0 수렴** → 머지

---

## 1. 무엇이 문제였나

사용자가 검색창에 `%` 또는 `_` 를 입력하면 **SQL LIKE wildcard 로 해석돼 전건이 반환**됐다. `%`= 임의 문자열, `_`= 임의 1문자이므로 `%` 한 글자만 쳐도 모든 행이 매칭된다.

**실측 (fix 전)**
```
창고 검색      "%"   → 30건 (전건)
주문 검색      "%"   → 33건 (전건)
사용자 관리    "%"   → 99건 (전건)
분개장 검색   "40%"  → 478건   ← 특정 분개를 찾으려는데 전표가 쏟아짐
```

`#907`(주문 병합) 슬라이스의 **계열 전수 sweep** 이 이 결함을 5개 서비스에서 발견했고, 개발책임자 승인 하에 **전역 chore** 로 묶어 처리했다. 축 B(모달 인쇄 배경 차폐)는 표면·검증 toolchain·iteration 주기가 disjoint 해서 **PR #921 로 분리**했다.

## 2. 무엇을 고쳤나

**production 17파일 · 테스트 7파일 + 신규 IT 2 (235+/55−)**

핵심 패턴 — 서비스/호출부 계층에서 사용자 값만 escape 하고, **감싸는 `%...%` 는 wildcard 로 유지**한다:
```java
private String like(String value) {
    return "%" + escapeLikeLiteral(value.trim().toLowerCase(Locale.ROOT)) + "%";
}
private static String escapeLikeLiteral(String value) {
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
}
```
🔑 **escape 순서 `\` → `%` → `_`** — backslash 를 먼저 하지 않으면 자기가 넣은 escape 문자를 다시 escape 해 **dangling escape**(PG `invalid escape string` → 500)가 난다.

**전수 처분표**

| 서비스 | 대상 | 처분 |
|---|---|---|
| inventory | 창고 검색(`WarehouseRepository.searchAdmin` JPQL) | fix |
| partner-order | 주문 검색 — **native + Criteria 2경로**가 공유하는 `like()` helper | fix |
| user | `EmployeeRepository` **4종**(admin · 결재자 picker · 메신저 수신자 · 견적 담당자 directory) + 호출부 2 controller | fix |
| accounting | `normalize()` 가 공유하는 **4검색**(journals · tax-invoices · statements · ledger-partners) | fix |
| accounting | `partnerCode` LIKE 계열(sales · purchase · inbound tax · batch candidate) | fix (실측 후 흡수) |
| accounting | admin `partnerName` · 입금보고서 `slipNo` | fix (sweep 중 추가 발견) |
| inventory | `StockTransfer.transfer_no` | **제외** — 시스템 생성 prefix |
| accounting | `TaxInvoiceBatch.batch_no` | **제외** — 시스템 생성 prefix |
| slip / partner / product | 기존 helper 3벌 | **제외** — 범위 밖 · 무변경 |

기획서가 *"실측 후 처분"* 으로 남긴 `partnerCode` 계열은 **자유 입력 `<input>` + BE 부분일치 LIKE** 로 확인돼 흡수했다.

## 3. 🔑 뮤테이션은 "서비스 계층 escape 제거"로 잡아야 한다

**PostgreSQL 은 LIKE 의 기본 escape 문자가 이미 backslash** 다. 따라서 쿼리의 `ESCAPE` 절만 제거한 뮤테이션은 **PG 에서 false-green** 이 된다(#907 slip 실측). 실제 결함을 고치는 load-bearing 변경은 **Java 측 `escapeLikeLiteral`** 이고, `ESCAPE` 절은 자기문서화·DB 비의존성용 belt-and-suspenders 다.

구현자는 뮤테이션을 전부 **서비스/호출부 escape 제거**로 잡아 4개 모듈에서 RED 를 재현했다.

## 4. 🚨 리뷰가 막은 것 — 백슬래시 개수 하나

표면A 리뷰어가 이 PR 최대 위험으로 *"JPQL `ESCAPE '\'` 를 Hibernate 가 파싱 못 하면 `@Query` 부트스트랩 검증에서 **inventory-service 전체가 부팅 실패**"* 를 지목하고, **gradle 없이 Hibernate 6.5.3 렉서/파서를 직접 호출**해 검증했다:

```
ESCAPE 다음 토큰: type=STRING_LITERAL rawText=['\'] len=3   (×3)
lexer errors=[]  parser errors=[]   => PARSE OK
QuotingHelper.unquoteStringLiteral("'\'")  -> value=[\] len=1 codepoints=[92]
```

Java 소스 백슬래시 **2개**(`ESCAPE '\\'`) → HQL `ESCAPE '\'` → 언쿼트 **1글자**. PG 요구와 일치. **구현자가 4개(`'\\\\'`)를 썼다면 2글자가 되어 PG 가 `invalid escape string` 으로 거절 → 창고 검색 전건 500** 이었다.

## 5. 검증

### 도달가능 0 — 양측 수렴
| 라운드 | 결과 |
|---|---|
| OPUS 표면A(inventory·partner-order) | **0** — 6가설 전부 반증 |
| OPUS 표면B(user 4종) | **0** — 8개 LIKE 분기 전부 ESCAPE, 호출부 매트릭스 누락 0 |
| OPUS 표면C(accounting) | **0** — 실 PG raw SQL 로 before/after 동치 확인 |
| **CODEX SOL 2차** | **0** — 배포된 API·실 화면 직접 라이브QA |

### 라이브QA (실서버 · 이 브랜치 jar 배포 후)
배포 증명 — inventory·partner-order 이미지 `2026-07-24T01:58Z` / user·accounting `02:35Z`(커밋 이후).

| 표면 | `%` | `_` | 정상 검색 | 기준선 |
|---|---:|---:|---|---:|
| 창고 | **0** | **1** 🔑 | `창고`→19 · `공항공사_49차`→1 | 30 |
| 주문 native | **0** | **0** | `2026/`→33 | 33 |
| 주문 Criteria | **0** | — | `2026/`→31 | 31 |
| 사용자 관리 | **0** | **11** 🔑 | `김`→13 · `dev_master`→**1** | 99 |
| 분개장 | — | — | **`40%`→1** (fix 전 478) | 10(limit) |
| 매출/매입/일괄발행/입금보고서 | **0** | **0** | 각 정상 코드 무회귀 | 2512/35/733/367 |
| 수신 세금계산서 · ledger-partners | **리터럴 1** 🔑 | **리터럴 1** 🔑 | `QA919`→3 | throwaway 3 |

🔑 **`_` 가 0건이 아니라 1건·11건 나오는 것이 핵심**이다. escape 가 과했으면 0건이 나왔을 자리다. `dev_master` 가 **1건** 잡히는 것이 *"escape 때문에 정상 계정을 못 찾는다"* 를 반증한다.

SOL 이 `ledger-partners`·수신 세금계산서에 **throwaway 3건**(`QA919PERCENT%CODE` · `QA919UNDER_CODE` · `QA919BACK\CODE`)을 심어 **양성 대조**를 만들었다 — `%`·`_`·`\` 각각이 정확히 자기 행 1건만 잡는다. backslash 계열(`\`·`\\`·`\%`)에서 **500 이 한 건도 없었다.**

### U-gate — *"사용자가 실데이터로 무엇을 할 수 있게 되는가"*
> **검색창에 `%`·`_`·`\` 가 든 값을 넣어도 전건이 쏟아지지 않고, 그 문자를 실제로 포함한 것만 찾을 수 있게 된다.**

실행 완료 — 분개장 검색 `40%` 가 **478건 → 1건**(`도담회계법인_2024년 외부감사 잔금(40%)`). 실데이터 즉시 유용, 별도 백필·전제 없음.

### CI 필터 false-green 없음
신규 IT 2종이 속한 잡은 `--tests` allowlist **없이** 모듈 전체를 돌린다 — `accounting+partner`, `user+product+inventory+logging`.

## 6. 하네스 지표

| 라운드 | 도달가능 | c | r |
|---|---|---|---|
| OPUS 1차 | 0 | — (첫 라운드) | 0 |
| SOL 2차 | 0 | 정의 불가(직전 0) | 0 |

**fix-유발 결함 0 · 1턴 수렴.**

## 7. 회고 — PM 자기 QA 도구 오류 3회

이 세션에서 PM 의 측정 도구가 **세 번** 틀렸고, **세 번 다 "기준선을 함께 잰 덕에"** 결함 오보를 막았다.

| # | 오류 | 잡은 방법 |
|---|---|---|
| ① | CODEF scope 경로를 `/import-scope` 로 침(실제 `/accounting/codef/scopes`) → `NOT_FOUND` | DB 직접 조회와 대조 |
| ② | 주문 API 를 `/partner-orders` 로 침(실제 `/api/v1/partner-orders`) → 404 7건 | 컨트롤러 매핑 확인 |
| ③ | JSON 계수기가 `"id":` 를 셌는데 응답은 `journalNo` → accounting 4검색 전부 0건 | **검색어 없는 기준선까지 0건**인 것이 신호 |

🔑 **교훈**: 검색 결과가 0건일 때 그것이 fix 효과인지 내 도구가 틀린 것인지는 **"검색어 없는 기준선"을 같이 재야만** 구분된다. 기준선 없이 측정하지 말 것. → `feedback_realqa_run_and_false_red`(*"플랫폼 결론 전에 자기 QA 도구부터 의심하라"*)

## 8. 관련
- 기획서 `docs/superpowers/plans/2026-07-24-chore-global-escape-modal.md`(축 A·B 통합본)
- 축 B = PR #921(문서 모달 인쇄 배경 차폐)
- 메모리 `feedback_defect_family_sweep_fix` · `feedback_recon_grep_false_negative` · `feedback_ci_test_filter_false_green` · `feedback_gradle_test_cache_false_green`
