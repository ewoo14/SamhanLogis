# #845 DS-2 문서 레이아웃 템플릿 구현 보고

## 범위

- groupware-service V10 `document_templates` 테이블, typed JSONB `DocumentPayload`, DRAFT/ACTIVE lifecycle, docType별 active 단일성, soft-delete를 구현했다.
- 기존 `groupware.approval-templates` 권한을 재사용한 관리자 CRUD/활성화 endpoint와 인증-only active 조회 endpoint를 추가했다.
- `ApprovalLineAdminResponse.documentType`를 노출하고 desktop 결재 인쇄가 활성 문서 레이아웃을 읽도록 연결했다.
- DS-1 parser와 동일한 구조 불변식에 64KB/JSON depth 16/band 32/element 64/key-name 100 상한을 추가했다.

## 검증

- BE: `./gradlew :services:groupware-service:test` — Testcontainers PostgreSQL에서 Flyway V1→V10 + `ddl-auto=validate`, CRUD/JSONB HTTP 왕복, 활성 단일성, 3-way 동시 활성화, bulk 강등 lock/audit, stale optimistic lock, CHECK/partial index, 30/31자 backfill, soft-delete를 검증한다.
- FE: `cd clients/desktop && npm run typecheck && npm run test` — parser/freeze/API/route-level real `DocumentRenderer`와 기존 DS-1 golden을 검증한다.
- 공용 fixture corpus는 `services/groupware-service/src/test/resources/document-template-fixtures`에 두고 BE/FE가 함께 읽는다.

## 경계와 가정

- 관리 UI와 편집기는 DS-3 범위로 두고 DS-2는 API와 렌더러 연결만 제공한다.
- active 레이아웃이 없으면 seed를 만들지 않고 FE canonical DEFAULT를 사용한다.
- `lock_version`은 내부 JPA 낙관락 전용이며 DTO에 노출하지 않는다. If-Match/ETag는 DS-3 후속 범위다.

## 적대검증 라운드 (2-모델 교차검증)

구현 후 OPUS 4.8 5-agent(R1)·CODEX SOL 5.6 5-agent(R2) 적대검증 + 재수렴 + 최종 OPUS 교차검증으로 수렴했다. CI green(false-green) 뒤에 숨은 결함들을 2-모델 교차로 포착했다.

- **R1 [CRITICAL] 활성 레이아웃 폐기**: `ApprovalDocView`가 `findActiveDocumentTemplate` 반환(이미 파싱된 full `TemplateEnvelope`)에서 `.document`(payload)만 추출해 재파싱 → 최상위 필드 부재로 실패 → **활성 레이아웃이 있어도 항상 DEFAULT 렌더**(핵심 기능 비기능). route-level 테스트가 presence-only false-green이라 CI 통과. fix = full envelope 전달 + 실 DocumentRenderer 출력 단언(sparse→문서번호/첨부 부재). 실 스택 라이브 재현·수정 확증.
- **R2 [BLOCKING] 5분 staleTime stale**: active-layout 쿼리가 전역 QueryClient 5분 staleTime 상속 → 활성화/비활성화 후 stale 레이아웃. R2 재수렴 [BLOCKING] A→B 캐시 전환(동일 QueryClient) 추가 포착. fix = `staleTime:0`·`refetchOnMount:'always'`·**`key={id}` InnerView + `key={docType}` Layout 2단 동기 remount**·현 fetch 완료 대기 latch.
- **parity/상태머신 다수(MED/LOW)**: Jackson scalar coercion strict(1/1.0/1e0 허용·1.9/"1" 거부), ECMAScript whitespace 판정 FE `trim()` parity, `rename()` ensureDraft 자체 가드, 동시 activate `CountDownLatch` barrier + `BusinessException(CONFLICT)` + HTTP 409 단언, backfill DEFAULT/soft-delete/NULL fixture, 권한 403/MASTER bypass, canonical artifact faithful 캡처(라운드트립 stage-2 배선).
- **선재/양성 처분**: `documentTypeFor` `GROUPWARE_${code}`(≤70자) > `document_type VARCHAR(40)` 오버플로 = 선재(입력템플릿 도메인·별건)·legacy `code="DEFAULT"`→`GROUPWARE_DEFAULT` sentinel backfill = 런타임 양성(예약 docType이 active 조회 null→DEFAULT 수렴·V10 불변)·generic Playwright 잡 `|| true` = 선재 CI infra(DS-2 무관·mock hard gate 580/580이 FE 게이트 권위).

최종: R1 재수렴 0 · R2 재수렴 양측 GO 0 · 최종 OPUS 교차검증 0 · CI 33/33 green(exact SHA). 2-모델 수렴.
