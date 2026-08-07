# S27 라이브QA 보고서 — PR #1078 · 이슈 #1075

## 환경 확인

| 확인 항목 | 실측 | 판정 |
|---|---|---|
| 이 워크트리 렌더러 기동 | `http://localhost:5178`에서 이 워크트리의 `vite.renderer.dev.config.ts`를 `--host localhost --strictPort`로 기동 | PASS |
| 포트 | `5178` 사용. `5173` 미사용 | PASS |
| 실제 네트워크 API | 화면에서 `http://localhost:8080`의 `/api/products`, `/slips/lookup-product`, `/slips/estimates`, `/api/v1/slips/estimates/...` 호출 확인 | PASS |
| slip 컨테이너 | `docker inspect -f '{{.Created}}' samhan-slip-service` = `2026-08-05T21:05:59.392347652Z`; `running / healthy` | PASS |
| Flyway | `flyway_schema_history` 최고 버전 `113`, `success=t` | PASS |
| 브랜치 일치 | Compose working directory가 이 워크트리이며 HEAD `8437522ace292e81213e3adc26fb21b43ee0df81` | PASS |
| 재배포/재빌드 | 하지 않음 | PASS |

## 최종 판정

**BLOCKED — S27 핵심 계약(A)이 재현됨.**

품목 `AR09TXEAAWKNEU-04` 선택 직후 화면에 자동 규격 `9평형 / R32 / 인버터 / 윈드프리`가 채워졌다. 그러나 모델명 lookup 완료 후 수량 입력으로 blur하면 규격이 빈 값으로 사라졌고, 저장 요청에는 `specification` 자체가 포함되지 않았다. 저장 응답은 `201`이었지만 `specification:null`, 재조회 화면도 `—`였다. 따라서 “자동 규격 회수 → 저장 → 재조회”의 본문 계약을 PASS로 볼 수 없다.

## 시나리오별 기대 / 실측 / 판정

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| A 자동 규격 회수 | 품목 선택 후 자동 규격이 저장·재조회되고, 모델 삭제 후 blur 시 사라짐 | 선택 직후 자동 표시까지는 확인. blur 후 사라짐. `POST /slips/estimates` 요청에 규격 누락, 응답/재조회 `null` | **BLOCKED** |
| B 사용자 입력 보존 | 사용자 규격 저장 후 모델 삭제/blur에도 보존. 원문 복귀도 사용자 입력으로 보존 | `사용자 입력 규격 S27` 저장 요청이 `specificationSource:USER`로 전송됨. 재조회 후 모델명 삭제/blur 전후 모두 동일 문자열 유지 | PASS |
| C 49/50자 경계 | 자동 규격 49자와 정확히 50자가 각각 `201` | 자동 규격 표본이 A에서 저장되지 않아 자동 출처 경계는 실행 불가. 수동 경계 화면은 캡처했으나 저장 응답이 없어 PASS로 판정하지 않음 | **NOT VERIFIED** |
| D 버전 이력 | 헤더만 변경 시 line 0, 규격 변경 시 line 변경, 복원 후 source별 삭제/보존 | 실제 규격 변경 저장에서 revision 응답 `lineModified:1` 확인. 헤더-only와 복원은 A 차단 이후 미실행 | **PARTIAL / BLOCKED** |
| E 협업(coedit) | 두 창에서 품목 확정·해제가 동일하게 반영 | 단일 창에서 coedit awareness/update/stream 호출은 확인. 두 창 실측은 미실행 | **NOT VERIFIED** |
| F 판매전표 회귀 | 판매전표의 ProductAutocomplete 규격·단가 유지 | S27 핵심 결함 확인 후 중단 | **NOT VERIFIED** |

## 네트워크 및 저장 증거

- [network.json](network.json): 인증 응답 토큰과 로그인 비밀번호를 마스킹한 네트워크 원문. 자동 규격 저장 요청/응답과 사용자 규격 `USER` 저장 응답 포함.
- [user-spec.json](user-spec.json): 사용자 입력 보존 단계의 네트워크 원문 및 전후 값.
- [boundary.json](boundary.json): 49/50자 경계 시도 원문.

## 캡처 목록

총 9장. UUID는 화면에 표시되지 않았으며, 화면에는 견적번호·거래처명·모델명 등 업무 식별자만 표시됐다.

- `01-auto-spec-filled.png`, `02-after-save.png`, `03-saved-detail.png`, `04-edit-open.png`
- `05-user-spec-filled.png`, `06-user-spec-saved.png`, `07-model-cleared-user-spec.png`
- `08-boundary-49.png`, `08-boundary-50.png`

## 신규 파일 목록

- `docs/qa/1075-s27-real-qa/qa-report.md`
- `docs/qa/1075-s27-real-qa/network.json`
- `docs/qa/1075-s27-real-qa/user-spec.json`
- `docs/qa/1075-s27-real-qa/boundary.json`
- `docs/qa/1075-s27-real-qa/screenshots/*.png` (10장)

커밋·스테이징·Docker 재빌드·재배포·서비스 중지·DB 직접 쓰기는 수행하지 않았다.
