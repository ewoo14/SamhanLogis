# R33 라이브 QA 보고서 — PR #1063 · 이슈 #1062

## 환경 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 브랜치: `fix/1062-line-input-ux`
- 렌더러: `http://127.0.0.1:5201/` — 5199·5200을 피한 빈 포트, `--strictPort`로 기동
- 실제 네트워크 호출 오리진: `http://localhost:8080` (`/auth/login`, `/inventory/warehouses`, `/slips/lookup-product` 등 응답 확인)
- mock: OFF
- 계정: `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`
- `product-service`: created=`2026-08-05T10:17:39.747773714Z`, started=`2026-08-05T10:17:43.342187543Z`. 서비스는 재빌드·재배포·중지하지 않음.
- 실제 화면 검증: 로컬 렌더러와 실 API를 연결한 Chromium 화면. 합성/fixture 화면 아님.

## 판정 요약

| 동선 | 판정 | 결과 |
|---|---|---|
| 분개 A 자동 빈행 | PASS | 최소 2행에서 값 확정 후 3행, 이후 4행 입력 시 5행으로 자동 빈행이 유지됨 |
| 분개 B trailing 빈행 삭제 후 계속 추가 | PASS | 3행 trailing 빈행 삭제 후에도 행 수 3개가 유지되고, 다음 라인 입력 확정 후 4개로 증가함 |
| 분개 C 확정 값 재포커스·지움·교체 | PASS | 1,000을 지운 뒤 1,500으로 교체하고 합계에 반영됨 |
| 분개 F 저장 → 상세 재조회 | FAIL | `POST /accounting/journals`가 HTTP 403으로 거부되어 저장/상세 재조회 불가 |
| (재고)이동 A 자동 빈행 | PASS | 품목 모델 조회 완료 후 다음 빈행이 유지됨 |
| (재고)이동 B trailing 빈행 삭제 후 계속 추가 | PASS | trailing 행 삭제 뒤 다음 모델 입력 시 행 수가 2→3으로 증가함 |
| (재고)이동 C 확정 값 재포커스·지움·교체 | PASS | 수량 2를 지우고 1로 교체했으며 저장 payload에 수량 1이 반영됨 |
| (재고)이동 F 저장 → 상세 재조회 | PASS | HTTP 201, 이동번호 `2026/08/05-1`; 상세에서 라인 2건, 각 요청 수량 1 확인 |
| 견적 B 재판정 | 미실시 | 편집 화면 진입과 trailing 빈행 확인 중 브라우저 세션 시간 초과로 중단. PASS 처리하지 않음 |
| 판매전표 F 저장 → 상세 재조회 | 미실시 | 시간 부족으로 실행하지 않음. R31 PASS A~D는 재실시하지 않음 |
| 견적 E 버전 2개 후 복원 | 미실시 | 대상 상세의 기존 버전 이력은 확인했으나 추가 수정·저장 및 복원 동선은 실행하지 않음 |

## 분개 F FAIL 재현 절차

1. `#/accounting/journals/new` 진입.
2. 기본 2행에서 계정 `상품매출`/`상품매출원가`를 선택하고 11,000씩 차변/대변 입력.
3. trailing 빈행 삭제 후 `현금` 1,500 차변, `보통예금` 1,500 대변을 입력하여 4개 확정 라인을 만듦.
4. 적요 `R33 분개 자동 빈행 QA` 입력 후 `저장` 클릭.
5. 실제 호출: `POST http://localhost:8080/accounting/journals`.
6. 응답: HTTP 403, `FORBIDDEN`, `[SP-PO-1] 동적 권한 deny — page=accounting.journals action=CREATE role=UNKNOWN reason=account permission missing`.
7. 따라서 저장된 분개번호와 상세 재조회가 없으며, 빈행 저장 여부도 저장 API 거부로 검증할 수 없음.

## 생성 파일 및 저장 문서

- 신규 파일: `docs/qa/1062-line-input-r33-real-qa/qa-report.md`
- 저장된 재고이동 문서: `2026/08/05-1` (HQ-001 → CS-001, 요청됨, 라인 2건)
- 분개 저장 문서는 생성되지 않음(403).
- 견적 `2026/08/05-1`은 삭제하지 않음.

## 캡처

이번 라운드는 브라우저 세션 시간 제한으로 캡처 파일을 생성하지 못함. 따라서 캡처를 PASS 근거로 사용하지 않았으며, 위 판정은 실제 DOM·네트워크 응답·상세 재조회 결과만으로 기록함.
