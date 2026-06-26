# CODEF 은행·카드 거래내역 연동 (BC1) — 설계 (spec)

> 2026-06-26 개발책임자 "은행 API 가장 저렴한 방법 = CODEF" 확정 + "진행". 딥리서치([[docs/research/2026-06-26-bank-account-card-api-corporate-erp]]) 후속.
> **infra-now**: DRY_RUN mock 으로 어댑터·데이터모델·대사 흐름 구축, **실 CODEF API 호출은 회사 명의 계약·인증키 발급 후 활성**(가짜 연동 주장 금지).

## 0. 컨텍스트 (recon 확정)
accounting-service(8087)에 이미 존재:
- `BankTransaction`(V43, BaseEntity 7 audit+soft delete+CHECK) — 출처무관 거래내역 엔티티(`source` enum `CSV_IMPORT`/`KFTC`, `MatchStatus`, `matchedPartnerId`/`matchedJournalId` 내부키, `externalRef`).
- **KFTC 오픈뱅킹 계좌 shell (#239, ~90%)**: `KftcClient`/`KftcClientImpl`(DRY_RUN mock + 실 API stub, placeholder 4키워드 차단), `DepositMatchService`(fetch→거래처 매칭→DRAFT 분개), `DepositMatchController`, `BankTransactionController`, IT 10 + Playwright 5.
- 거래처 매칭 = `PartnerLookupClient` 재사용. staging raw 패턴(V22 ecount) 참조 가능.

**결정(개발책임자 "CODEF 최저비용")**: CODEF 는 **계좌+카드 모두 단일 애그리게이터로 수집** → KFTC 이용기관 자격(금융보안원 보안점검 수개월) 장벽 회피가 최저비용·최단. **KFTC shell 은 대안 source 로 유지**(제거 안 함). 본 BC1 = **CODEF source 추가**.

## 1. 목표 + 범위 (BC1)
`CodefClient`(계좌+카드 거래내역) + DRY_RUN mock + `BankTransaction` 확장(source `CODEF_BANK`/`CODEF_CARD` + 카드 필드) + 기존 `DepositMatch`/거래처 매칭 대사 재사용. **accounting-service 단일 확장**(신규 서비스 X).
**비범위**: 실 CODEF API 호출(키/계약 발급 후) · 적요→거래처 퍼지매칭 고도화(후속) · FE DepositMatch 카드탭 UI(BC2 후속) · KFTC 제거.

## 2. 아키텍처 (KftcClient 패턴 미러)
- `client/CodefClient.java` 인터페이스: `fetchBankTransactions(from,to,accountRef,submitMethod)` + `fetchCardTransactions(from,to,cardRef,submitMethod)` → `List<CodefTxn>`.
- `client/CodefClientImpl.java`: **DRY_RUN mock**(계좌 입출금 5건 + 카드 승인 5건, 결정적 데이터) + 실 API stub(`TODO Phase11/키발급`, placeholder 차단 `PLACEHOLDER_DEV_ONLY`/`CHANGE_ME_LOCAL_ONLY`/`changeme`/`dummy` case-insensitive). RestClient 패턴(WebClientConfig).
- `config/CodefProperties` 또는 `@Value("${codef.*}")`: `submit-method`(기본 DRY_RUN)·`api-key`·`client-id`·`client-secret`·`base-url`(기본 `https://api.codef.io`).
- `service/CodefImportService.java`: CODEF fetch → `BankTransaction`(source=CODEF_BANK/CODEF_CARD) upsert(externalRef 중복 차단) → 기존 거래처 매칭/대사 파이프(DepositMatchService 재사용). 카드=매입(지출) 방향.
- `web/CodefImportController.java`: `POST /accounting/codef/import`(기간·계좌/카드 ref, 온디맨드 조회) — @RequirePermission 회계 권한.

## 3. 영속 (Flyway V##, accounting-service)
- `source` CHECK 확장: `CHECK (source IN ('CSV_IMPORT','KFTC','CODEF_BANK','CODEF_CARD'))` ([[feedback_enum_expansion_check_constraint]]).
- 카드 컬럼 추가: `card_name VARCHAR(100)`(신용/체크 카드명), `approval_id VARCHAR(128)`(CODEF 카드 externalRef).
- UNIQUE active: `(bank_account_label, transacted_at, amount, external_ref) WHERE is_deleted=FALSE` 보존(중복 차단).
- **fresh Postgres probe 검증 의무**([[feedback_migration_fresh_postgres_probe]]): DROP/CREATE DB + seed + `psql ON_ERROR_STOP` 직접 적용.

## 4. 시크릿/자격 (정직·가드)
`codef.*` = ENV 주입(@Value), application.yml 기본 DRY_RUN. **평문 자격 커밋 금지**(GitGuardian·credential-plaintext-guard SP-08-8, placeholder 4키워드 차단). 실키=운영 PC .env/SSM(Phase11).

## 5. QA (실 검증 의무)
- **Testcontainers IT**: DRY_RUN fetch → BankTransaction(CODEF_*) 적재 + 중복 externalRef 멱등 + 거래처 매칭 대사. ([[feedback_qa_docker_real_test]])
- **Flyway fresh Postgres probe**: source CHECK 확장 + 카드 컬럼 마이그 직접 적용 검증.
- **RestClient 계약**([[feedback_restclient_contract_test_false_green]]): CodefClient 다운스트림(실 CODEF는 DRY_RUN이라 mock 정당, 계약형태 박제). PartnerLookupClient 계약.
- **ci.yml 필터**: 신규 IT 패키지 등재([[feedback_ci_test_filter_false_green]]).
- 무시드/미연동 화면 정직 보고(가짜 캡처 금지).

## 6. 워크플로우
canonical 8단계: spec→plan→조기PR→**Codex 구현(danger-full-access)**→④Opus 5-agent(BE/QA 중심)+fix↔⑤Codex 0수렴→⑥PM종합→CI green(Flyway probe·IT)→⑧PM 자율머지→핸드오프. BE 전용(FE 카드탭=BC2). 각 단계 ScheduleWakeup 자각.
