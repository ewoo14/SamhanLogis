# Dev Report — 배차 보드 개편 + 전역 협업 문서 플랫폼 에픽 (#463)

> 2026-06-11 개발책임자 야간 자율 위임: **#463 에 배차 관련 내역 전부 + 전 전표/화면 협업 플랫폼 기술 슬라이스까지 모두 적용**. 한 사이클만 돌고 머지 금지 — **PM 은 리뷰 error=0 AND skip=0 도달 후에만 머지**. 본 문서 = 실행 체크리스트 + 진행 누적(아침 보고용).

## 스코프 (2 spec)
- 배차 보드 고도화: `docs/superpowers/specs/2026-06-11-dispatch-board-enhancement-spec.md`
- 전역 협업 플랫폼: `docs/superpowers/specs/2026-06-11-collab-document-platform-spec.md`

## 진행 현황 (커밋 누적)
| # | 청크 | 상태 | 커밋 |
|---|---|---|---|
| 0a | E0 보드 실연동(게이트웨이+envelope) | ✅ | 3cec1acd |
| 0b | 완료배차 뷰 → R1 fix(DISPATCHED 한정) | ✅ | 6acf3812 |
| 0c | R2 fix(real-qa 강화 + 슬립→전표) | ✅ | 757be335 |
| 0d | **메뉴 IA**(배차현황 등 3 rename + 배차 메뉴·수동 배차 삭제) | ✅ | e4bdee6b |
| 0e | 배차현황 실 QA 재캡처 + 협업 spec | ✅ | 22a014f9 |
| 1 | **collab-core C0**(공유 협업 서브시스템 골격, 컴파일 검증) | ✅ | f06bd0a0 |
| 2a | **배차 코멘트 BE**(C1a: DispatchCollabComment + V37 + 컨트롤러 + SSE, 실 Postgres CI) | ✅ | 95d1c5a4 |
| 2b | **배차 코멘트 FE**(C1c: DispatchCommentThread + 실시간 SSE, E2E 동작) | ✅ | 2d7bb284 |
| 2c | **수정제안/revision**(E3/E5 — 구성-mutation 적용 정책) | 🚩 아침 정책 | |
| 5a | **배차현황 차량번호**(vehiclePlateNumber additive — 우리측 수신/표시) | ✅ | 5a278eb9 |
| 3·4·5b·6·7 | 2-pane 보드·2축 차량모델·차량번호 arologis 생산자+SMS feed·다중 vendor·전역 롤아웃 | 🚩 아침 정책/설계 | |
| 8 | 다모델 리뷰 3라운드 + fix → CI green → Docker 실QA → 머지 | ⏳ 수렴 중 | |

