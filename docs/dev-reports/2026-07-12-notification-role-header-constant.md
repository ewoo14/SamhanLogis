# 알림 role 헤더 하드코딩 → 공용 상수 + null-role/헤더누락 테스트 커버 (#801)

- **일자**: 2026-07-12
- **PR**: #801 · **연관**: #795(알림 게이트웨이 500 fix·#799 `aae3d581c`)
- **워크플로우**: 조기 PR → Opus 5-agent(FE/BE/Design/DevOps/QA) → fix(`cda2999cf`) → Codex 5-agent 적대(gpt-5.5·`codex exec`) → 0수렴 → 실서버 라이브 QA → CI green → PM 종합 → 머지.

## 배경
#799(알림 게이트웨이 500 fix)가 `NotificationCenterController`의 `X-User-Role`을 `required=false`로 완화했다. 그 **후속 위생 슬라이스** — 하드코딩된 헤더 리터럴을 공용 상수(`shared/common` SSOT)로 통일하고, #799로 생긴 null-role 접근 경로 및 헤더 누락 예외 응답을 회귀 테스트로 고정한다. **런타임 동작 무변경**(예외 메시지 마침표 1자 정렬 제외).

## 변경
| 파일 | 내용 |
|---|---|
| `NotificationCenterController` | `@RequestHeader("X-User-Role")` 리터럴 3곳(my/history/acknowledge) → `HttpHeaderConstants.CALLER_ROLE_HEADER` (값 "X-User-Role" 동일·required=false 유지) |
| `DispatchSmsSaveHistoryController` | 동일 서비스 내 role 헤더 리터럴 4곳(save/list/detail/latest) → 상수. **family sweep 완결**(리뷰 R1 BE HIGH) |
| `NotificationExceptionHandler` | `handleMissingRequestHeader` 메시지 `"…누락되었습니다"` → `"…누락되었습니다."`(형제 4종+repo 13서비스 동일 핸들러 마침표 종결 정합·리뷰 R1 Design MINOR) |
| `NotificationCenterServiceTest` (+2) | acknowledge role=null: target_user_id 매칭 허용 / role broadcast 거절 |
| `NotificationExceptionHandlerTest` (+1) | MissingRequestHeaderException→400 중립 한국어 메시지 + 헤더명 미노출 |

## 리뷰 disposition
### Opus 5-agent R1
- **BE**: [HIGH] DispatchSms 4곳 raw 리터럴 잔존(family sweep 미완) → **채택·fix**. [LOW] roleHeader dead 파라미터 주장 → **검증 후 기각**(false-positive). [LOW] Javadoc 부정확 → backlog.
- **Design**: [MINOR] 예외 메시지 마침표 이탈(13서비스 대조) → **채택·fix**. [MAJOR] X-User-Id 누락 400↔401 정책 / [INFO] 형제 collab 헤더명 노출 → backlog(범위 밖).
- **QA**: P2(=BE HIGH 동일) + 라이브 QA 시나리오. CI 직전 SHA 425/425 실측. 기존 `NotificationCenterControllerIT`가 role-less 3시나리오 이미 커버(unit+IT 이중 안전망).
- **FE / DevOps**: 0 findings.

### dead 파라미터 기각 근거 (Opus·Codex 독립 확증)
`roleHeader`는 dead 아님 — `shared/security` `PermissionAspect.extractHeader()`가 리플렉션으로 `@RequestHeader` 파라미터를 소비(deny 로그/메트릭 `roleCode` 라벨). notification-service는 기본 enforcement=account(`roleBasedEnforcement=false`)라 인가 결정(ALLOW/DENY)엔 무영향이나 파라미터 선언 자체가 AOP 소비 대상 → **맹목 제거 시 springdoc OpenAPI 헤더 surface 변경**. 미제거 확정.

