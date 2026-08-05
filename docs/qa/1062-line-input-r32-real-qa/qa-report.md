# R32 라이브 QA 보고서 — PR #1063 / 이슈 #1062

## 환경 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 브랜치/HEAD: git 명령 금지 가드레일로 `rev-parse HEAD`는 실행하지 않음. `.git`은 `C:/dev/Samhan-Public/.git/worktrees/t1062`를 가리킴.
- 렌더러: `clients/desktop/node_modules/.bin/vite` + `src/renderer` + `vite.renderer.dev.config.ts` + `--host 127.0.0.1 --port 5200 --strictPort`.
- 5199는 사용 중이어서 사용하지 않음. 실제 QA 접속 오리진은 `http://localhost:5200`.
- 네트워크 로그로 확인한 API 오리진: `http://localhost:8080`.
- mock: OFF (`VITE_MOCK_MODE` 미설정).
- product-service 컨테이너: `created=2026-08-05T10:17:39.747773714Z`, `started=2026-08-05T10:17:43.342187543Z`.
- 브라우저 연결 오류 후 안내된 Chromium 설치를 시도했고, 실제 Chromium으로 UI를 조작함.
- 서비스 재빌드·재배포·중지 없음.

## 판정 요약

| 동선 | 판정 | 근거 |
|---|---|---|
| 견적 A 자동 빈행 | PASS | 신규 작성 직후 라인 1의 빈행 확인 및 실제 캡처.
| 견적 B trailing 빈행 삭제 후 계속 추가 | FAIL | 라인 2 삭제를 실행했으나 화면상 빈 라인이 유지됨. 재현 절차는 아래에 기록.
| 견적 C 확정 품목 재포커스·지움·교체 | PASS | 확정 SKU를 지운 뒤 같은 SKU를 재입력하고 품목명/판매가 자동 재확인.
| 견적 D 후보 2건+ 모달 | FAIL | `AJ` 입력 후 후보 모달이 열리지 않고 `모델 미존재 또는 lookup 실패`가 표시됨. `참조 조회`는 품목 후보가 아닌 기준정보 모달을 열었음.
| 견적 E 버전 복원 후 라인 상태 | 미실시 | 저장 후 버전 이력이 생성본 1건만 노출되어 복원 후보/복원 발화 조건을 만들 수 없었음.
| 견적 F 저장 → 상세 재조회 | PASS | 문서번호 `2026/08/05-1`, 상세 라인 2건 확인. 입력한 2건과 일치하며 빈행 미저장.
| 분개 A·B·C·D·F | 미실시 | 시간 제한으로 견적 동선까지만 진행.
| (재고)이동 A·B·C·D·F | 미실시 | 시간 제한으로 견적 동선까지만 진행.
| 판매전표 F | 미실시 | R31 A~D PASS 전제이며 이번 라운드 시간 제한으로 F 미실시.

## 견적 상세 결과

저장한 문서:

- 견적 `2026/08/05-1`
- 내부 상세 URL의 UUID는 사용자 보고 식별자로 사용하지 않음.
- 거래처: `(B.E.S.T)에어컨` / `6662700637`
- 저장 라인: `AJ040RXH4BC1` 1개, `AJ040RXH4BC1` 2개 — 총 2행
- 상세 재조회에서 확인한 행 수: 2행
- 저장된 빈행: 없음

### FAIL 재현 절차 — 견적 B

1. 견적 신규 작성에서 거래처 `6662700637`을 선택한다.
2. 라인 1에 `AJ040RXH4BC1`을 입력하고 포커스를 이동한다.
3. 자동으로 생긴 trailing 빈 라인의 `라인 2 삭제`를 클릭한다.
4. 화면을 다시 확인하면 빈 라인이 유지되어 삭제 후 계속 추가 동선의 기대 상태를 확인할 수 없다.

### FAIL 재현 절차 — 견적 D

1. 확정된 라인 1의 모델명을 지운다.
2. `AJ`를 입력하고 포커스를 이동한다.
3. 후보 2건 이상 모달은 열리지 않고 `모델 미존재 또는 lookup 실패`가 표시된다.
4. `참조 조회`를 누르면 후보 모달이 아니라 기준정보 조회 모달이 열린다.

## 캡처 파일

- `01-견적-A-자동빈행-real-qa.png`
- `02-견적-B-trailing빈행삭제-real-qa.png`
- `03-견적-C-확정품목재포커스지움교체-real-qa.png`
- `04-견적-F-저장상세재조회-real-qa.png`

모든 캡처는 실제 브라우저 화면에서 생성했으며 합성/fixture가 아니다. 캡처 드라이버 파일은 새로 만들지 않았고, 커밋 대상이 아니다.

## 새로 만든 파일 목록

- `docs/qa/1062-line-input-r32-real-qa/qa-report.md`
- `docs/qa/1062-line-input-r32-real-qa/01-견적-A-자동빈행-real-qa.png`
- `docs/qa/1062-line-input-r32-real-qa/02-견적-B-trailing빈행삭제-real-qa.png`
- `docs/qa/1062-line-input-r32-real-qa/03-견적-C-확정품목재포커스지움교체-real-qa.png`
- `docs/qa/1062-line-input-r32-real-qa/04-견적-F-저장상세재조회-real-qa.png`

저장으로 만든 견적은 삭제하지 않았다. git `add/commit/push/checkout`은 실행하지 않았다.
