# PR #1007 / Issue #903 S2 라이브 QA 보고서

- 일시: 2026-08-01 (Asia/Seoul)
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t903s2`
- 대상 브랜치/HEAD: `feat/903-template-authoring-s2` / `e325c3c9c`
- 범위: 실제 groupware-service 배포 및 실 DB/API/화면 검증
- 원칙: 코드 수정 및 Git 쓰기 없음. 캡처는 실제 렌더러 화면만 사용.

## 진행 로그

### 시작

- REPORT.md 생성: 완료
- 초기 판정: 진행 중

## 배포 확인

대상 서비스: `groupware-service`만 재빌드·재기동. 다른 서비스는 재기동하지 않음.

명령:

```powershell
./gradlew.bat :services:groupware-service:bootJar -x test
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up -d --build --no-deps groupware-service
docker inspect -f '{{.Created}}' infrastructure-groupware-service
```

결과:

- `:services:groupware-service:bootJar -x test` → `BUILD SUCCESSFUL` (7초)
- `docker compose ... up -d --build --no-deps groupware-service` → image built, `samhan-groupware-service Recreated/Started`
- `docker inspect -f '{{.Created}}' infrastructure-groupware-service` → `2026-07-31T15:47:40.582649175Z` (KST `2026-08-01 00:47:40`)
- 최종 컨테이너 상태 → `Up ... (healthy)`

판정: PASS

## ① 기존 양식 열기·출력·revision 모드 복원

명령/결과:

- `docker exec samhan-postgres psql -U samhan -d groupware_db -c "SELECT ..."`
  - 시작 baseline: `document_templates=330`, `document_template_revisions=369`
  - mode 누락: templates `330`, revisions `369`
- 실제 인증: `POST http://localhost:8080/auth/login` with `dev_master / dev_p05_pass!` → `200`, role `MASTER`
- 기존 양식 목록: `GET /admin/groupware/document-templates` → `200`, live 목록 반환
- 기존 양식 열기: `GET /admin/groupware/document-templates/31b97122-3a59-467c-901f-4bc375aaa811` 및 실제 renderer 편집기 → 정상 로드. 화면에 HEADER/BODY/FOOTER, TITLE/APPROVAL_GRID/CONTENT_PARAGRAPHS/CLOSING, 라이브 미리보기 표시.
- 기존 저장 JSON: DB `md5(document::text)=fa14f86f51363123148940512234afd9`, revision `1`; 화면 조회 후 동일 hash. API 응답의 `document.mode`는 누락(런타임 WORD 해석).
- 과거 revision: `GET /groupware/document-templates/00f23ba7-f15f-42c0-8b5b-1c33963c1535/revisions/1` → `200`, `revision=1`, `paper=A4_PORTRAIT`, `bands=3`, mode 누락(런타임 WORD 해석).

판정: PASS — legacy JSONB는 수정되지 않았고, 기존 양식 및 과거 revision이 정상 로드됨.

캡처: `01-template-list.png`, `02-existing-template-editor.png`

## ② 모드 계승·명시적 변경 거절

전용 throwaway 검증:

- `POST /admin/groupware/document-templates` → `201`, mode `EXCEL`, revision `1`
- mode 생략 `PUT` → `200`, revision `2`, 반환 mode `EXCEL` (기존 mode 계승)
- 명시적 다른 mode `WORD` `PUT` → `422 UNPROCESSABLE_ENTITY`, `문서 양식 저작 방식은 생성 후 변경할 수 없습니다...`
- throwaway 2건(첫 요청 응답 처리 오류로 서버에 남은 1건 포함)을 식별자 기준으로 정리.

판정: PASS

캡처: `02-existing-template-editor.png`의 실제 편집기/라이브 미리보기. mode 계승·거절은 API 응답과 DB 정리 출력으로 증명.

## ③ 실제 화면 캡처

실제 renderer (`VITE_APP_VERSION=2026/08/01-1`, Vite port `5181`)에서 `dev_master`로 로그인 후 캡처.

판정: PASS — 합성/목업이 아닌 실제 로컬 Docker API와 실제 렌더러 왕복 화면.

캡처 파일:

- [01-template-list.png](./01-template-list.png) — 실제 결재 문서 양식 목록
- [02-existing-template-editor.png](./02-existing-template-editor.png) — 실제 기존 양식 편집기와 라이브 미리보기

## 정리 후 행 수 대조

- template 행 수: `330` (기대 330)
- revision 행 수: `369` (기대 369)
- mode 누락: templates `330`, revisions `369`
- throwaway 잔여: `0`
- 확인한 기존 양식 hash: `fa14f86f51363123148940512234afd9` (변경 없음)
- 판정: PASS

## 확인하지 못한 것

- 인앱 Browser 연결은 이 환경에서 사용할 수 없어 standalone Playwright headless renderer로 캡처했다. 실제 Vite renderer, 실제 Docker gateway/service, 실제 DB를 사용했으며 합성 데이터 화면은 사용하지 않았다.
- 기존 양식 330건 중 API의 non-deleted 목록은 1건이었다. DB상 나머지 329건은 soft-deleted 상태이므로 관리자 목록에 표시되지 않는 환경 데이터 차이다.
- 과거 revision의 mode는 저장 JSON에서 누락되어 `WORD`로 런타임 해석됨을 API/DB로 확인했다. 과거 revision의 별도 명시 mode(`EXCEL`) 보존 사례는 현재 실 DB baseline에 없어 확인하지 못했다.
