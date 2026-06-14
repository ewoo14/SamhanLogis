# desktop 단위 테스트(vitest) 인프라 + 인쇄 유틸/결재문서 헬퍼 단위 커버리지

> 미리보기 표준화 에픽 후속 인프라 슬라이스(큐 #4). desktop 은 단위 러너(vitest) 부재로
> `orderNo.test.ts`(슬라이스1) 등이 CI 미연동(order-app vitest 로 격리 수동 실행). 본 슬라이스가
> desktop 자체 vitest 를 도입하여 순수 함수 단위 테스트를 CI 게이트화한다. 슬라이스2 결재문서
> 인쇄 헬퍼(QA P2-6: approvalDoc 렌더/로직 CI 회귀 부재)도 동반 커버.

## 동기
- `orderNo.test.ts`(16건, vitest import 이미 사용) — CI 미실행. `stripSlipNoZeros` 는 슬라이스1
  Playwright source-contract spec 으로 일부 커버되나, 단위 러너가 정식 게이트가 아님.
- `ApprovalDocView.tsx`(슬라이스2)의 순수 헬퍼(`buildApprovalSteps`/`finalDecidedAt`/`fieldRows`/
  `contentParagraphs`/`attachmentDetails`)는 real-qa(A1/A2/A3)로만 검증 — CI 단위 회귀 부재(QA P2-6).
- 향후 종합견적서 에픽(세트 구성품 데이터 변환 등 순수 로직 다수)이 단위 테스트 인프라를 요구.

## 변경
1. **신규 `clients/desktop/vitest.config.ts`** (order-app 모델): `test.include=['src/**/*.test.ts']`,
   `environment: 'node'`(현 대상 전부 순수 함수 — jsdom 불요), `passWithNoTests: false`, default reporter.
2. **`clients/desktop/package.json`**: devDep `"vitest": "^2.1.4"`(order-app 과 동일 메이저) 추가 +
   scripts `"test": "vitest run"`, `"test:watch": "vitest"`. (lockfile 동기화는 PM 이 `npm install` 로 수행.)
3. **신규 `clients/desktop/src/renderer/print/approvalDoc.ts`**: `ApprovalDocView.tsx` 의 순수 헬퍼를
   추출(JSX 없는 순수 함수만). `ApprovalDocView.tsx` 는 이 모듈에서 import(동작 불변, 리팩터링).
   추출 대상: `buildApprovalStep`/`buildApprovalSteps`/`finalDecidedAt`/`buildDocHeader`/
   `contentParagraphs`/`fieldMap`/`fieldRows`/`attachmentTitle`/`attachmentDetails`(+`CLOSING_NOTE`).
   타입(PrintApprovalStep/PrintDocHeader, ApprovalLineAdminResponse 등) import 유지.
4. **신규 `clients/desktop/src/renderer/print/approvalDoc.test.ts`**: 추출 헬퍼 단위 테스트.
   - `buildApprovalSteps`: 작성칸 1 + 결재선; 마지막 인덱스만 '결재', 나머지 '합의'; 단일 step='결재';
     APPROVED 만 decidedAt; null approverName→'-'.
   - `finalDecidedAt`: APPROVED 만, 최종(최고 sequence) 승인일; REJECTED decidedAt 제외; 전부 PENDING→undefined.
   - `buildDocHeader`: issueDate 없으면 키 생략(exactOptional).
   - `fieldRows`: 템플릿 순서 우선 + 빈값 제외 + 템플릿 밖 키 '추가 필드 N' + fieldType 전달.
   - `attachmentDetails`: refSlipNo→stripSlipNoZeros / refSlipNo null 시 refDocNo fallback / 빈값 제외.
   - `contentParagraphs`: null→[], 멀티라인 분리/trim/빈줄 제외.
5. **`.github/workflows/ci.yml`** frontend-desktop 잡: `build` 다음에 `- name: 단위 테스트(vitest)` `run: npm test` 스텝 추가.

## 회귀 가드
- `ApprovalDocView.tsx` 동작 불변(헬퍼 추출만, import 경로 변경). typecheck/lint/build/real-qa(A1/A2/A3) 무손상.
- `orderNo.test.ts` 는 desktop vitest 로 정식 실행(기존 order-app 격리 주석 갱신).
- `*.test.ts` 는 production tsconfig exclude 유지(typecheck 0 보존).

## QA / 검증
- `npm test`(vitest) — orderNo 16건 + approvalDoc 헬퍼 전건 PASS. typecheck/lint/build PASS.
- CI frontend-desktop 잡에 단위 테스트 스텝 green.

## 범위 외(후속)
- approvalDoc **렌더** 스모크(Playwright mock) — 본 슬라이스는 순수 로직 단위까지. (QA P2-6 렌더분 후속)
- jsdom 컴포넌트 단위 테스트 인프라 — 현 대상 순수 함수라 불요, 필요 시 후속 도입.
