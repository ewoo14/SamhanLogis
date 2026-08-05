# S19 라이브QA — PR #1045 · 이슈 #1039 가배차

실행일: 2026-08-05 (KST)  
범위: S18 이후 남은 시나리오만 재현. 재빌드·재배포·컨테이너 중지·DB 직접 쓰기·문서/그룹 삭제 없음.

## 0. 환경 확인

| 항목 | 실측값 |
|---|---|
| API 호출 오리진 | `http://localhost:8080` (VITE_API_BASE_URL, mock OFF) |
| 실제 renderer 오리진 | `http://localhost:5179` — `localhost`, `strictPort=true` |
| 브라우저 | 내장 브라우저 미사용. `@playwright/test`의 `chromium` headless 드라이버 |
| 컨테이너 `slip-service` | created `2026-08-05T11:59:13.516604535Z`, started `2026-08-05T11:59:17.652568785Z`, running/healthy |
| 컨테이너 `arologis-service` | created `2026-08-05T11:59:13.542806577Z`, started `2026-08-05T11:59:17.655276211Z`, running/healthy |
| `slip_db` Flyway 최고 | V107 `success=t` — `queue legacy source warehouse code recovery` |
| `arologis_db` Flyway 최고 | V25 `success=t` |
| 계정 | 전표 발화 `dev_manager` / MANAGER, 배차 축 `dev_dispatch` / DISPATCH, 운송사 guard API `dev_master` / MASTER. 공통 비밀번호 `dev_p05_pass!` |

### V107 worker 재측정

최종 `slips.source_warehouse_code_snapshot_status` 실측:

| 상태 | 건수 |
|---|---:|
| PENDING | 0 |
| COMPLETED | 2,309 |
| ABANDONED | 4 |
| NOT_REQUESTED | 156 |

ABANDONED 4건 모두 `창고 조회 실패: HTTP 404`이다. S18의 3건 이후 worker가 계속 처리하면서 1건이 추가되었다. 로그에도 동일 사유가 확인되었다. 해당 4건은 `2026/05/30-1~3`, `2026/06/23-1`이며 새로 만든 코드 `2`, `00003`가 아니다. 기존 잘못된/존재하지 않는 창고 참조를 조회하다 404가 난 건으로 확인되며, 이 라운드에서 직접 복구·삭제하지 않았다.

## 1. 판정 요약

| 항목 | 판정 | 실측 결과 |
|---|---|---|
| 8모드 발화 조건 확인 | PASS/미실시 혼재 | RETURN_RENTAL 2건은 생성 PASS. DAY·STACK·REGION은 당일 마감 초과로 발화 조건을 만들 수 없어 미실시. |
| 8모드 가배차 분류 캡처 | 미실시 | 8개 실행 모드 모두 실제 조회·캡처했지만 표본 주소가 공란이라 전부 미분류로 반환되어 예상 분류 PASS로 세지 않음. |
| `dev_dispatch` 목록·단건/그룹 운송사 지정 | PASS | 실제 화면에서 그룹 생성, 운송사 `AROLOGIS` 지정, 그룹 조회 확인. |
| SENT 그룹 운송사 변경 차단 | PASS | 실제 전송 후 `SENT`; 동일 운송사 PATCH가 HTTP 409로 거부됨. |
| 정상 경로 차단 건수 | PASS | 정상 생성 2건, 정상 그룹 생성 1건, 운송사 목록 조회 1건, 운송사 지정 1건 성공. 이번 변경에 의한 오차단 0건. |

## 2. ① OUTBOUND 전표 발화

실 화면에서 `dev_manager`로 출고 창고 자동완성에 S18 창고를 선택하고, 거래처·품목·수량·단가를 입력한 뒤 저장을 시도했다.

| 배송태그 | 상일 코드 `2` | 초월 코드 `00003` | 판정/사유 |
|---|---|---|---|
| DAY | 미실시 | 미실시 | 21시대에 `당일 마감(00:01) 초과 — 익일 출고로 생성하세요` 표시 |
| STACK | 미실시 | 미실시 | `야적 당일 마감(14:00) 초과` 표시 |
| REGION | 미실시 | 미실시 | `지방 당일 마감(12:00) 초과` 표시. 사용자 지정 이슈 #1074 조건 |
| RETURN_RENTAL | PASS | PASS | 실 저장 성공. `2026/08/05-3`, `2026/08/05-4`, `DRAFT`, source warehouse `2`/`00003` |

