# P0-C — 종합견적서 계산 6함수 충실 복원 spec (라이브 06-09 기준)

> 2026-06-10. GAS 정합성 에픽(개발책임자 2026-06-09 밤 지시) P0-C.
> 기준 소스 = `tools/legacy-gas/종합견적서/Code.js` (라이브 clasp 06-09 스냅샷, PR #450).
> 대상 = `clients/web/estimate-app/lib/code.js` + `apps-script-shim.js` + `google-sheets-client.js`.
> 검증 = jest 단위테스트 (web-only). Codex 한도 다운(6/11 회복) → Claude 대체 예외.

## 진단 (감사 `docs/audit/gas-port-fidelity/종합견적서-audit-2026-06-09.md` P0-C/P1)

| # | 함수 | 포팅본 현황 | 라이브 원본 | 영향 |
|---|---|---|---|---|
| 1 | `classifyHome_` | 임의 재작성(실외기 프레스티지/프리미엄/스탠다드 등 5분기) | 8단계 cascade: 받침대→전열교환기→인테리어핏→제습기→실외기(단·다배관+HP disp)→실내기(1-Way WIFI/인피니트, 4WAY, 360, 벽걸이 + 소중대형 + 평형/무풍 disp)→판넬(공기청정 WIFI 등)→부자재(리모컨/분기관/유연호스/기타) | 홈멀티 분류/표시명 전면 오류 |
| 2 | `classifyCommercial_` | inKeys 단순화, catS 전부 누락, 탐지 순서 상이 | outKeys 키워드 우선 → inKeys(UV-C/MINI/WIFI 조합) → 모델 L 보정(DVM S2/ECO) → catS 4블록(1Way 소중대 / DUCT 정압 / 전열 상업·주택 / ECO 단상·삼상·상부토출) → 판넬 → 부자재 | 상업 분류 소분류 붕괴 |
| 3 | `getSpecDetailMap_` | 6필드 골격(scanSlot 공통) | scanHome(냉방성능 2컬럼+포장+최대장배관/고저차 14필드) / scanSinglе(성능·소비전력 cool\|heat splitBar, 전원/차단 splitSlash, in/out 크기·중량·포장, 배관길이/고낙차) / scanComm(ERV layout 3·2 감지 + joinCols, 냉난방 kcal/kW 4그룹) | 견적서 상세 스펙표 공란 |
| 4 | `decideWarehouseCode_` | SINGLE 또는 `/^A[CPRF]/` → '00003', 기본 '2' (**반전**) | 기본 '00003'. HOME×인피니트 또는 SINGLE×(360/1등급/냉방전용/1way/덕트/냉전/비스포크/벽걸이/가정용 에어컨) hit 시에만 '2' | 잘못된 창고 출고 |
| 5 | `buildDefaultDcConfig_` | 중첩 `{home:{rate..}}` — `initDcConfigFromNotion` 소비부 undefined | flat 11키(homeDiscount/commDiscount/showIHose/discount360/4way/Stand/oneWay/deluxe/firstGrade/unitRoundTo/unitRoundMode) | DC 설정 항상 default 45% |
| 6 | `getFormulas` 수식분기 | shim 이 항상 `''` 그리드 → useK2/matKey/isDisc 전부 기본값 붕괴 | `$L\$2`(단가인상 useK2), `$D\$7/$D\$8`(자재키 matKey), `$I\$1`(구형할인 isDisc) | 구형할인 미적용·단가인상 미반영·자재키 D4 고정 |

부수(동일 계열 — 백로그 금지 원칙으로 본 PR 포함):
- **helper 깡통화 복원**: `sanitizeKoreanParen_`(한글 없는 괄호류 제거), `trimSymbols_`(기호→공백 정규화), `hpFromText_`(hp/마력 → `NHP` 문자열), `isBlockedByNote_`/`isSoldOutByNote_`(공백 제거 후 판정), `formatWonDiscountLabel_`(`-3만5천`)/`formatPercentLabel_`(`45%`), `findIdx_`(키 공백 정규화 — '최대 연결 실내기 대수' 미매칭 버그), `findHeaderIndex_`, `extractRowsFromFormula_`(세트참조 행 추출), `normalizeTel_`(010 dash 포맷), `parseKRNumber_`/`parseKRFloat_`/`toYmd_`/`toMmDd_`(라이브 동작) — classifyHome_ disp 등이 직접 의존.
- **`initDcConfigFromNotion` merge 시맨틱**: blanket Object.assign → 라이브 필드별 가드(homeDiscount/commDiscount 는 number && ≠0, 나머지 typeof 가드). 데이터 소스는 현행 MS endpoint 유지(#29 별도).
- **`detectHomeOrder`**: 모델 `/AJ0|AJ1|AM0|AM1/` 분기 누락 복원.

## 구현

1. **google-sheets-client.js**: `readSheetGrid(id, name)` 신설 — values(UNFORMATTED_VALUE) + formulas(`valueRenderOption:'FORMULA'`) 2회 fetch, formulas 는 `=` 시작 셀만 보존(GAS `getFormulas()` 시맨틱), 동일 TTL 캐시.
2. **apps-script-shim.js**: `FakeSheet(name, values, formulas)` — `getDataRange().getFormulas()`/`getRange().getFormulas()` 실 수식 반환(미제공 시 '' 그리드). `preloadSheet` 가 grid fetch. `injectSheet(id, name, values, formulas?)` 테스트 보조 확장.
3. **lib/code.js**: 위 6함수 + 부수 helper 라이브 verbatim 치환 (GAS 전용 API 호출부만 shim 호환 유지).
4. **test/code.test.js**: 구 동작을 박제한 단언 갱신(hpFromText_ 숫자→`NHP`, decideWarehouseCode_ 반전, buildDefaultDcConfig_ 중첩) + 신규: classifyHome_ 8계열, classifyCommercial_ catS 4블록, getSpecDetailMap_ 3-scan fixture, 수식분기(useK2/matKey/isDisc) injectSheet fixture.

## 비스코프 (후속 PR)

- P0-B 전표발행 `/from-estimate`(인증모델 결정 ② 대기), #29 DC설정 Notion→DB(결정 ③ 대기), Sheets→DB 전면 치환(#30), 재고조회 stub, Docker E2E 실 UI 캡처(#31).
