# 개발 메뉴 그룹 신설 — 설계 (spec)

> 2026-06-28. 개발책임자 지시(task#28). 인사 메뉴 아래 '개발' 메뉴그룹(개발자 권한 기본·권한설정 편입·모바일 최적화). 3메뉴: 팝업공지·버전관리(이전)·로그.
> 미준수 PR 보완(#627~641) 완료 후 착수. 정규 워크플로우(Opus 기획+PR→Codex 개발→순차 듀얼리뷰 5-agent+QA→0수렴→PM 머지).

## 0. 개발책임자 결정 (2026-06-28)
- **배포 메커니즘 = 버전 정책 발행**(현 V1 확장): '배포' 클릭 = 릴리스 active(published) 승격 → 버전 게이트가 published 최신 조회 → 전 클라이언트 안내(웹/PWA 자동 리로드, 데스크탑/모바일 재설치 안내). OTA 실 푸시 아님(추가 인프라 불요).
- **로그 범위 = 접근 + 액션 둘 다**: 메뉴 접근(라우트 변경) + 의미있는 액션(CRUD/발행/배포) 모두 기록. logging-service AuditLog(Elasticsearch ILM 월별 롤링)로 고대용량 감당.
- **팝업공지 = 게시기간 + 다시보지않기**: admin이 게시 시작/종료일 설정·기간 내 접속 시 팝업·사용자 '다시 보지 않기'(공지별 localStorage 영속). AppVersionGate 패턴 재사용.
- **권한**: DEVELOPER 롤(기존, RbacRole에 정의됨) + MASTER. dev.* page-code 신규·권한매트릭스 '개발' 그룹 편입·DEVELOPER 시딩.

## 1. 목표
인사 메뉴 아래 '개발' SidebarCategory 신설(DEVELOPER/MASTER 가시), 3 메뉴(팝업공지·버전관리·로그). 신규 인프라 0 — 기존 자산(DEVELOPER 롤·logging-service·MinIO·AppVersionGate/Modal·SidebarCategory·권한매트릭스) 재사용.

## 2. 공통 파운데이션 (DEV-1에 포함)
- **사이드바**: `AppLayout.tsx` 인사 그룹(SidebarCategory) 아래 '개발' SidebarCategory 추가. 권한 전무 시 미렌더. testId `sidebar-category-toggle-개발`.
- **page-code (per-slice 도입 — parity-safe)**: ⚠️ **page-code는 해당 메뉴(+ BE @RequirePermission 엔드포인트)와 함께 슬라이스별 도입** — FE page-code 선도입 시 대응 BE @RequirePermission 부재로 **FE↔BE parity 깨짐**([[feedback_fe_canaccess_pagecode_be_match]]). 따라서:
  - DEV-1 = 버전관리는 **기존 `admin.app-release` 유지**(rename 금지·기존 V1a/V1b/V1c BE 게이트 호환). `showDevelopmentGroup = canAccess('admin.app-release','view')`.
  - DEV-2 = `dev.popup-notice` 신규(메뉴+BE 엔드포인트 동시)·showDevelopmentGroup에 OR 추가.
  - DEV-3 = `dev.activity-log` 신규(메뉴+BE 동시)·OR 추가.
- **권한매트릭스**: `PermissionMatrixPage.tsx` PAGE_GROUPS에 `{ label:'개발', pages:[...] }` — DEV-1=`['admin.app-release']`, DEV-2/3서 page-code 추가.
- **시딩**: auth-service 시드에서 DEVELOPER × (DEV-1=admin.app-release, DEV-2/3=dev.*) view/edit=true (MASTER는 전권 기존).
- **모바일**: 각 화면 데스크탑+모바일(Capacitor/PWA) 반응형 [[feedback_fe_mobile_responsive]].

## 3. 슬라이스

### DEV-1 — 파운데이션 + 버전관리 이전 + 배포 버튼
- **파운데이션**(§2) 전체.
- **버전관리 이전**: `AppReleaseManagementPage` 라우트/사이드바를 인사 '릴리스 관리'(`/admin/app-releases`)에서 **개발 그룹**으로 이전(page-code `admin.app-release`→`dev.version` 또는 별칭 유지·기존 호환). 인사 그룹서 제거.
- **배포 버튼**: `app_release`에 **`is_published BOOLEAN`**(또는 `published_at`) 추가(Flyway, BaseEntity 7 불변 — 신규 컬럼). admin 화면에 **'배포'/'배포 취소' 버튼**(per-release). BE: 배포 = `is_published=true`(+ 동일 clientType 기존 published 해제 또는 최신 우선). **버전 게이트 `latestRelease()` → published 최신 조회**로 변경(미발행=테스트 상태, 사용자 미노출). 테스트(미발행)↔배포(발행) 구분.
- **검증**: 미발행 릴리스는 /app/version에 미반영·배포 후 반영·기존 V1b/V1c 버전 게이트 무회귀.

### DEV-2 — 팝업공지
- **BE**(dashboard-service 또는 신규): `app_notice` 엔티티 — `title`, `is_active`, `start_at`/`end_at`(게시기간), `display_order`, BaseEntity 7 + soft delete. `app_notice_image` — `notice_id`, `image_key`(MinIO object key), `display_order`, `caption?`. 이미지 **MinIO 저장**(기존 인프라, presigned URL).
- **공개 조회** `GET /app/notices/active` (인증 불요 또는 로그인 후) → 현재 게시기간 내 active 공지 + 이미지 순서. 
- **admin CRUD** `/app/notices`(@RequirePermission dev.popup-notice) — 공지 등록/수정/삭제·이미지 다중 업로드(MinIO presigned)·드래그 순서·게시기간 설정.
- **FE admin 설정 UI**: 개발 그룹 '팝업공지' 화면 — 공지 목록·CRUD 모달·이미지 업로드(다중)·순서(드래그)·게시기간(datetime-local, KST offset-less [[V1b 교훈]]).
- **FE 클라이언트 팝업**: 로그인/부팅 후 `GET /app/notices/active` → **design-system Modal + 좌우 캐러셀**(복수 이미지)·**'다시 보지 않기'**(공지별 localStorage 영속)·게시기간 내만. AppVersionGate 패턴(부팅 1회·dismiss 스토리지).
- **모바일**: 팝업 전체화면 모달·캐러셀 스와이프·admin 폼 1열.

### DEV-3 — 로그
- **재사용**: logging-service `AuditLog`(Elasticsearch) + RabbitMQ `samhan.audit.exchange`. 기존 `/logs/search?action=&fromInstant=&toInstant=`·`/logs/by-user`·`/logs/by-service`.
- **접근 로깅**: FE 라우트 변경 시 menu-access audit 이벤트 발행(게이트웨이 경유 또는 FE→audit 엔드포인트). `action:'MENU_ACCESS'`, `resourceType:'MENU'`, `resourceId:page-code`, userId/userRole/occurredAt. (디바운스·중복 억제.)
- **액션 로깅**: 기존 CRUD/발행/배포 이벤트 확대(각 서비스가 audit 발행 — 누락 메뉴 보완).
- **FE 로그 뷰어**: 개발 그룹 '로그' 화면 — 표(사용자·시각·메뉴·액션·대상)·**메뉴별 필터(page-code)+액션 필터+사용자+기간(datetime KST)+검색**·페이지네이션. /logs/search 소비. @RequirePermission dev.activity-log.
- **모바일**: 표 mobilePriority(시각·메뉴·사용자 primary)·필터 1열.

## 4. 에러/보안
- page-code FE↔BE 정확 일치([[feedback_fe_canaccess_pagecode_be_match]])·라우트 PermissionGuard 일원화.
- 이미지 업로드: MIME/크기 검증·MinIO presigned·자격 서버 보관.
- 로그: PII/UUID 비노출(비즈니스 식별자·userRole만)·접근 로깅 디바운스(고대용량 가드).
- 배포 발행: DEVELOPER/MASTER만·published 전환 감사 로깅.
- 사용자 노출 영어 enum/vendor/내부용어 0(한국어, sweep 교훈).

## 5. 테스트
- 슬라이스별 Docker 라이브 QA + 스크린샷(데스크탑+모바일). 권한 enforcement 실 HTTP([[feedback_enforcement_real_http_test]]). DEVELOPER/비DEVELOPER 가시성·진입 회귀.
- DEV-1: 미발행/발행 버전 게이트·버전관리 이전 무회귀. DEV-2: 팝업 게시기간·캐러셀·다시보지않기·이미지. DEV-3: 접근+액션 로깅·필터/검색.

## 6. 슬라이스 순서
DEV-1(파운데이션+버전) → DEV-2(팝업공지) → DEV-3(로그). 각 정규 워크플로우 0수렴 머지.