### Codex 5-agent 적대 R1 (gpt-5.5·danger-full-access)
`mcp__codex__codex` 30분 무응답 abort(MCP 세션 한계) → `codex exec` CLI 폴백. **A~D 전부 독립 동의·5차원 0 findings**:
- (A) `javap -v`로 annotation `value="X-User-Role"` **컴파일타임 인라인** 실증 → 런타임 계약 동일.
- (B) 프로덕션 raw 리터럴 0(주석만)·7곳 전부 상수.
- (C) `PermissionAspect.extractHeader():213-224` 리플렉션 소비 확인 → dead-param 기각 정당.
- (D) 옛 문안 단언 잔존 0.
- QA: 신규 테스트가 tautology 아님(canAccess 분기 + repository `:role IS NOT NULL` 쿼리 정합).
- Codex 직접 `gradlew …Test --rerun-tasks` → BUILD SUCCESSFUL.

## QA (실서버 라이브)
- **변경 모듈 전체 테스트**: `:services:notification-service:test --rerun-tasks --no-build-cache` = **225/225 pass · 0 skip**(IT/Testcontainers 포함·캐시 아님).
- **신 jar 재배포**: bootJar → `docker cp /app/app.jar` + restart(16:47 fresh boot 확인).
- **게이트웨이 200 스모크**: dev_master 로그인 → `/api/notifications/my` **200** `data:[]` · `/history` **200** paged. #799 500→200 회귀 유지(role 헤더 미주입→null 바인딩·required=false).
- **publish→my 실데이터**: `/internal/notifications`(X-Internal-Token)로 벨 항목 시드(targetUserId=dev_master) → `/my` **200**에 실 제목/severity/readAt:null 반영. null-role 경로 + 상수 바인딩 라이브 실증.
- **직접포트 400 재현 = 불가 확인**: `:8093` 헤더無 요청은 컨트롤러 `@RequestHeader` 400 이전에 `HeaderAuthenticationFilter` **401**이 선행 차단. 400 핸들러는 unit test로 계약 고정(방어적).
- **GUI 벨 스샷**: 실 데스크탑(vite renderer dev·mock OFF·게이트웨이 :8080·dev_master) 알림 벨 캡처 2장 — `docs/qa/pr-801/01-home-bell-badge.png`(홈 벨 미확인 배지 "1")·`02-bell-dropdown-seeded.png`(드롭다운 "메신저 (1)"에 시드 알림 제목+본문 렌더). Playwright 단언(`notification-row-5424c726…` visible+innerText) 통과. **상수 리팩터 → 벨 GUI 회귀 없음 실증**. (1차 false-RED = PWA 스텁 미해소 HMR 오버레이·기능결함 아님·`vite.renderer.dev.config.ts`로 해소.)
- **acknowledge 실측**: `POST /api/notifications/{id}/acknowledge` **200** → `/my` 미확인 0건(목록 제외) → history readAt `2026-07-12T17:05:31` 설정. 상수 치환된 acknowledge(role=null·userId 매칭 허용) 라이브 GREEN. **컨트롤러 3 endpoint(my/history/acknowledge) 전부 실증.**
- **투명 시드 롤백**: QA 시드 물리 삭제(`DELETE 1`·source_service='qa-seed-801' 가드) → `/my` 미확인 0건·HTTP 200 원복. dev 데이터 무손상.

## CI
`cda2999cf`(HEAD) CI **26개 잡 전부 success · 0 실패/스킵**(phase9-10 notification 포함·전 프론트/백/가드). CI on exact SHA = 권위 게이트.

## Backlog (범위 밖·별건)
- 신원헤더 누락 상태코드 정책(notification 일괄 400 vs 형제 collab X-User-Id 401·desktop 인터셉터) — 개발책임자 정책 결정.
- 형제 collab 핸들러(groupware/slip/accounting) `sanitize(getMessage())` 헤더명 미제거 개연 — 타서비스 위생.
- DispatchSms `X-User-Id` 로컬상수 `CALLER_HEADER` → shared `CALLER_ID_HEADER` 통일 — repo 전역 ID헤더 위생(role 헤더 슬라이스 범위 밖).
