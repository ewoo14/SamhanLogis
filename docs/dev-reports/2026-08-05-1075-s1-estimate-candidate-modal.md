# PR #1078 · 이슈 #1075 S1 구현 보고서

## 결론

견적 라인 모델명 입력을 판매전표와 동일한 `@samhan/design-system`의 `ProductAutocomplete` 공용 경로로 연결했다.

- 부분 문자열 검색: `productApi.searchProducts(q)` 사용
- 후보 2건 이상: 공용 `품목 검색 결과` 모달
- 후보 1건: 공용 컴포넌트의 자동 확정
- 모달 표시: 모델명·품목명·규격·단가
- 선택 확정: 기존 견적의 가격기억/판매가 자동 반영 및 coedit provider 동기화 재사용
- `참조 조회`: 유지
- 백엔드/API 계약: 변경 없음

## RED-first 원문

공용 경로를 견적에 연결하기 전 RED-B 테스트를 먼저 실행했다.

```text
Unable to find an element by: [data-testid="estimate-form-line-0-model"]
```

당시 견적은 `CollaborativeSlipInput`만 렌더링해 `ProductAutocomplete`의 후보 모달 경로가 없었다. 이 실패를 확인한 뒤 구현했다.

## 변경 파일

- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
  - 공용 `ProductAutocomplete`를 데스크톱/모바일 모델 셀에 연결
  - 부분검색 후보 선택을 기존 가격·coedit 적용 흐름에 연결
  - 기존 정확 모델 lookup은 공용 검색 결과가 없을 때의 레거시 안전망으로만 유지
  - 자동 빈행, version restore fence, `lineStructureLocked`, `참조 조회` 경로 유지
- `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx`
  - RED-B 다건 후보(규격/단가/UUID 비노출) 및 단건 자동확정 회귀 테스트 추가
- `docs/dev-reports/2026-08-05-1075-s1-estimate-candidate-modal.md` (신규 보고서)

추적 대상 신규 코드 파일은 없다. 테스트 보조용 `node_modules` junction은 worktree 의존성 해석을 위한 비추적 임시 항목이다.

## 검증

### Vitest

```text
npx vitest run src/renderer/routes/EstimateFormPage
1 test file passed · 35 tests passed
```

### Playwright

지정 명령은 기존 `127.0.0.1:5173` 서버가 사용 중이라 CI webServer 기동 단계에서 시작하지 못했다.

```text
Error: http://127.0.0.1:5173/ is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.
```

기존 서버를 중지하지 않기 위해 `PLAYWRIGHT_SKIP_WEB_SERVER=1`로 재시도했으나, 해당 서버가 이 worktree의 앱인지 확인되지 않아 124초 timeout으로 종료됐고 테스트 결과 파일은 생성되지 않았다. Playwright PASS로 주장하지 않는다.

## 범위 밖 조사

- 분개 화면(`JournalFormPage` 및 Journal 목록/상세): 품목 모델 입력 후보 자동완성 경로를 확인하지 못했다. 변경 없음.
- 재고이동 화면(`TransferFormPage`): `lookupProductByModelName` 정확 lookup만 사용하며 부분검색 비대칭 가능성은 확인했다. 이번 이슈 범위 밖이므로 변경하지 않았다.
- 백엔드 API, Docker, DB, 다른 트랙 파일: 변경 없음.

## 판정

Vitest 기준 S1 견적 회귀 및 RED-B는 GREEN이다. 판매전표/Playwright mock 회귀는 포트 점유로 실행 증거를 확보하지 못했으므로, 개발책임자 환경에서 기존 `5173` 서버를 정리하거나 이 worktree 앱으로 재기동한 뒤 지정 Playwright 명령을 재실행해야 한다.
