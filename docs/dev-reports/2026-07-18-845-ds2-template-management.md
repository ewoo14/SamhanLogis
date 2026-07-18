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
