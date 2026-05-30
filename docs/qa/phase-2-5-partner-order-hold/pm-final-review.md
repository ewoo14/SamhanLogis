# ✅ PM 최종 종합 리뷰 — Phase 2.5 주문 보류(ON_HOLD) + 리스트 상태 필터

> HEAD `8ce72cd1` · **CI 21 job + GitGuardian 전부 PASS** · ⚠️ Codex 다운 → Claude 5-team 전면 대체

## 결론: 머지 승인 (Docker 실 QA 후)

## 구현 요약
- **상태**: `ON_HOLD`(보류) enum 신규. 진행중(DRAFT)↔보류(ON_HOLD) 양방향, 완료(CONFIRMED) 보류 불가(slip 정합성).
- **전이**: `markOnHold`/`releaseHold` 도메인 메서드(409 가드) + `POST /hold`·`/release`(기존 edit UPDATE 권한 재사용, 신규 page 0).
- **리스트 필터**: status 필터 인프라 기존 활용 + **정렬/기간필터 COALESCE(confirmedAt, createdAt)** 통일(DRAFT/ON_HOLD confirmedAt=null 누락 해소) + count 쿼리 orderBy 가드.
- **FE**: 라벨 업무용어 통일(작성중→진행중/확정→완료/ON_HOLD=보류/CONFIRMING=확인중) + status 뱃지 색 역전 수정(완료=success/확인중=info) + ON_HOLD=warning + 보류/해제 버튼(warning variant, isPending disabled, 403/409 피드백) + 기본 필터 진행중.
- **마이그레이션 불필요**(status VARCHAR CHECK 제약 없음 — DevOps 검증).

## 사이클 이력
| 사이클 | 결과 |
|---|---|
| Cycle 1 (5팀) | P1 4(list 보정 불완전 ×2/FE 기간필터/뱃지) + Designer P1(뱃지 색 역전) + P2 다수. DevOps APPROVE |
| Cycle 1 fix | list COALESCE 통일 / 기간필터 분기 / 뱃지 색·variant / 버튼 disabled·403 / 라벨 통일 |
| Cycle 2 (재리뷰) | FE·QA APPROVE / BE P1-NEW(COALESCE orderBy가 컨트롤러 Sort에 무효화 + count 쿼리 위험) |
| Cycle 2c | 컨트롤러 Sort 제거 + count 쿼리 getResultType 가드 + IT case11(totalElements) |

## 검증
- **CI 21 job + GitGuardian PASS**
- **BE IT 11 케이스**(실 Postgres, skipped=0): hold/release/409(CONFIRMED·CONFIRMING)/release DRAFT 409/list status 3종/권한 403·MASTER 200/createdAt COALESCE 기간필터/전체조회/count 가드
- **단위 5**(markOnHold/releaseHold/CONFIRMING 409) + **Playwright 8**
- FE typecheck 0

## 잔여 (비차단 후속)
- hold/release STATUS revision 캡처(Phase 2.4 STATUS type 첫 실사용 후보) — 현재 전이 이력 미기록(dev-report 명시)
- ON_HOLD 복원 Phase 2.4 교차 IT / MASTER bypass verify(never) / `--state-neutral` 토큰 미등록(.statusDraft fallback)
- Designer Minor(버튼 배치/빈상태 메시지/audience-banner 하드코딩)

## 메모리 가드 일관성 ✅
[[cycle-n2-mandatory]](Codex 대체) / [[feedback_enforcement_real_http_test]] / [[feedback_qa_docker_real_test]] / [[feedback_continuous_docs_sync]] / [[feedback_korean_commits]] / [[always-mouse-choices]]
