# 입출금내역 관리 개편 — 계좌/카드 관리 메뉴 + 필터 모달 + 용어 (이슈 #722) spec

> 2026-07-04 개발책임자 지시 5건(이슈 #722 본문+코멘트 원문) + 정찰 실측 + 📌 결정 3건(4879944054·4879949341) 기반.

## 📌 확정 결정 (이슈 #722 기록)

| # | 결정 | 출처 |
|---|---|---|
| D1 | 계좌/카드 관리 실체 = **CODEF 등록기관 관리 확장**(codef_registered_institution 등록/해제) — 자체 마스터 신설 없음. CSV 자유 텍스트 계좌는 관리 대상 밖(필터에 자동 노출만) | 4879944054 |
| D2 | 필터 기본값 저장 = **별도 필터 설정 신설**(가져오기 범위 user_codef_import_scope 와 독립) | 4879944054 |
| D3 | 메뉴 위치 = **입출금내역 관리 바로 위**(회계 그룹) | 4879949341 |
| D4 | '회계반영'→**'반영'** | ✅ #724 에서 선반영 완료 |
| D5 | '거래처 매칭' 컬럼→**'거래처'** + 거래처명 검색 + **코드(사업자번호) 없이 거래처명만** 표시·기입 | 4879920879 |

## 요구 분해 (지시 원문 → 구현)

1. **계좌/카드 관리 메뉴 신설**(D1·D3): CODEF 등록기관(BANK/CARD/LOAN) 목록 화면 — 등록/해제(넣고 뺄 수 있게). 선례 = CodefConnectionPage(MASTER 전용) — 단 신설 메뉴는 회계 실무자 사용 화면이므로 page-code 신설(`accounting.bank-card-admin` 제안) + 권한 시드 V 마이그(auth) + PermissionMatrixPage 등재 + AppLayout SidebarLink(입출금내역 관리 위).
2. **필터 모달**(D2): BankTransactionPage 상단 CodefImportScopeForm(가져오기 범위 폼)은 가져오기 액션 내부로 이동/유지하되 **화면 필터와 분리**. 신설: '계좌'/'카드' 버튼 → Modal(등록된 계좌/카드 체크박스·전체선택 — CodefImportScopeForm 패턴 추출) → 선택 시 목록 필터 적용.
3. **필터 매칭 기준**: 거래행 `bank_account_label` 기준(거래와 직접 대응 — PM 기본값). CODEF 등록기관의 계좌 식별(ref/nickname)과 label 매핑은 **등록기관 목록+거래 실존 label 합집합**을 모달에 노출(CSV 자유 텍스트 계좌 자동 노출 — D1).
4. **사용자별 기본값**(D2): 신설 `user_bank_txn_filter`(user_id UNIQUE, account_labels TEXT[JSON], card_labels TEXT[JSON]) + GET/PUT API — 모달 확인 시 저장·진입 시 복원. (import scope 패턴 복제 — V46 선례)
5. **'거래처' 컬럼**(D5): 라벨 변경 + 표시 '거래처명만'(사업자번호·코드 제거) + PartnerAutocomplete 거래처명 검색(기존 autocomplete 재사용 — 표시 형식만 name-only).
6. BE 필터 확장: BankTransactionService.list — bankAccountLabel exact 단일 → **label 다중(IN)** + 카드 구분(source 탭과 조합). BankTransactionController 파라미터.

## 정찰 실측 (요약 — #722 정찰 에이전트)

- 계좌 목록 = CODEF 라이브(`GET /accounting/codef/bank-accounts|cards|loans`, connectedId='connected-main' 하드코딩 — 현행 유지, 별도 이슈)
- 자체 계좌 마스터 없음·bank_account_label 자유 텍스트(V43)·codef_registered_institution(V47)=등록기관 메타
- 사용자별 저장 선례 = user_codef_import_scope(V46)+`/accounting/codef/scopes`
- 체크박스 다중선택+전체선택 = CodefImportScopeForm:458-504(추출 재사용)·Modal=design-system
- 관리 화면 선례 = SupplierProfilePage(Modal CRUD)·CodefConnectionPage(등록기관)

## 함정

1. page-code 신설 시 FE canAccess=BE @RequirePermission 일치+auth 권한 시드 V 마이그(V80 선례)+ci allowlist 확인
2. 필터 label 다중 IN — 빈 선택=전체(필터 미적용) 의미 확정. 저장값에 없는 label(신규 계좌) 기본 포함/제외 정책 필요(기본=포함 제안 — 신규 계좌 누락 방지)
3. distinct label 조회 신설 시 soft-delete 제외·usage 없는 label 정리 고려
4. '거래처명만' 표시 — UUID/사업자번호 비노출 규약 정합(오히려 강화). 단 동명 거래처 구분 문제 → autocomplete 검색 결과에는 보조 식별(사업자번호) 유지, **표시 셀만** name-only (PM 제안 — 리뷰 정정 가능)
5. 모바일(카드 레이아웃) 파급 — BankTransactionPage 반응형 확인
6. 기존 은행계좌 자유 텍스트 Input 필터 제거 시 real-qa/manual 스펙 참조 갱신

## 검증 계획

IT: 필터 다중 label·user filter 저장/복원·권한 시드. 라이브: 관리 메뉴 등록/해제→필터 모달 선택→목록 반영→기본값 재진입 복원→'거래처' 명만 표시 — GUI 캡처.

## 이후

브랜치 feat/bank-card-admin-filter → 조기 OPEN PR → Codex 개발 → 순차 듀얼 캐논 → 머지. (E3 S4 는 본 건 머지 후 — 같은 화면 접점)
