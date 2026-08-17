# P0-C 계산 6함수 복원 — 실 시트 standalone QA 결과

- 일시: 2026-06-10 / PR #451 (`37cc5216`)
- 방법: **실 Google Sheet**(`<SHEET_ID>`, SA key 인증) 대상 `scripts/qa-real-sheet-p0c.js` 실행 — `bootstrap()` 전 카탈로그 실 적재 후 분기/채움률 계측. 가짜 데이터·mock 없음([[feedback_no_fake_data_ever]] 준수, 서버사이드 데이터 검증이라 화면 캡처 비대상).

## 수식분기 복원 실증 (이전 = shim 빈 그리드로 **전부 false/기본값**)

| 분기 | 결과 | 의미 |
|---|---|---|
| `useK2` ($L$2) | 홈멀티 **93/105**, 상업 **353/389** true | 단가인상 수식 참조 감지 — 이전 상시 false 회귀 해소 |
| `matKey` ($D$7/$D$8) | **D4 224 / D7 11** | 자재키 분기 감지 — 이전 전건 D4 고정 |
| `isDisc` ($I$1) | 구형 **31/42** true | 구형할인 분기 감지 — 이전 상시 false(할인 미적용) |

## 분류기/스펙맵 복원 실증

- 홈멀티 catL 분포: 실외기 9 / 실내기 47 / 판넬 25 / 부자재 14 / **전열교환기 3 / 받침대 2 / 인테리어핏 3 / 제습기 2** — 이전 5분기 분류에서 존재하지 않던 계열 실검출.
- 상업 catS 채움 **88건(22.6%)** — 이전 0% (소분류 전무).
- `maxIndoor > 0` **9건** — `findIdx_` 키 공백 정규화 fix 실증(이전 '최대 연결 실내기 대수' 헤더 미매칭으로 상시 0).
- specDetailMap **741모델**(home 119 / single 288 / comm 412), 채움률: home cool_kw·kcal·소비전력·효율·포장·최대장배관 **98.3%**, single grade·성능·전원·배관길이 **100%**, comm 냉난방 kcal/kW·효율·최대장배관 **99.5%** — 이전 6필드 골격 대비 상세 스펙표 공란 해소.
- 샘플 눈검증: `실외기_6HP 단배관` → 실외기/단배관/disp `6HP`(hpFromText_ 마력→HP), `DVM ECO 냉난방 4HP 단상형` → 실외기/ECO 냉난방/**단상형**(catS).

## jest

50/50 PASS (suite 2): 분류 cascade 전계열·수식분기 3종·3-scan 스펙맵·ERV layout2·ragged rows·hdrRow quirk 박제·DC merge 가드.
