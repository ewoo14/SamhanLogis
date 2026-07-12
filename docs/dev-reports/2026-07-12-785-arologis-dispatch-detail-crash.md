# #785 arologis DispatchDetailPage 렌더 크래시 + NoResourceFoundException 404 매핑 (#803)

- **일자**: 2026-07-12
- **PR**: #803 · **연관**: #785 · #784(strict QA 발견) · **별건 개설 #804**(FE-BE DTO 불일치)
- **워크플로우**: 정찰 → 조기 PR → Codex 구현 → Opus 5-agent → fix → Codex 적대(재fix 유발) → 0수렴 → 라이브 QA(GUI+404 curl) → CI → 머지.

## 배경
arologis-desktop DispatchDetailPage 배차 상세가 특정 데이터 상태에서 **렌더 크래시**(NotifyResultSection undefined `.length`) + arologis-service `NoResourceFoundException`이 500으로 오매핑. #784 strict 라이브 QA 발견.

## 변경
| 결함 | fix |
|---|---|
| FE 크래시 (NotifyResultSection) | `vehicle.notifyResults` undefined → `notifyResults?:` optional + `rows = notifyResults ?? []` |
| FE 크래시 (VehicleMatchStatusBadge) | `STATUS_STYLE[status]` 미매핑 → `isVehicleMatchStatus` type guard·PENDING degrade + **BE 6값(DEPARTED/CANCELLED) 정합**·degrade fallback "상태 확인 필요"(raw 노출 제거) |
| FE 크래시 family (gpsSources·vehicles) | `InsungLbsPanel` `sources = gpsSources ?? []` + `dispatch.vehicles ?? []` — notifyResults와 동일 결함 전수 방어 |
| BE 예외 | `@ExceptionHandler(NoResourceFoundException)` → 404 NOT_FOUND·`log.warn` |

> 라우팅 미스매치(이슈 언급)는 `vite.renderer.dev.config.ts`에 rewrite 이미 존재(#784 하네스)해 무관·미수정.

## 리뷰 disposition
### Opus 5-agent R1
- **[HIGH·FE+QA 수렴] gpsSources 동일 defect family** → 채택(family sweep). **[MED·FE+Design 수렴] enum BE 6값 미정합**(DEPARTED=dev seeder 상시생성인데 "대기중" 오표시+raw 노출) → 채택. **[QA] 정상 4상태 테스트 부재** → 채택.
- **[QA P1·FE 근거] FE-BE DTO 전면 불일치** → **별건 #804**(SP-10-2 계약·범위 밖). BE LOW(404 직접호출)/INFO(fleet 500)·Design P2(빈상태)=backlog. DevOps 0.
### Codex 적대 R1 (gpt-5.5)
- A~D 검증: (B)(C)(D) 동의·**(A) 부분 반박 → `dispatch.vehicles` 무가드 추가 포착** → 재fix(family 완결). [HIGH] DTO 불일치 독립 재확인(=#804).
- **재fix 후 family 완전성 grep 재확인**(무가드 배열접근 0) → 0수렴.

## QA (실 스택 라이브)
- **FE crash→정상렌더 GUI**(`docs/qa/pr-803/dispatch-detail-no-crash.png`): 실 렌더러+실 arologis-service(:8097 신 jar·admin) `#/dispatches/detail/6fca3392-…` → **크래시 없이 렌더**(vehicle 2 row·pageerror 0·에러바운더리 부재). BE 응답 `matchStatus` 부재(#804)로 배지 "상태 확인 필요" degrade·raw 노출 없음.
- **BE 404 매핑**(curl 신 jar): 미매칭 → 404 NOT_FOUND / 정상 dispatch → 200.
- 변경 검증: arologis-desktop typecheck 0 + vitest **22 pass**(family 3필드 undefined·enum 6값·미지값 fallback) · arologis-service **539 tests 0-fail**(신규 404 케이스·--rerun-tasks).

## 후속
- **#804**: FE-BE DTO 계약 전면 정합(SP-10-2). 이번 fix는 크래시 방어까지·실 필드 표시는 #804 후.
- Design 빈상태 "발송 기록 없음"·fleet-wide NoResourceFoundException(12서비스)·404 @SpringBootTest 회귀 = backlog.
