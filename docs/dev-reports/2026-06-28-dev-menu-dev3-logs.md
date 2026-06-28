# 개발 메뉴 그룹 DEV-3 — 로그 (활동 로그 뷰어 + 접근/액션 로깅)

> 에픽 task#28 3번째 슬라이스. spec `docs/superpowers/specs/2026-06-28-development-menu-group-design.md` §3 DEV-3. 에픽 `project_dev_menu_epic.md`.
> 표준 워크플로우 1단계(Opus 기획 + 조기 PR). 신규 인프라 0 — logging-service 자산 재사용.

## 목표
개발 그룹 '로그' 화면 — DEVELOPER/MASTER 가 시스템 활동(접근+액션) 감사 로그를 메뉴/액션/사용자/기간/검색으로 조회.

## 재사용 자산 (확인 완료)
- `logging-service` `AuditLog`(Elasticsearch `samhan-audit-logs`) — serviceName·userId·userRole·action·resourceType·resourceId·description·occurredAt.
- RabbitMQ `samhan.audit.exchange`(topic) + `AuditLogEvent` 와이어 포맷 — 각 서비스가 발행, logging-service 소비→ES.
- `POST /logs/front` — FE 프론트 이벤트 수집 엔드포인트(기존) → **MENU_ACCESS 발행 재사용**.
- `GET /logs/search`(action+기간), `/logs/by-user`, `/logs/by-service` — 게이트웨이 `/api/logs/**` = MASTER/MANAGER 전용.

## 구현 범위
### BE — auth-service
- page-code `dev.activity-log` 신규 + **V74 시드**(DEVELOPER+MASTER view/edit). V72(app-release)/V73(popup-notice) 패턴.
- `PageCode.java` 상수 추가.

### BE — logging-service
- **활동 로그 검색 확장**: `GET /logs/activity` 신규(또는 /search 확장) — optional `action`·`resourceType`·`resourceId`(=page-code)·`userId`·`q`(description text)·기간(`fromInstant`/`toInstant` KST)·pagination. Elasticsearch criteria(다중 optional 필터). `@RequirePermission(dev.activity-log, VIEW)` — DEVELOPER 접근 허용.
- MENU_ACCESS 수집: `/logs/front`(또는 전용) 가 `action:MENU_ACCESS`·`resourceType:MENU`·`resourceId:page-code`·userId/userRole/occurredAt 수신→audit 발행. (디바운스는 FE.)
- PII/UUID 비노출 — userRole·비즈니스 식별자만 응답.

### BE — api-gateway
- 활동 로그 뷰어 엔드포인트 라우트(JWT 인증 + 서비스 @RequirePermission(dev.activity-log) — DEVELOPER 허용). 기존 `/api/logs/**` MASTER/MANAGER 전용과 분리.

### FE — desktop
- 개발 그룹 사이드바 '로그' 항목(`dev.activity-log`)·`showDevelopmentGroup` OR 추가.
- **로그 뷰어 페이지**: 표(사용자·시각[KST]·메뉴·액션·대상)·필터(메뉴 page-code·액션·사용자·기간 datetime KST·검색 q)·페이지네이션. `/logs/activity` 소비.
- **접근 로깅 훅**: 라우트 변경 시 디바운스(중복 억제)→MENU_ACCESS 발행.
- `PermissionMatrixPage` 개발 그룹에 `dev.activity-log` 추가. mock.ts 핸들러(검색 필터·front 이벤트).
- 모바일: 표 mobilePriority(시각·메뉴·사용자)·필터 1열.

## 에러/보안
- page-code FE↔BE 정확 일치([[feedback_fe_canaccess_pagecode_be_match]])·라우트 PermissionGuard 일원화.
- 로그 PII/UUID 비노출(userRole·비즈니스 식별자만)·접근 로깅 FE 디바운스(고대용량 가드).
- 사용자 노출 영어 enum/내부용어 0(한국어).

## 테스트
- logging-service IT: 활동 검색 다중 필터·권한(DEVELOPER 200/비권한 403) 실 HTTP([[feedback_enforcement_real_http_test]]).
- Playwright: 뷰어 필터/검색/페이지네이션·MENU_ACCESS 발행·권한 게이팅·모바일. mock 회귀 유지.
- **Docker 라이브 QA(mock OFF)** + 데스크탑/모바일 스샷.

## 워크플로우
Opus 기획+조기 PR(본 PR) → Codex 개발 → 순차 듀얼리뷰(Opus 5-agent+fix+라이브QA ↔ Codex) 0수렴 → PM 종합 → CI green → PM 머지. + DEV-2 완료 docs 동기화(overview Pages) 동반.
