# 2026-07-03 — 분개 상세 라인 테이블 열 정비 (PR #711)

> 개발책임자 실화면 지적("차변 열이 너무 넓음·거래처를 차변 왼쪽으로", 이후 "합계열이 위 열과 안 맞음" 재지적)에서 출발한 분개 상세 화면 정비. 회사PC에서 시작, 집PC에서 재검~머지 완결.

## 무엇이 바뀌었나

- **열 재배분**: `# 40 | 계정과목 220→160 | 거래처 180→260(차변 왼쪽으로 이동) | 차변 140→110 | 대변 140→110 | 메모 flexible` — 차변 블록 좌측 당김 + 거래처 확대.
- **합계 = DataTable 마지막 행(sentinel) 편입**: 별도 div-grid 미러 폐기 — 열 정렬을 테이블 구조가 보장(재지적 근본 해소). `tableLayout="fixed"` + `.journal-total-row` 토큰 스타일(`--color-surface-secondary`/`--color-border-primary`, 다크 대응). 라인 0건 시 sentinel 미부착(emptyMessage 보장).
- **셀 ellipsis**: 계정과목명/거래처/메모 `JournalCellEllipsis`(overflow ellipsis + 조건부 title — `—`/`''` 제외). 결측 표시 `—` 3열·모바일 통일.
- **모바일 합계 카드**: 결합 문자열("차변 / 대변") 폐기 → 라인 카드와 동일 `.mobile-item-metrics` **2열 grid 분리 렌더**(10자리 금액 개행/절단 위험 원천 제거, `data-testid="journal-mobile-total"`).
- **테스트 자산**: 단위 8케이스(열 순서·3행 구조·라인별 차/대 값 배정[swap 회귀 고정]·합계행·0건·모바일 분리·title)·real-qa 강화(폭 ±2px·마지막 행·합계 exact·text-align·라인 레벨 swap·**결정적 ellipsis 발동**[메모 최장 분개 동적 탐색+1440→1152→1024 축소]·모바일 metric count 2·390×844 project 신설·분개번호 하드결합 제거[동적 탐색 — 환경 이식성]).

## 라운드 이력 (실행=게시 1:1, 총 게시 12)

1. Codex 개발(열 재배분) → 2. Opus 5-agent 리뷰(HIGH) → 3. Opus fix+라이브QA → 4. Codex 라운드(0)+개발책임자 실화면 재지적 최종 fix(열 순서·합계행 편입)
5. **[집PC] fresh Codex full 재검**(HIGH2·MED6·LOW2 — sentinel 빈상태·hex 토큰·real-qa 실효·이식성·ellipsis 등) + 라이브QA(스펙 데이터 전제 FAIL 실측→이식성 finding 편입·수동 실증 5캡처)
6. Codex fix 8건 → 7. **Opus full 재검**(BLOCKING1[fix⑧ 동시대 증거 무효]·HIGH1[값 절단 위험]·MED2) + QA 라이브(opus2 11캡처·1024px 메모열 실측)
8. Opus fix(모바일 2열 grid 구조 전환·실측 캡처) → 9. **Codex 재검**(MED2·LOW1 — metric .first() 중복 매칭·fallback 잔존) → 10. Codex fix2
11. **Opus full 재검2**(BE MED1[합계 단언은 차=대 불변식상 swap 판별 불가]·LOW1[항진명제]) → 12. Opus fix2(라인 레벨 값 배정·결정적 ellipsis — 1차 구현 PM 라이브 반려 후 재설계) → **Codex full 재검3: 전 차원 0건 — 0수렴**

## 검증

- vitest 8/8 · typecheck(+spec strict tsc) · real-qa 라이브 **2 passed+2 skipped**(project 상호배타 — docblock 명시) 라운드마다 재실행
- 라이브 GUI 실캡처 누적 20+장(SHA-pinned): 열 순서 실측·합계행 0.00px delta·모바일 분리 카드·다크 토큰 computed 실측·ellipsis 1152px 발동(368>124)·J- 구시더 0건

## 후속 이슈 (본 PR 에서 생성)

- **#713** 분개 라인 거래처·계정과목명 BE enrich(`JournalLineResponse` partnerName/accountName 미전송 — 실데이터 전행 `—`/코드만. FE 는 수신 즉시 표시 준비 완료) — 개발책임자 회신 대기 사안의 추적 이슈화
- **#714** 1024px(앱 minWidth) 메모 열 소실 — pre-existing(본 PR 이 고정폭 720→680 완화), 좁은 폭 열 배분 후속
- **#715** 분개 작성/편집 폼 — 합계 grid 5/6-트랙 미스매치(본 PR 이 상세에서 고친 동일 계열)·열 순서 상세와 불일치 — 공용 JournalLineRow 파급 검토 동반 별도 슬라이스

## backlog (비이슈)

- 결측 문자 이원화('-' vs '—', 분개 상세 정보 콜랩서블 — 미변경 영역)·`.report-total-row` 와 합계행 시각 강도 통일·DataTable footer/tfoot a11y API·단위테스트 DataTable mock `any` 정리·`accounting.ts:70` "BE 가 캐시" Javadoc 표현(실제 라이브 reduce).

## 교훈

- **증적은 대상 UI 를 실제로 담아야 한다**: "줄바꿈 해소" 주장의 인용 캡처가 fullPage:false 로 대상 요소 미포함 — 픽셀 분석으로 적발(BLOCKING). 이후 element 클로즈업 캡처를 관례화.
- **불변식 하의 단언 설계**: 차=대 동액 불변식 아래에서 합계 값 단언은 swap 회귀를 원리적으로 못 잡음 — 비대칭이 보장되는 라인 레벨로 검증을 내려야 함.
- **결정성은 데이터 아닌 설계에서**: 뷰포트 축소만으로는 텍스트 길이 의존(라이브 반려 실측 236=236) — probe 대상 동적 선정(최장 메모)+축소 사다리로 재설계.
- **고아 dev 서버 = false-RED 원천**: :5175 등 4개가 구버전 코드 서빙 중이었음 — 매 라운드 신규 포트+`--strictPort` 관례 유지, 세션 종료 시 정리.
