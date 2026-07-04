# 2026-07-04 — 사용자 노출 메시지 enum 용어 한국어화 (PR #724, 이슈 #721)

> 개발책임자 지시("경고 문구의 'DRAFT 상태'는 기술용어 — 사용자가 알아보기 힘듦", 발단=#719 라이브 캡처)의 fix. 상태 라벨 BE SSOT 확립 + 사용자 메시지 전수 치환.

## 구현

- **SSOT**: 상태 enum **10종**(Journal/TaxInvoice/CashReceipt/Period/Sales·PurchaseSlip/Match/**Plan/Note**)+TaxInvoiceDirection 에 `displayName` — 도메인별 canonical=**기존 FE 화면 라벨**(정책 3)
- **치환**: 정찰 전수 28곳+추가 3곳(Inbound 첨부·**fix 중 재적발 2곳**) — 문형 유지·enum 원어 제거. `AccountingStatusDisplayNameTest` 로 라벨 drift 고정+대표 409 경로 **원어 부재 단언**(tautology 해소 — code 만 단언하던 IT 에 message doesNotContain)
- **'회계반영'→'반영'**(#722 지시): MatchStatus displayName+FE 라벨맵+통장 필터 탭
- **📌 지시 확장(fix=현재 PR 내 처리)**: IllegalState 3곳 회수 — BankTransaction require* **BusinessException(CONFLICT) 승격**(catch-all 500 마스킹→정상 409 사유)·CollectionPlan/NotesReceivable 영문 전이 메시지 한국어화·서비스 try/catch wrap 제거(형제 도메인 정합). 타 서비스 잔여분=#725
- mock parity: e-Tax·전이 거부 mock 메시지 한국어 라벨 헬퍼(BE 실메시지 구조 일치)·requireDraft 조사 해소(기지 백로그 "교체은" 종결)·slip 라벨 12종 SSOT 정렬

## 📌 라벨 판정 이력 (PM 판정 — 정책 3 기계 적용)

spec 초안이 FE 실물 미검증으로 3건 오기 → 리뷰 3차원(BE·FE·Design) 교차 적발·권고 상충을 정책 문면으로 일괄 판정: **DRAFT=임시저장**(FE 지배 라벨 — JournalDetailPage 로컬맵 동일 화면 모순도 해소)·**OPEN=열림**(FE 3화면+일마감 병렬)·**FORCED=강제**(FE 탭·배지 기존 표기).

## 라운드 체인 (실행=게시 1:1)

①Codex 개발(SSOT 8종·29곳·RED 선확인) ②Opus full: FE Major2(라벨 불일치)·Design HIGH2(**spec 함정 3 이 지목한 require* 패턴 정찰 누락**·화면 정합 근거 오류)·QA 0(**라이브 3경로**: 409 한국어 배너+원어 부재 정규식 단언·캡처 8장) ③📌 PM 판정+📌 지시(fix=현재 PR) ④Opus fix(라벨 3정정·승격 3곳 회수·조사·slip 12종) ⑤Codex full: **BLOCKING 2 — fix 가 신설한 문구에 원어 잔존**(PLANNED/BOARDING, 4차원 수렴 적발) ⑥Codex fix(SSOT 치환+원어 부재 단언) ⑦Opus 재검(전 차원 0·**독립 재수색 21종 토큰 전수 0**)+정리 fix(비블로킹 3 일소) ⑧Codex 경량 확인 승인 — **0수렴**

## 검증

- accounting 모듈 전체 3회(각 push 전) 0 fail(1,096 tests·skipped 10=기지 Windows 함정) · desktop typecheck+vitest 531·mock.test 29
- 라이브: 세금계산서 재발행 409 "발행은 임시저장 상태에서만 …(현재: 발행)"·분개 재역분개 409·통장 탭 '반영' — **enum 원어 부재 Playwright 단언** 포함 캡처 8장(SHA-pinned 인라인)

## 파생/백로그

- **#725**(타 서비스 IllegalState — slip 배차 11곳·partner-order 전용으로 축소) · untracked QA 스펙 2파일 구 라벨(차기 라이브 QA 시 갱신) · FE 분산 라벨맵 통합(비대상 유지) · JournalExcelExportService 독립 Excel switch(참고 기록)

## 교훈

- **fix 가 신설하는 문구도 같은 정책의 적용 대상** — wrap 제거하며 옮긴 문장이 자기 SSOT 를 안 쓴 것을 4차원이 수렴 적발. 치환 PR 에서는 "고치며 새로 쓰는 문자열"이 최대 재발 지점.
- **라벨 SSOT 채택은 FE 실물(지배 표면) 검증이 선행** — spec 표를 문헌만으로 작성하면 소수 표면 라벨을 canonical 로 오채택(3건 재발). 화면=메시지 일치가 판정 기준.
- 메시지 회귀 고정은 code 단언으로는 불충분 — **message 필드 원어 부재 단언**이 실효.
