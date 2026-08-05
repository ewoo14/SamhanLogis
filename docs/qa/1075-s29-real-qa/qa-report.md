# S29 라이브QA 재실시 보고서 — PR #1078 · 이슈 #1075

## 환경 확인

| 확인 항목 | 실측 | 판정 |
|---|---|---|
| 이 워크트리 렌더러 기동 | `http://localhost:5195`에서 이 워크트리의 `vite.renderer.dev.config.ts`를 `--host localhost --strictPort`로 기동 | PASS |
| 빈 포트 + strictPort | `5195` 사용. 기동 시 포트 충돌 없음. Vite 로그에 `Local: http://localhost:5195/` 확인 | PASS |
| 화면 네트워크 API | 렌더러 화면에서 `GET http://localhost:8080/slips/lookup-product?modelName=AR09TXEAAWKNEU-04` 응답 `200`, `specification` 포함 확인 | PASS |
| slip-service 생성 시각 | `docker inspect -f '{{.Created}}' samhan-slip-service` = `2026-08-05T21:47:12.463983963Z` | PASS |
| slip-service health | `docker inspect -f '{{.State.Health.Status}}' samhan-slip-service` = `healthy` | PASS |
| Flyway 최고 버전 | `slip_db.flyway_schema_history` 최고 버전 `113` | PASS |
| 재배포 범위 | Gradle bootJar → 세 compose 파일로 `slip-service`만 build/up. 다른 서비스·api-gateway·DB 조작 없음 | PASS |

## 최종 판정

**PASS — S27 BLOCK 결함 해소 확인.**

같은 품목 `AR09TXEAAWKNEU-04` 선택 후 자동 규격 `9평형 / R32 / 인버터 / 윈드프리`가 화면에 표시되고 blur 후 유지됐다. 실제 lookup 응답에도 `specification`이 존재했으며, 자동 규격을 포함한 견적 생성은 `POST /slips/estimates` `201`을 반환했다. 저장 후 `GET` 재조회와 편집 화면 재개방에서도 값이 유지됐다.

## 시나리오별 기대 / 실측 / 판정

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| A S27 결함 재검증 | 품목 선택·blur 후 규격 유지, 저장 요청에 `specification`/`specificationSource`, `201` 및 재조회·재개방 유지 | 화면 캡처에서 자동 규격 유지. lookup `200`에 규격 포함. 자동 규격 `CATALOG` POST `201`, 저장 `PUT 200`, 재조회 `GET 200`; 생성 견적 `2026/08/06-12`, ID는 원문에 기록(보고서 외 UUID 비노출) | **PASS** |
| B 자동 규격 회수 | 모델명 삭제·blur 시 자동 규격 회수 | 이번 실측에서는 API 저장 계약과 모델 선택·blur를 우선 검증. 모델 삭제 후 blur·재조회는 별도 실행하지 못함 | **NOT VERIFIED** |
| C 사용자 입력 보존 | 직접 수정한 규격이 모델 삭제·blur에도 유지 | `specification:"사용자 입력 규격 S29"`, `specificationSource:"USER"`로 PUT `200` 및 GET 재조회 확인. 모델 삭제·blur UI 단계는 미실행 | **PARTIAL** |
| D 다른 품목 재확정 | 이전 자동 규격이 남지 않고 새 품목 기준으로 교체 | 동일 품목 재확정만 실행. 서로 다른 품목 교체는 미실행 | **NOT VERIFIED** |
| E 50자 경계 | 정확히 50자와 49자 자동 규격 각각 `201` | 49자 POST `201`, 50자 POST `201` | **PASS** |
| F 버전 이력 | 헤더-only는 line 0, 규격 변경은 line 1 이상 | revisions `200`: 헤더-only `headerChanged:1, lineModified:0`; 규격 변경 `lineModified:1` 확인. “이 시점으로 복원” 전용 UI/API는 미실행 | **PARTIAL** |
| G 협업(coedit) | 두 창에서 한쪽 확정·해제 결과가 다른 창에 반영 | 두 창 동시 조작은 브라우저 가용성 제약으로 실행하지 못함 | **NOT VERIFIED** |
| H 판매전표 회귀 | 판매전표 공용 ProductAutocomplete의 규격·단가 유지 | `/slips/new` 진입 캡처는 남겼으나 판매전표의 visible autocomplete 상호작용과 네트워크 확인은 완료하지 못함 | **NOT VERIFIED** |

## 네트워크 및 저장 응답

- [network.json](network.json): 렌더러가 실제 호출한 URL·요청·응답 원문. `token`, `password`, `authorization` 값은 `[REDACTED]` 처리.
- [saved-responses.json](saved-responses.json): lookup, 자동 규격 POST/201, 49·50자 POST/201, 사용자 규격 PUT/200, 헤더-only PUT/200, 규격 변경 PUT/200, GET 재조회, revisions 응답 원문.
- [ui-values.json](ui-values.json): 자동 규격 선택·blur 후 화면 input 값.

## 캡처 목록

S29 전용 디렉토리에 총 8장 캡처를 남겼다. S26·S27 디렉토리는 재사용하지 않았다.

- `00-estimate-new.png`
- `01-auto-spec-filled.png`
- `01-model-search-filled.png`
- `02-auto-spec-after-blur.png`
- `02-after-model-blur.png`
- `03-post-201-created.png`
- `04-reopened-estimate.png`
- `05-sales-slip-regression.png`

화면 캡처에서 사용자 UUID가 업무 화면에 노출되는 현상은 확인하지 못했다. 로그인 응답·인증 토큰은 원문 산출물에서 마스킹했다.

## 신규 파일 목록

- `docs/qa/1075-s29-real-qa/qa-report.md`
- `docs/qa/1075-s29-real-qa/network.json`
- `docs/qa/1075-s29-real-qa/saved-responses.json`
- `docs/qa/1075-s29-real-qa/ui-values.json`
- `docs/qa/1075-s29-real-qa/probe-network.json`
- `docs/qa/1075-s29-real-qa/interact-network.json`
- `docs/qa/1075-s29-real-qa/screenshots/*.png`

QA 과정에서 화면·API를 통해 테스트 견적 49자/50자 경계 및 본 검증 견적을 생성했다. DB 직접 쓰기, vendor 발송, git 쓰기, commit/stage, 다른 Docker 서비스 조작은 하지 않았다. 브라우저 런타임이 unavailable하여 드라이버는 `os.tmpdir()`에 두고 저장소에는 남기지 않았다.
