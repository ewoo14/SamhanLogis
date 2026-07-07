# #714 분개 상세 1024px 메모 열 소실 — 회귀방지 real-qa + 1440px 비례확대 단언 정정

- PR #764 · 브랜치 `fix/714-journal-detail-memo-column-narrow` · 이슈 #714 · 연관 #711/#737

## 결론
**핵심 폭 fix는 이미 PR #737(2026-07-05)에 배선됨** — 분개 상세 라인 테이블 6열 전부 명시 고정폭(#40+계정과목160+거래처260+차변110+대변110+메모180=860px)이라 DataTable `tableLayout='fixed'`가 좁은 폭서 압축 대신 내장 가로스크롤. 현재 코드 1024px서 메모 **180px 유지**(구 결함 20px 아님). 프로덕션 코드 무변경.

실제 결함 = **real-qa 커버리지·정확성 공백**:
1. **1024px 회귀 미커버**: 기존 real-qa는 1440px project만·메모 열 폭 미단언·ellipsis 조건이 정상(180px)과 회귀(20px)를 구분 못하는 맹점 → **신규 1024px 테스트**(전6열 spec폭 유지+스크롤 컨테이너 동작+스크롤 후 메모 값셀 `toBeInViewport`)로 해소. jsdom `JournalDetailPage.test.tsx`도 6열 전부 `col.style.width` 단언 강화.
2. **1440px 단언 오류(#737 유발 회귀)**: 기존 #711 1440px `expectHeaderWidth`(exact spec폭)가 FAIL 상태였음(real-qa CI 밖이라 잠복). 근본원인: `.table{width:100%}`+`table-layout:fixed`+**전 열 명시폭**에서 컨테이너(1440px 뷰포트 실 clientWidth~1118px)>열합(860px)이면 CSS2.1 fixed-layout이 초과분을 spec 비례 배분(Chromium 실측 ×1.2977: 계정과목→207·거래처→337·메모→233). #737이 메모에 명시폭 부여하며 유발(그 전엔 메모 auto라 잔여흡수·미확대). **정정**: `expectHeaderWidthRatio`(측정 메모폭 기준 spec 비율 보존)+메모 ≥180px 하한+1440px 가로스크롤 없음 단언.

## 라이브 QA (Docker 실서버·실 렌더)
- 신규 1024px 테스트 **PASS** — 1024px서 메모 180px 유지, 스크롤 후 값셀 뷰포트 진입 실측. **회귀 genuine 확인**: 메모 width+wrapper min-width 동시 제거 시 메모 정확히 20px→테스트 RED("최소 가독폭 160px 미만 압축"), 원복 후 PASS.
- **전체 real-qa green: 3 passed + 3 skipped**(1440px 재배분+1024px 회귀가드+모바일). 스샷 `docs/qa/714-journal-detail-1024px/`(00 before=20px 소실·03 after=1024px 스크롤 후 메모 완전 가독).
- 구조적 발견: PR #737의 두 방어선(메모 명시폭 + `.journal-detail-line-table{min-width:860px}` wrapper) 중 **wrapper min-width가 1024px 방어 실질 주역**(메모 width만 제거해도 wrapper 단독으로 압축 방지).

## 검증
- desktop `typecheck` 0 · `vitest` 664/664 · real-qa 3 passed+3 skipped. 프로덕션 코드 무변경(회귀 위험 0).

## 후속 이슈 권고
- **vite.config `pwaRegisterDevStub` enforce 미지정** → `virtual:pwa-register` 코어 리졸버 선점 실패로 **desktop real-qa 전체 렌더러 부팅 잠재 차단**(qa 우회=임시 scratch config). `enforce:'pre'` 1줄 정식 fix 별도 이슈.
- #711 계열 다른 화면(`tableLayout='auto'`+일부 열만 명시폭)의 잠재 "미지정 열 압축" 패턴 점검(범위 밖).
