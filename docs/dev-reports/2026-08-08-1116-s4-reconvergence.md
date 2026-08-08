# #1116 S4 재수렴 적대검증 — 비 `qa*` QA 증거 도달 결함으로 중단

- 대상 PR: #1138
- 대상 HEAD: `8aca47e2eacfe02bba5bdc7323445efa42329b40`
- 판정: **BLOCKING 1건**
- 중단 사유: PM의 “`docs/` 아래 `qa*` 이외 PNG는 문서 자산” 전제가 현재 저장소와 다르다. 사용자 지시(“전제가 틀리면 고치지 말고 중단·보고”, “하나라도 실제 QA 증거면 도달 결함”)에 따라 나머지 각도는 실행하지 않았다.
- Docker: 조회·재기동·변경 없음
- 커밋된 QA/매뉴얼 증거: 덮어쓰기 없음

## 결함 1 — `docs/dev-reports`의 커밋 QA 증거 23장이 호출자 파생 보호축 밖이다

현재 구현의 `deriveQaEvidenceRoot(committedDir)`은 `docs` 바로 아래 이름이 `qa` 또는 `qa-*`인 조상만 증거 루트로 파생한다. 따라서 `docs/dev-reports/<QA 증거 묶음>`을 `committedDir`로 쓰는 resolver 호출자는 증거 루트를 얻지 못하고, 그 커밋 경로를 `QA_SHOTS_DIR`로 지정해도 보호 분기가 실행되지 않는다.

### 저장소 전수 실측

권위 모집단은 다음 명령의 커밋 파일이다.

```powershell
git -c core.quotePath=false ls-files docs
```

PNG 확장자를 `docs/` 바로 아래 디렉터리로 집계한 결과는 다음과 같다.

| 디렉터리 | 커밋 PNG 수 | 판정 |
|---|---:|---|
| `docs/qa` | 6042 | `qa*` 파생 보호 대상 |
| `docs/qa-shots` | **452** | `qa*` 파생 보호 대상. PM 수치 448과 현재 HEAD가 4장 다름 |
| `docs/manual` | 161 | 사용자 매뉴얼 화면 자산 |
| `docs/dev-reports` | 23 | **실제 QA 증거 — 보호축 밖** |
| `docs/migration` | 16 | 이카운트 참조 화면 자산 |
| `docs/design` | 13 | 설계 화면 자산 |
| `docs/character` | 8 PNG (+ GIF 1) | 캐릭터 자산 |
| `docs/templates` | 1 | `{파일명}.png` 템플릿 placeholder |

PM의 `qa=6042`, `manual=161`, `dev-reports=23`, `migration=16`, `design=13`, `character=8`, `templates=1`은 재현됐다. `qa-shots`만 현재 HEAD에서 452로 재현되어 PM의 448과 불일치한다.

### `docs/dev-reports` 23장이 문서 삽화가 아니라 QA 증거인 근거

| 커밋 디렉터리 | PNG 수 | 저장소 표지 |
|---|---:|---|
| `docs/dev-reports/2026-08-04-1055-live-qa-r2/screenshots` | 3 | 파일명 3개가 모두 `*-real-qa.png`; 대응 보고서가 각 시나리오의 “캡처”로 링크하고 102~103행에서 “신규 캡처 3장”으로 선언 |
| `docs/dev-reports/external-carrier-s2-qa` | 7 | 디렉터리명이 `s2-qa`; 메뉴·생성·편집·삭제·권한없음 실행 결과 캡처 |
| `docs/dev-reports/external-dispatch-print-s4-qa` | 7 | 디렉터리명이 `s4-qa`; 전송 결과·인쇄 미리보기·배차 완료 캡처 |
| `docs/dev-reports/external-dispatch-s3-qa` | 6 | 디렉터리명이 `s3-qa`; 선택·모달·전송·결과·배차 완료 캡처 |

