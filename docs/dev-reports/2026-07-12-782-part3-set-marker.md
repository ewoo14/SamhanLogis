# #782 part3 — 상업 SET 부모행 구성품 보유 마커 (discoverability, #798)

- **일자**: 2026-07-12
- **PR**: #798 · **연관 Issue**: #782(part3·완결) · #780(#779 P1) 후속
- **워크플로우**: 개발책임자 결정(서브틀 SET 마커) → Codex 구현 → Opus(Design/FE/QA 라이브) → Codex 적대(codex exec·mcp 타임아웃 우회) → 0수렴 → CI → 머지.

## 결함·결정
상업 SET 부모행(`tr[data-is-set="1"]`)에 구성품 보유/하위행 자동등장 신호 부재 → 수량 입력 시 갑자기 행이 느는 이유 추정 필요. **개발책임자 결정: 밀도 유지하는 서브틀 SET 마커**(행 추가·높이 변화 없이 이름 앞 인라인 표식).

## 변경 (index.html <style> 1줄)
`.est-table tbody tr[data-is-set="1"]:not(.set-part) td.colD::before{content:"SET";...소형 파랑 pill(--c-accent·10px·800·옅은 배경/테두리)}` — CSS `::before`로 부모 SET행 이름셀(pc/mobile) 앞 마커. **JS textContent 미변경·행 추가/높이 변화 없음**(밀도 유지). 부모 SET행 한정(`:not(.set-part)`·하위행/일반품목 미적용).

## 리뷰 disposition
- **Design(PASS)**: "SET"이 도메인 unit 값(unit='SET')과 표기 일치(한글화 불요)·기존 `.tag-ok/.tag-bad` pill 패턴 재사용·`--c-accent` 토큰. est-comm은 단위 컬럼 자체가 없어 마커가 SET 사전 식별 유일 수단. Low(10px 하한선·모바일 가독).
- **FE(PASS)**: 셀렉터 부모 SET행 한정(dataset.isSet는 renderComm isCommSetRow만·하위행 미세팅·:not 이중안전)·est-home/single/old 오적용 0·pc/mobile display 상호배타로 뷰당 1개·::before 클릭영역/헤더 무영향. Low(PC뷰 긴이름 wrap 경계→QA 확인).
- **QA(GREEN)**: 실 Docker+실 seed(QA797-SET-01) 데스크톱/모바일 캡처. 부모 SET행만 마커·하위행/GEN 미표시·행높이 격리실측 불변(SET 40/40·GEN 43은 이름길이차·마커무관)·긴이름 wrap 잘림 0(자연확장)·#797 회귀 0·UUID 미노출.
- **Codex 적대(codex exec·PASS)**: 셀렉터 범위·행높이·기존 규칙 충돌 전 PASS.

## 스코프 밖 (별건·모바일 레이아웃)
- **🐛 모바일 드로어 핸들 겹침**(QA 발견): 모바일서 SET행이 y80~160px에 놓이면 기존 고정 `#handleLeft`(옵션 드로어·**#798 무관 선존재 UI**·position:fixed z-index 99050)가 마커 위치와 겹쳐 마커가 가려짐. 마커 CSS 결함 아님(이름 텍스트는 노출·마커 배지 ~30px만). 기존 모바일 레이아웃(핸들이 첫 행 좌측 상시 겹침) 전반 문제라 별도 후속.

## #782 완결
part1(#796 주문정합)·part2(#797 시각폴리시)·part3(#798 마커) 전부 머지 → **#782 close**.