## 리뷰 (다모델, [[temp-multimodel-workflow]]) — 누적분 3라운드 완료
- **R1 Opus** ✅(원 #463 P1 → 6acf3812). **R2 Codex** ✅(P2 → 757be335).
- **누적분(메뉴 IA·C0·C1a·C1c·플레이트) 3라운드**: Opus 5-agent ✅(P1×4 → BE e460209b·FE 4b17acab) → Codex 5-dim ✅(P1 cross-task IDOR·P2 → 28bcfdfb) → **Fable5 5-agent** ✅(UUID 단언 vacuous 8파일·보드 계약·authorName·collab 동시성 → 3a 7a410169·3b 0606a209).
- 머지 전 잔여: **PM 종합 + Docker 실QA(slip-service 재빌드) + 아침 정책 확정**.

## 🌙 야간 자율 요약 (아침 핸드오프)
**완결+CI green**: 메뉴 IA(배차현황) · 배차현황 뷰(R1/R2 fix) · 협업 코멘트 BE+FE(C0/C1a/C1c, 실시간 SSE, 실 Postgres IT) · 배차현황 차량번호. 슬립→전표 용어. 3라운드 다모델 리뷰(Opus·Codex·Fable5) + 전건 fix.
**아침 결정 필요(머지 게이트)**: ①실명 표시=auth-service JWT name claim 추가(현재 "system" 폴백+게이트웨이 strip 으로 위조 차단) ②차량번호 arologis 생산자 배선 ③수정제안 구성-mutation 적용 정책(어느 상태 편집 허용·accept 시 arologis 재발송) ④2축 차량 arologis enum 확장 vs lossy ⑤2-pane 보드 대상 화면. 위 ①~⑤ 확정 후 잔여 청크 진행 + 머지.

## 🚩 개발책임자 아침 검토 플래그 (야간엔 PM 기본값으로 진행)
1. **2축 톤수 매핑**: 소형(오토바이/승용차/다마스/라보)=톤수 없음, 그 외=1~25톤 전체. 기본 카고/1톤. config 맵 분리. (dispatch spec §1)
2. **arologis 차량 enum 호환**: `DispatchVehicleType`(9값)이 arologis-service 와 enum-name 와이어 공유 → 2축 신톤수(1.2/1.4/11/14/18/25)는 legacy 와이어에 **무손실 표현 불가**. PM 야간 기본값 = **additive(slip 측 차종+톤수 신규 필드 추가, legacy vehicleType 은 톤수→nearest legacy 파생으로 arologis 무변경 유지)**. 아침 결정: arologis VehicleTonnage 도 신 모델로 확장 vs lossy 호환 유지.
3. **collab 테이블 배치**: 각 서비스 DB 스키마(라이브러리 Flyway) = PM 기본값(DB-per-service 유지). vs collab 전용 서비스.
4. **2-pane 보드 대상 화면**: 가배차리스트(/arologis/pre-classify)를 좌우 2-pane 로 재설계(PM 기본값 — 개발책임자 "좌측=가배차 진행 화면"). 기존 /dispatch-board 팔레트는 de-menu 됨.

## 원칙 준수
[[codex-implements-claude-reviews]](Codex 구현) · [[no-fake-data-ever]](실데이터/실QA) · [[qa-docker-real-test]](Docker 실서버) · [[enum-expansion-check-constraint]](CHECK 마이그) · [[jeonpyo-not-slip]](전표) · [[pr-qa-screenshots]](본문 인라인) · [[korean-commits]]. 머지 = 0 error/0 skip + CI green + Docker 실QA 후.

---

# PR #464 — 배차현황 실 데이터 (코멘트 실명 + 차량번호/기사명) · 2026-06-12

#463 머지 후 배차현황의 실 데이터 갭 2건을 완성. 다모델 워크플로우 3라운드 완주.

## 구현 (Codex)
- **#1 코멘트 작성자 실명**: shared/common `JwtTokenProvider` displayName("name") claim → auth-service login JWT → api-gateway `X-User-Name`(URLEncode UTF-8, 위조 strip) → slip 코멘트 작성자 실명. "system" 폴백 유지.
- **#1 모지바케 해소(charset-repair)**: 게이트웨이 URL-encoded `X-User-Name` 을 Tomcat 이 ISO-8859-1 로 읽어 0xED("터") 깨지는 경로 → 공용 `shared/security/UserHeaderDecodingFilter`(OncePerRequestFilter, FilterRegistrationBean 자동등록) 중앙 디코딩 + high-bit ISO-8859-1→UTF-8 복원(well-formed 게이트). [[x-user-name-header-charset-mockmvc]]
- **#2a arologis 자동공급**: Insung 응답 driverName/vehiclePlateNumber → Driver(V18) → confirm payload(MatchedDriverPayload 7필드) → slip 표시. MockDriverMatcher plate=null 유지([[no-fake-data-ever]]).
- **#2b 타사 수동기입**: PUT matched-driver(배차담당자, driverCode=MANUAL, @RequirePermission dispatch.board UPDATE, cross-task 404). FE 화면엔 driverSource(경기퀵 등) 표시(MANUAL sentinel 숨김).
- **전화번호 nullable 전 계층**: 외부 기사 phone 더미("010-0000-0000") 제거 → null 허용. arologis drivers phone nullable+partial unique(V19)+더미 backfill(V20), slip dispatch_matched_driver phone nullable(V40)·driver_code 50(V39). [[no-fake-data-ever]]
- **용어**: 화면 라벨 "협업 코멘트" → "코멘트"([[comment-not-collab-comment]]).

## 다모델 리뷰 3라운드 (각 QA agent + Docker 실QA 스크린샷 라운드 코멘트 인라인)
- **Opus 5-agent**: P1 게이트웨이 X-User-Name 인코딩 광역화→다수 서비스 모지바케(공용 필터 sweep) · P2 webhook name/plate 대칭. fix 완료.
- **Codex 5-agent(GPT-5.5)**: P1 게이트웨이 X-User-Department 스푸핑 strip 누락 · P1 confirm 검증 전 전이/silent skip · P2×9(404 UUID·필터 트리거·Insung 결손·길이정합·IT). 전건 fix.
- **Fable5 5-agent**: P1 전화번호 nullable 전 계층 전파(배차 task 고착 회귀) · P2 authorName 길이 500·vendor 길이·수동기입 soft-delete/409·MANUAL 노출·테스트 공백. 전건 fix. REFUTE: 필터 MockMvc 미포함(경험적 반증) → ApplicationContextRunner 와이어링 테스트.

## 🔴 보안 발견 → 분리 (이슈 #465)
Fable5 보안 에이전트: 게이트웨이 `/auth/**` catch-all(JwtAuthentication 미적용) + `default-filters` identity 헤더 무strip → 위조 `X-Is-System-Master:true` 로 `POST /auth/register` @RequirePermission 우회(권한 상승). **기존 결함(#464 비기인), 전 라우트 영향 → 이슈 #465 + 전용 PR(개발책임자 승인)**.

## DEFER (개발책임자 정책 대기)
confirm sequence 완결성(groups⊆payload, unavailable 상호작용) · 수동기입 task-status 게이트 + vendor가 MANUAL 덮어쓰기 우선순위.

## QA
docs/qa/dispatch-author-plate/author-plate-live.png — 실 게이트웨이:8080 · 실 Postgres · mock OFF · dev_master. 작성자 "[DEV-SEED] 개발마스터"(한글 정상) + 차량번호 "12가7890" + 기사 "(경기퀵)" + "코멘트" 라벨. 라운드마다 재빌드 후 재캡처 인라인 게시.

머지 = 3라운드 0 error/0 skip + CI green + Docker 실QA 후 PM 종합.