이는 단순 설명용 문서 자산이 아니라 라운드 실행 결과를 보존한 커밋 QA 증거다. 사용자 브리핑이 정한 판정 기준에 따라 23장 중 하나만 해당해도 도달 결함인데, 23장 전부가 QA 실행 증거로 분류된다.

### 현재 소비자 여부와 결함 경계

비문서 소스에서 위 네 `docs/dev-reports` 경로 또는 `QA_SHOTS_DIR`과 `dev-reports`를 함께 사용하는 현재 resolver 호출자는 검색 결과 0건이었다. 그러나 브리핑은 “현재 커밋 캡처 중 `qa*` 파생에 안 걸리는 QA 증거가 하나라도 있으면 도달 결함”으로 경계를 명시했다. 또한 반열거 울타리는 모든 resolver에 `deriveQaEvidenceRoot`가 있는지만 검사하므로 이 모집단 누락을 잡지 못한다.

따라서 현재 관측은 다음 둘 중 어느 것도 아닌 셋째 상태다.

1. 비 `qa*` 캡처가 모두 문서 자산이라 안전한 상태가 아니다.
2. 기존 resolver 소비자가 곧바로 이 23장을 덮어쓰는 활성 호출 상태도 아니다.
3. **커밋 QA 증거가 이미 보호 모집단 밖에 존재하지만 현재 이를 대상으로 한 resolver 소비자는 검색되지 않는 상태**다. 사용자 정의에 따라 현재 도달 결함으로 판정한다.

## S2 과차단 재검증 준비 결과

S2 보고서의 비-QA 도구 3개 정확한 경로는 재확인했다.

1. `tools/manual-capture/sync-screenshots.js` → `docs/manual/screenshots`
2. `tools/manual-capture/capture-manual-all.js` → `docs/manual/screenshots`
3. `tools/manual-capture/generate-mobile-placeholders.js` → `docs/manual/screenshots/04-모바일`

소스에서 세 도구가 공용 resolver를 사용하고 위 `committedDir`을 전달하는 것까지 확인했다. 다만 전제 불일치 시 중단 지시 때문에 실제 도구 실행과 여섯 구현 행렬 실행은 하지 않았으며, 통과 판정을 내리지 않는다.

## 실행 위생

- 공유 Docker 스택 명령: 0건
- 브라우저·Desktop·mock 서버 시작: 0건
- 커밋된 QA 증거 대상 resolver 실행: 0건
- 저장소 쓰기: 본 보고서 1개만 신규 생성
- 코드·테스트 수정, 커밋, push: 없음
- 탐색 중 시간 제한에 걸린 `rg` 1건은 명령 호스트가 종료했으며 이 라운드가 시작한 백그라운드 서비스는 없다.
- 종료 시 최근 `node`/`bash` 프로세스의 명령행을 확인했다. `node`는 다른 워크트리 `t1123`의 Vite dev server였고, `bash` 2개는 다른 Claude 세션의 조회 명령이어서 공유 작업으로 보고 회수하지 않았다.

## 이 라운드가 보지 않은 것

전제 불일치 시 중단하라는 지시에 따라 다음은 판정하지 않았다.

- 비-QA 도구 3개의 실제 실행 통과 여부
- `docs/manual/screenshots`와 `04-모바일`의 여섯 resolver 실행 대조
- 기본값 `<committedDir>/_local`, `QA_ALLOW_OVERWRITE=1`, 저장소 밖 경로의 여섯 resolver 실행 대조
- `docs/qa` 자기 슬러그·타 슬러그·루트, `docs/qa-shots`의 여섯 resolver 차단 대조
- UNC·junction·subst 기존 계약 재실행
- `.ts`·`.mjs`·`.cjs`·`.ps1`·`.sh`·`.py` 동일 입력 전체 행렬
- H-2 가드 전수, design-system, Desktop mock 격리 실행
- S2에서 통과했던 나머지 계약의 현재 HEAD 회귀 여부
