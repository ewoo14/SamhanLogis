# S26 라이브QA — PR #1078 · 이슈 #1075

판정: **BLOCKED — 라이브QA 미실행**

## 환경 확인

| 항목 | 실측 | 판정 |
|---|---|---|
| ① 이 워크트리 렌더러 | 실행하지 않음. 백엔드 기동 실패로 중단 | BLOCKED |
| ② 빈 포트 + `strictPort` | 확인/실행하지 않음 | BLOCKED |
| ③ 실제 화면 API 네트워크 | 확인하지 않음 | BLOCKED |
| ④ `samhan-slip-service` 생성 시각 | `2026-08-05T21:00:20.201807349Z` | 기록 |
| ⑤ `flyway_schema_history` 최고 버전 | `112` | **V113 미적용** |
| 컨테이너 상태 | `restarting`, health `unhealthy` | **BLOCKED** |

## 재배포 실측

- `:services:slip-service:bootJar`: 성공.
- `slip-service`만 이미지 build/recreate 수행.
- 최종 컨테이너: `samhan-slip-service`.
- 다른 서비스, `api-gateway`, DB에는 Docker 조작을 하지 않음.

## 차단 원인

컨테이너 로그에서 Spring/Flyway 기동이 다음 오류로 종료됨.

```text
Validate failed: Migrations have failed validation
Detected applied migration not resolved locally: 101.
...
Detected applied migration not resolved locally: 112.
```

워크트리 소스에는 `V113__add_estimate_specification_source.sql`이 존재하지만, 애플리케이션이 Flyway validation 단계에서 종료되어 V113 적용까지 도달하지 못했다. 이 상태에서 화면/API를 시험하면 PR 코드가 실행 중이라는 전제가 성립하지 않으므로 라이브QA를 진행하지 않았다.

## 시나리오 판정

| 시나리오 | 기대 | 실측 | 판정 |
|---|---|---|---|
| A 자동 규격 회수 | 저장/재조회 및 모델명 해제 시 자동 규격 회수 | 실행 불가 | BLOCKED |
| B 사용자 입력 규격 보존 | 직접 수정·원문 복귀 모두 보존 | 실행 불가 | BLOCKED |
| C 49/50자 경계 | 201 저장, 400 회귀 없음 | 실행 불가 | BLOCKED |
| D 버전 이력/복원 | 헤더 변경 라인 0, 규격 변경 라인 기록 및 복원 | 실행 불가 | BLOCKED |
| E 협업(coedit) | 가능 시 양 창 동기화 | 실행 불가 | BLOCKED |
| F 판매전표 회귀 | 규격·단가 반영 유지 | 실행 불가 | BLOCKED |

## 증거 산출물

- 캡처: **0장**. 이는 PASS가 아니라 환경 차단으로 인한 미실행이다.
- 네트워크 원문/저장 응답: 생성하지 않음(화면/API 호출 자체가 없었음).
- 로그인·인증 응답: 없음.
- UUID 화면 노출: 확인하지 못함.

## 신규 파일

- `docs/qa/1075-s26-real-qa/qa-report.md`

다음 시도 전 Flyway validation 원인을 해소하고, 컨테이너가 `healthy`이며 `flyway_schema_history` 최고 버전이 `113` 이상임을 먼저 재확인해야 한다.
