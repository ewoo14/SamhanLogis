# QA — 거래처(Partner) RESTORE 버전이력 (PR #320, Phase 2.3)

> Docker 실 QA. 2026-05-30. partner-service 를 현재 브랜치(`feat/phase-2-3-partner-restore`)
> 로 **재빌드**한 컨테이너(:8095) 대상. desktop renderer(web, :5173)를 헤드리스 chromium
> 으로 실사용 흐름 단계별 촬영. 캡처 스크립트: `clients/desktop/playwright/partner-restore-qa/capture.mjs`.

## 1. 실서버 기능 검증 (HTTP, partner-service:8095 직접)

| 단계 | 결과 |
|---|---|
| `POST /api/v1/partners/full` (등록) | **201** → rev1 CREATE 캡처 |
| `PATCH /api/v1/partners/{code}/full` (편집: 상호+할인 변경) | **200** → rev2 EDIT (헤더1·자식~1) |
| `GET /api/v1/partners/{code}/revisions` | **200** → rev2/rev1 최신순 |
| `POST /api/v1/partners/{code}/revisions/1/restore` | **200** |
| 복원 후 `GET .../full` | **상호/할인/결제기간 rev1 시점으로 원복 확인** |
| 복원 후 revisions | **3건, 최신=RESTORE(source=1)** |

→ full-snapshot JSONB(V12 `partner_revisions`) + point-in-time 복원이 실 Postgres 에서 정상.

## 2. 실사용 UI 캡처 (단계별)

| # | 파일 | 장면 |
|---|---|---|
| 01 | `01-login.png` | 로그인 (dev_master) |
| 02 | `02-dashboard.png` | 로그인 후 대시보드 (MASTER) |
| 03 | `03-create-form.png` | 거래처 신규 등록 4탭 폼 |
| 04 | `04-partner-list.png` | 등록 후 거래처 목록 (거래중) |
| 05 | `05-detail-dialog.png` | 상세 다이얼로그 (4탭+버전이력) |
| 06 | `06-edit-mode.png` | 인라인 편집 (상호 수정) |
| 07 | `07-after-save.png` | 저장 후 (상호 `…-수정` 반영) |
| 08 | `08-version-history.png` | **버전 이력 탭 — rev2 수정 / rev1 생성 + "이 시점으로 복원"** |
| 09 | `09-restore-confirm.png` | 복원 confirm 모달 |
| 10 | `10-restore-success.png` | **복원 성공 toast + rev3 복원(rev 1) 추가** |

## 3. 발견 사항 (findings)

### PR #320 범위 — 실 QA 로 발견 후 **수정 + 재검증 완료** ✅
- **F4 [P1, UUID 노출] → 수정됨** 버전이력의 EDIT revision actorName 이 계정 UUID 로 표시되던 문제.
  원인: `Partner4TabController#updateFull` 이 `principal.getName()`(헤더인증 principal = X-User-Id =
  **UUID**)을 actorName 으로 전달(게이트웨이가 X-User-Name 미전파). → **[[uuid-no-user-visibility]] 위반**.
  - 수정(BE): `Partner4TabController#updateFull` 이 **X-User-Name 헤더를 우선** actorName 으로 사용
    (RESTORE 컨트롤러와 일관) + 헤더 부재 시 `displayNameOrNull()` 가드(principal 이 UUID 면 null →
    service 가 actorId=system 폴백). 게이트웨이가 X-User-Name 미전파 → 운영에선 actorName 미표시(누출 0).
  - 수정(FE 방어): `PartnerVersionHistoryPanel` 이 UUID 형태 actorName 을 렌더하지 않음.
  - 재검증: 재빌드 후 `08`/`10` 의 rev2 "수정" 에 **UUID 미노출**(actor 칸 비움) 확인.
- **F5 [P2, FE stale] → 수정됨** `PartnerDetailDialog` 편집 저장이 `['partnerRevisions', code]` 를
  invalidate 하지 않아 버전이력이 stale(rev2 누락) 이던 문제.
  - 수정(FE): 저장 onSuccess 에 `invalidateQueries(['partnerRevisions', partnerId])` 추가.
  - 재검증: **리로드 없이** 저장 직후 '버전 이력' 탭 전환만으로 rev2(EDIT) 즉시 표시 확인(`08`).

### 인프라/게이트웨이 (PR #320 무관, 별도 트랙 — 운영 스택이 2026-05-22 stale 이미지였음)
- **F1** `api-gateway` 라우트 `/api/v1/partners/**` StripPrefix=2 ↔ 4tab/revision 컨트롤러
  풀패스(`@RequestMapping("/api/v1/partners…")`) 불일치 → 게이트웨이 경유 시 `No static resource`(404).
  no-strip 라우트 필요(blocks/orders 처럼). 본 QA 는 :8095 직접 프록시로 우회.
- **F2** `/auth/**` 라우트에 `JwtAuthentication` 필터 미적용 → `/auth/admin/permissions/my` 403
  (게이트웨이가 X-User-Id/Role 미주입). 권한매트릭스 stub 으로 우회.
- **F3** `/admin/partners/search` 의 `lower(bytea)` SQL 오류 → 목록 500 (partner DB 스키마/검색식).
  목록 stub 으로 우회.

> F1~F3 는 실행 중이던 로컬 스택 이미지가 PR #316/#320 이전(2026-05-22) 빌드였던 점과 결합된
> 게이트웨이/스키마 격차다. QA 는 partner-service 만 현재 브랜치로 재빌드 후 :8095 직접 적중으로 기능을 검증했다.