따라서 DAY·STACK·REGION은 실패가 아니라 현재 시각 때문에 발화 조건 미충족인 미실시이다. RETURN_RENTAL 두 전표는 삭제하지 않았다.

## 3. ② 가배차 분류 결과

`dev_dispatch`로 8개 실행 모드를 각각 조회하고 실제 화면을 캡처했다. 두 표본은 거래처 주소가 공란이라 분류 결과가 모두 `미분류 거래처`로 남았다. 이는 상일/초월 창고 선택 자체가 누락된 것이 아니라, REGION 매칭에 필요한 주소 조건이 충족되지 않은 결과다.

| 모드 | 화면 결과 | 판정 |
|---|---|---|
| 상일+초월 (지방 제외) | 총 2건, 미분류 2건 | 미실시(주소 조건 미충족) |
| 초월 (지방 제외) | 총 1건, 미분류 1건 | 미실시(주소 조건 미충족) |
| 상일 (지방 제외) | 총 1건, 미분류 1건 | 미실시(주소 조건 미충족) |
| 야적 only | 총 0건 | 미실시(발화 표본 없음) |
| 지방 only | 총 0건 | 미실시(발화 표본 없음; 당일 12:00 초과) |
| 상일+초월 (지방 포함) | 총 2건, 미분류 2건 | 미실시(주소 조건 미충족) |
| 초월 (지방 포함) | 총 1건, 미분류 1건 | 미실시(주소 조건 미충족) |
| 상일 (지방 포함) | 총 1건, 미분류 1건 | 미실시(주소 조건 미충족) |

미실시를 PASS로 세지 않았다. 캡처 파일은 `screenshots/mode-01`~`mode-08`이다.

## 4. ③ 배차그룹 운송사 지정 — S10 권한 축

`dev_dispatch`로 실제 화면에서 `S19-20260805-01` / `S19 QA 차량 01` 그룹을 생성했다. `AROLOGIS 지정` 버튼이 노출되었고 클릭 후 화면에 `AROLOGIS · 아로로지스`, `미전송`이 표시되었다. 실제 표본 `2026/08/05-3`을 그룹에 편입한 뒤 `아로로지스로 전송`을 실행했고, 재조회 화면에서 `1건 / SENT`를 확인했다.

판정: **PASS**.

## 5. ④ SENT/PENDING 운송사 마스터 변경 차단 — S16 축

전송 완료된 `S19-20260805-01`이 `AROLOGIS`를 참조하는 상태에서 `dev_master`의 실제 인증 토큰으로 `PATCH /admin/carriers/AROLOGIS`를 호출했다. 값은 변경하지 않고 동일한 운송사명/아로로지스 여부를 보냈다.

- 응답: HTTP **409**
- 메시지: `전송 완료 또는 결과 확인 중인 배차 그룹의 운송사는 변경할 수 없습니다.`
- 데이터 변경: 없음

운송사 목록 GET은 HTTP 200, 활성 운송사 1건으로 정상 동작했다. 화면 경로는 해당 계정에서 홈으로 권한 가드되었으므로, 변경 차단의 최종 판정은 실제 인증 API 응답과 SENT 상태 증적으로 판정했다.

판정: **PASS**.

## 6. ⑤ 오차단 건수

이번 라운드에서 실제 수행한 정상 경로는 다음과 같다.

- 정상 OUTBOUND 전표: 2건 생성 성공, 오차단 0건
- 정상 배차그룹: 1건 생성 성공, 오차단 0건
- 정상 운송사 조회: 1건 성공, 오차단 0건
- 정상 운송사 지정: 1건 성공, 오차단 0건
- SENT 그룹 운송사 변경: 1건 차단 — 요구된 정상 guard이므로 오차단 아님

## 7. 증적 및 새 파일

저장소 루트에 신규 생성:

- `docs/qa/1039-provisional-dispatch-s19-real-qa/qa-report.md`
- `docs/qa/1039-provisional-dispatch-s19-real-qa/screenshots/` 실제 Playwright 캡처 26장
- `clients/desktop/s19-live-driver.mjs`
- `clients/desktop/s19-dispatch-driver.mjs`
- `clients/desktop/s19-preclassify-modes.mjs`
- `clients/desktop/s19-carrier-guard-driver.mjs`

아로로지스 데스크톱 화면과 `window.arologisAuth`는 사용하지 않았다.
