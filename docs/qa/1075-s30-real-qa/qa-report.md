# S30 라이브QA 보완 보고서 — PR #1078 · 이슈 #1075

## 환경 확인

- 대상 HEAD: `e78caf3db68c75617520287f6619f96448dff173`
- Docker 조작: 없음. `samhan-slip-service` 조회 결과 `healthy`, 생성 `2026-08-06 06:47:12 +0900` (21:47:12Z).
- Flyway: slip-service 로그의 `Current version of schema "public": 113` 확인.
- 렌더러: 이 워크트리의 Vite renderer를 `http://localhost:5400`으로 기동. 빈 포트, `strictPort`, `--host localhost` 사용.
- 브라우저: 내장 브라우저 대신 `node` + Playwright Chromium. 두 창은 별도 browser context로 시도.
- 인증: `dev_master` 실 JWT를 메모리에서만 사용. 산출물의 Authorization/token/secret/password는 마스킹.
- DB 직접 쓰기·vendor 발송·다른 트랙 파일 변경·git 쓰기: 없음.

## 판정 요약

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| B 자동 규격 회수 | 모델명 삭제+blur 후 규격 소거, 저장·재조회 공란 | UI에서 모델 삭제·blur와 규격 공란 캡처는 확보. 저장 버튼 클릭 후 견적 `PUT`이 발생하지 않아 저장·재조회 단계 미완료 | **FAIL** |
| C 사용자 입력 보존 | USER 규격이 삭제·blur 및 저장·재조회 후 보존 | 기존 실 견적에서 규격 직접 입력 후 `PUT` payload의 `specificationSource=USER`는 확인. 삭제·blur 후 저장·재조회는 하네스가 `PUT`을 받지 못해 미완료 | **PARTIAL** |
| D 다른 품목 재확정 | 새 품목 기준으로 교체, 이전 자동 규격 제거 | 협업 입력 업데이트 경로는 발생했으나 최종 저장·재조회 캡처를 확보하지 못함 | **NOT VERIFIED** |
| F 버전 이력 복원 | UI 복원/API 실행 후 자동 규격 회수·USER 규격 보존 | 버전 이력 패널과 복원 전·후 화면 캡처 확보. 복원 API 응답 및 provenance 후속 삭제·저장 단계를 확정하지 못함 | **NOT VERIFIED** |
| G 협업 두 창 | 한 창의 확정·해제가 다른 창에 반영, USER 규격 보존 | 두 context 구성 시도는 했으나 동일 결과의 저장 후 양창 확정 캡처 미확보 | **NOT VERIFIED** |
| H 판매전표 회귀 | ProductAutocomplete, lookup 응답, 규격·단가·DC, 저장·재조회 | `/lookup-product` 200 원문과 ProductAutocomplete 선택 화면을 확보. 전역DC/고정DC 각각의 저장·재조회는 미완료 | **PARTIAL** |

## 주요 실측

1. 견적 편집 화면에서 모델 삭제·blur 직후 규격 UI 값은 공란이 됐다(B).
2. 같은 화면에서 저장 버튼은 보이지만 삭제된 라인 상태에서는 견적 `PUT` 요청이 발생하지 않았다. 이는 B를 PASS로 올릴 수 없는 직접 증거다.
3. 사용자 규격을 직접 입력한 저장 payload는 `specificationSource: "USER"`로 전송됐다(C의 선행 단계).
4. 판매전표 lookup 응답은 `sellingPrice=1080000`, 자동 규격 `9평형 / R32 / 인버터 / 윈드프리`, `fixedDiscountRate=null`이었다. 고정DC 표본 `MCU-S6NDB1N`은 API 표본상 selling price `1617000`, fixed discount `40%`, specification `null`이다.
5. 화면 텍스트 및 산출물에서 사용자 UUID를 표시하지 않았다. 네트워크 원문에서는 내부 UUID를 `[MASKED_UUID]` 또는 토큰 마스킹 규칙으로 처리했다.

## 산출물

- 단계별 캡처: `screenshots/` (B, C 선행, F, H 포함 6장)
- 네트워크/저장 응답 원문: `network-responses.jsonl` (인증 토큰 마스킹)
- lookup 원문: `network-lookup-product.json` (인증·내부 UUID 마스킹)
- 드라이버 결과: `results.json` (하네스 timeout 포함)

## 신규 파일 목록

- `docs/qa/1075-s30-real-qa/qa-report.md`
- `docs/qa/1075-s30-real-qa/network-lookup-product.json`
- `docs/qa/1075-s30-real-qa/network-responses.jsonl`
- `docs/qa/1075-s30-real-qa/results.json`
- `docs/qa/1075-s30-real-qa/screenshots/*.png`

