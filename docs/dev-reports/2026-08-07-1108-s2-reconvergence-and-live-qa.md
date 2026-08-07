# PR #1109 / 이슈 #1108 S2 적대검증 + 라이브QA

> 최종 판정 기록. 자격정보는 모두 `<redacted>` 처리했다.

## 0. 환경 확인

- 작업 경로: `C:\dev\Samhan-Public\.claude\worktrees\t1108` (지정 경로 일치)
- 브랜치 / HEAD: `fix/1108-bundle-component-destroy-guard` / `e98a609835aeb405d98d980189c89297df2543a8` (지정 좌표 일치)
- 비교: `git diff origin/main...e98a60983` — 8파일, +275/-8
- Docker: 18개 실행, 18개 모두 `healthy`
- 배포본: `samhan-product-service`는 2026-08-07 16:54:33 KST에 재기동된 #1097용 배포본이다.
- 배포 점유: 2026-08-07 17:11 현재 금지된 타 워크트리 `t1096`에서 Vite `127.0.0.1:5196`와 headless Playwright 실QA 프로세스가 실행 중임을 프로세스 목록으로 확인했다.
- 배포 가능 여부: **배포 불가**. #1097 라이브QA를 깨뜨릴 수 있으므로 `product-service`를 재빌드·재기동하지 않았다.
- 게이트웨이: `http://localhost:8080`
- 자격 출처: `infrastructure/.env.local` 또는 handoff 환경 절 (`<redacted>`)

## 1. 정상 경로 오차단 (RED-A)

- 플래그 전송 프로덕션 호출자는 `ProductFormPage` 1곳뿐이다. 서버의 16인자 구 생성자 호출은 전부 테스트 코드이며, 실제 운영 요청은 `ProductController`의 JSON 역직렬화 경로다.
- 구성품 0건이면 서버 count 조건이 false라 확인 없이 통과한다. 기존 `update_setToGeneral_removesOwnChildBundleComponents` 테스트가 count 기본값 0으로 이 경로를 고정한다.
- 실 DB: 활성 BUNDLE 343건, 구성품 보유 343건, 구성품 0건 0건, 활성 구성품 1,584행. 현재 데이터에서 새 게이트가 막는 전환 대상은 343건이다.
- 구성품 0건 실제 표본은 없어 라이브 관측할 수 없고 코드/단위 테스트 근거만 있다.

## 2. 우회 경로 (RED-D)

- `PATCH /api/products/{id}` 직접 호출: 확인 생략/false이면 활성 구성품이 있는 전환을 서버가 차단한다.
- 품목 삭제 `DELETE /api/products/{id}`: 품목과 견적 노출만 soft-delete하며 구성품 전량 삭제를 호출하지 않아 같은 결과를 만들지 않는다.
- 구성품 `PUT /api/v1/products/{modelCode}/components`: 빈 배열을 400으로 거부하고 UI도 최소 1개를 요구하므로 전량 삭제 우회가 아니다.
- 시트 sync: `ProductService.update`를 호출하지 않는다. product tab은 기존 BUNDLE을 단일로 전환하지 않고, component tab은 부모를 BUNDLE로 표시하고 시트에 없는 구성품만 동기화한다. 이 PR의 숨은 전환 삭제와 같은 경로가 아니다.
- 별도 일괄 품목 수정 endpoint는 검색되지 않았다.

## 3. 확인 문구 건수 (RED-C)

**결함 1 — 표시 건수와 실제 삭제 건수의 TOCTOU 불일치.**

- 화면 문구의 수: 편집 진입 때 `listProducts`가 반환한 `componentCount`.
- 서버 삭제 수: 저장 시 `countByBundleProductIdAndIsDeletedFalse`로 센 현재 수.
- 요청 계약: 수/집합 버전 없이 Boolean `confirmBundleChildrenDeletion=true`만 전송.
- `ProductFormPage`는 카탈로그 SSE를 구독하지 않고 `product-form` 쿼리를 외부 구성품 변경 때 무효화하지 않는다.
- 따라서 사용자 A가 N건을 본 뒤 사용자 B가 기존 구성품 편집 UI에서 N→M으로 저장하면, A는 N건 문구에 동의하지만 서버는 M건 전부를 삭제한다. 같은 N건이어도 구성품 집합이 교체될 수 있으므로 단순 expected count만으로도 충분하지 않다.
- 상세 fix 지시: `docs/dev-reports/2026-08-07-1108-s2-fix-directive.md`.

## 4. 라이브QA

**관측 불가.** #1097 라이브QA가 같은 `product-service`를 실제 점유 중이어서 이 PR 배포가 금지됐다. 따라서 아래 ①~⑤는 실행하지 않았으며 결함 0 근거로 세지 않는다.

1. 구성품 있는 세트 → 단일, 취소 및 SQL 불변: 관측 불가
2. 같은 세트 → 확인, 정상 삭제 및 건수 일치: 관측 불가
3. 분류=자재, 취소/확인: 관측 불가
4. 구성품 없는 품목 세트→단일 무확인 통과: 관측 불가
5. 화면 표시 건수와 실제 삭제 행 수 비교: 관측 불가

## 5. 본 범위 / 안 본 범위

- 본 범위: 변경 diff, PATCH 호출자 전수, 16인자 생성자 실사용, 삭제/구성품 편집/시트 sync 우회, 실 DB 영향 건수, 표시 수→요청→서버 count→soft-delete 데이터 흐름.
- 안 본 범위: #1097 점유로 PR #1109 배포가 불가능하여 실제 GUI 저장·삭제 ①~⑤, 다른 서비스의 비관련 품목 소비 동작, CI 전체 스위트.

## 6. 판정

**실 사용자 경로 도달 결함 1건. 머지 차단.** 라이브QA는 타 트랙 점유로 관측 불가이며 결함 0으로 세지 않았다.

### 코드 검증 명령

- `./gradlew.bat :services:product-service:test --tests "*ProductServiceTest" --rerun-tasks` — exit 0
- `vitest run src/renderer/routes/ProductFormPage.test.tsx` — 1파일, 6/6 통과
- `npm run typecheck` — exit 0 (`tsc` 2종 + real-QA scope 단위 2/2, 50/50)

첫 typecheck 시도는 이 워크트리의 `electron-updater`와 design-system `dist` 부재로 신선도 가드가
중단했다. 소스 변경 없이 `npm ci`와 design-system build로 로컬 파생물을 준비한 뒤 위 결과를 얻었다.
의존성 audit 경고는 기존 lockfile 기준 출력이며 이번 도달 결함 판정에 포함하지 않았다.

## 7. 새 파일 목록

- `docs/dev-reports/2026-08-07-1108-s2-reconvergence-and-live-qa.md`
- `docs/dev-reports/2026-08-07-1108-s2-fix-directive.md`
