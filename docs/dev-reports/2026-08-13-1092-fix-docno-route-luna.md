# #1092 문서번호 슬래시 상세 경로 fix — CODEX LUNA

- 실행일: 2026-08-13
- 브랜치: `feat/1092-estimate-menu-canon`
- 범위: 데스크톱 견적 목록 행 클릭 경로만 수정
- 공유 DB 쓰기: 0건

## 원인

`EstimateListPage` 기본 데스크톱 견적 목록의 행 클릭이 UUID 제거 후 목록 `id`(문서번호)를 그대로 URL path segment에 보간했다. 문서번호 `2026/08/10-9`의 `/`가 URL 경계를 나누어 `/sales/estimates/2026/08/10-9`가 되고 404가 발생했다.

통합 목록은 이미 `encodeURIComponent`를 사용하고 있어 웹 저장분 상세 진입에는 손대지 않았다.

## RED → GREEN 원문

### RED

실제 문서번호 `2026/08/10-9`를 사용한 회귀 테스트를 먼저 추가했다.

```text
FAIL EstimateListPage > 슬래시 문서번호 견적 행 클릭은 404가 아닌 단일 상세 경로로 이동한다
expected spy to be called with ['/sales/estimates/2026%2F08%2F10-9']
Received: ["/sales/estimates/2026/08/10-9"]
Tests: 1 failed, 10 skipped
```

### GREEN

기본 목록 행 클릭을 `encodeURIComponent(r.id)`로 변경했다.

```text
npx vitest run src/renderer/routes/EstimateListPage.test.tsx -t "슬래시 문서번호"
✓ 1 test passed

npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/estimateUnifiedListModel.test.ts
✓ Test Files 2 passed
✓ Tests 19 passed
```

결과 경로는 `/sales/estimates/2026%2F08%2F10-9`이며 문서번호 표시 형식은 변경하지 않았다.

## 변경 후 회귀 수치 원문

이번 변경은 프론트엔드 라우팅 1줄과 라우팅 회귀 테스트/fixture만 변경하며 목록 API, 병합, 필터, 저장 데이터는 변경하지 않는다. 라이브QA2의 화면 증거 8장을 변경 후 다시 대조했고, 수치는 다음과 같다.

```text
웹 종합견적 4건 + 웹 주문서 11건 = 웹 저장분 15건
통합 전체 64건
기존 데스크톱 목록 45건 + 데스크톱 주문서 4건 = 49건
필터별: 전체 64 · 데스크톱 견적 45 · 데스크톱 주문 4 · 웹 견적 4 · 웹 주문 11
```

참고: 이 라운드에서는 공유 DB 재조회/브라우저 재실행을 하지 않았다. 위 수치는 `2026-08-13-1092-liveqa2-sol.md`와 PNG 8장에 남은 실측 원문을 변경 후 대조한 값이며, DB write는 없었다.

## UUID 미노출 확인 원문

```text
변경 production source (EstimateListPage.tsx): UUID 정규식 0건
목록/상세/중첩 line API UUID: 0건 (liveQA2 원문)
URL 해결: UUID를 URL에 추가하지 않음
웹 저장분 경로: snapshotKey/draftKey encodeURIComponent 유지
```

## 검증

```text
npm run typecheck                         PASS
npm run build                             PASS
관련 테스트                               19/19 PASS
npx vitest run (desktop 전체)              2건 실패
```

전체 테스트의 남은 실패:

1. `src/main/build-output-cjs-interop.test.ts`: `electron failed to install correctly` 로컬 설치 오류. build 산출물 생성 후에도 Electron 패키지 로더가 실패했다.
2. `src/renderer/routes/SlipFormPage.test.tsx`: 사용자가 지정한 무관한 M/N 날짜 테스트 1건 (`2026-08-10` 대 `2026-08-14`).

백엔드 전체 테스트는 실행하지 못했다. 이전 라운드와 동일하게 120초 이내 완료를 보장할 수 없어 이번 라운드에서는 생략했다.

## 라운드 종료 점검

```text
이번 라운드가 남긴 node/electron 프로세스: 0건
이번 라운드가 만든 임시 컨테이너: 없음
삭제된 추적 파일: tools/.s24-build-only/build/deep/tracked-writer.mjs (기존 삭제 상태, 복구하지 않음)
이번 변경으로 삭제한 추적 파일: 0건
공유 DB 쓰기: 0건
```

실행 중인 Docker 컨테이너들은 기존 작업 환경 소유로 확인되어 중지하지 않았다.
