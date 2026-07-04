# 2026-07-04 — 계좌/카드 관리 메뉴 + 입출금내역 필터 모달 + '거래처' 컬럼 (PR #726, 이슈 #722)

> 개발책임자 지시 5건(#722) 기반. 입출금내역 관리 화면 개편: ①CODEF 등록기관 관리 메뉴 신설(등록/해제) ②계좌/카드 필터 모달(사용자별 기본값) ③'거래처 매칭'→'거래처' name-only. 순차 듀얼 캐논 완주(Opus 5-agent → Codex → 0수렴).

## 구현 (결정 D1~D5)

- **계좌/카드 관리 (D1·D3)**: CODEF 등록기관 관리 확장(자체 마스터 없음) — `BankCardAdminPage`(구 `CodefConnectionPage` 대체·orphan 제거) 등록/해제(`PATCH /codef/institutions/unregister` · 업무구분+기관코드 자연키 soft-delete). 신규 page-code `accounting.bank-card-admin` + **V81** auth 4테이블 권한 시드(MASTER/MANAGER 전권·ACCOUNTANT VIEW·system_master 제외 BOOL_OR materialize). 사이드바 '계좌/카드 관리'=입출금 내역 바로 위.
- **입출금내역 필터 (D2)**: `BankTransactionService.list` **소스 인식 필터** — 계좌 label→계좌 소스행(CSV/CODEF_BANK)·카드 label→카드 소스행(CODEF_CARD)·대출/KFTC 면제. 사용자별 기본값 **V54** `user_bank_txn_filter`(user_id 부분 unique·JSON TEXT·REQUIRES_NEW 유니크충돌 retry upsert) + `GET/PUT /filter-preferences`. FE 필터 모달=거래 실존 label 단일 소스.
- **'거래처' 컬럼 (D5)**: '거래처 매칭'→'거래처'·거래처명만(name-only·UUID/사업자번호 비노출).

## 라운드 체인 (실행=게시 1:1)

①**Codex 개발**(`d5da7a0e3`) → ②**Opus 5-agent R1**(BLOCKING4·HIGH1·MED5·LOW7): 필터 부분선택 팽창(B1)·소스인식 필터 대출/카드 소실(B4)·Playwright 이관 2·모바일 CSS 死셀렉터·register 멱등·라벨 공용화 등 → **Opus 직접 fix**(`50ff082b8`)+라이브 QA → ③**Codex 라운드**(HIGH1·MED3): **register 실패 시 관리화면 브릭**(activeConnection ACTIVE 강제)·unregister lock 미공유·필터 옵션 label 불일치(등록기관 label≠거래 label→0건)·reregister lastVerifiedAt → **Codex fix**(`ba3daebf8`: storedConnection 상태무관 조회·lockRegistration 공유·필터 거래label 단일화·lastVerifiedAt null) → ④**Opus 재검 4-agent 전원 0** → ⑤**Codex 재검 0**(whitespace nit 1 → `1bf750509` fix) → **양쪽 0수렴 확정**.

## 검증

- accounting **1106 tests / 0 fail**(실 Testcontainers PG — 소스인식 필터·register 멱등성·403 deny·ERROR 연결 resilience·reregister·lock IT) · desktop typecheck·vitest **540** · Playwright **8 passed**(codef 이관 + B1 부분선택 유지 회귀가드)
- 라이브 QA: 입출금내역 계좌 필터 부분선택 유지 5장(`docs/qa/726-bank-txn-filter/`)·계좌/카드 관리 shots 8장(`docs/qa/codef-task7/`) SHA-pinned 인라인 · `git diff --check` clean
- CI 30/30 green

## 📌 개발책임자 결정 (2026-07-04)

- **M1 ACCOUNTANT 권한 = 조회전용 유지** — 계좌/카드 관리는 CODEF 자격증명(비밀번호) 입력 화면이므로 MASTER/MANAGER 만 등록/해제, ACCOUNTANT VIEW. V81 그대로 확정.

## 파생/백로그

- CODEF connectedId='connected-main' 하드코딩(현행 유지·별도 이슈) · `CodefRegisteredInstitutionTest` 좁은 CI 필터그룹 미등재(전체 스위트 backstop·false-green 아님) · `bank-txn-filter.spec` nth(2) 날짜 선택자 testid 전환 권고 · E3 S4(FE 입금보고서 목록/작성폼)=본 건 머지 후 착수(같은 화면 접점)

## 교훈

- **소스 인식 필터 = 다중 label 을 단일 IN 으로 병합하면 소스 교차 소실** — 계좌 부분선택이 카드·대출을 함께 제거하던 결함(B4). label 을 소스별로 스코프하고 필터 UI 없는 소스(대출)는 면제해야 함.
- **필터 옵션 소스는 실 거래 label 단일화** — 등록기관 표시 label(기관명+업무구분)은 거래 `bank_account_label`(account ref)과 다른 네임스페이스라 병합 시 항상 0-매치 옵션 양산(Codex 적발). 필터는 filter-labels(거래 실존 distinct)만.
- **상태 전용 조회는 관리 기능을 브릭** — register 실패로 연결이 ERROR 되면 activeConnection() 의존 목록/해제가 전부 막힘. 저장 대상(등록기관) 관리는 상태 무관 조회로.
- **저장값 복원은 as-is** — 저장 필터를 options 전체로 union 하면 부분선택이 항상 전체로 팽창(B1). 표준 필터 UX=저장값 그대로.
