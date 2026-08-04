# PR #1063 R14 SOL 5.6 최종 적대검증 보고서

- 검증 일자: 2026-08-05 (Asia/Seoul)
- 작업트리: `C:/dev/Samhan-Public/.claude/worktrees/t1062`
- 브랜치: `fix/1062-line-input-ux`
- 검증 HEAD: `3ed4aaa45741b655d9809276c789063c5d733dea`
- 역할: CODEX SOL 5.6 적대검증 리뷰어
- 판정 질문: R12·R13 이후 사용자 조작으로 도달 가능한 결함이 남아 있는가

## 시작 전 상태

- `git -C . rev-parse --show-toplevel` 결과가 지정 작업트리와 일치했다.
- 브랜치와 HEAD가 지정값과 일치했다.
- 기존 변경 파일 `docs/qa/1062-line-input-real-qa/renderer-real-qa.err.log`, `renderer-real-qa.log`를 확인했으며 본 라운드에서는 건드리지 않는다.
- 금지 범위(코드 수정, 컨테이너 조작, DB 직접 쓰기, 견적·이동·분개 재측정)를 준수한다.

## 검증 기록

> 아래에 조사·재현 결과를 순서대로 append한다.

## 조사 범위와 증거 무결성

- R12/R13 및 R9의 변경분, 판매전표 수정 React state ↔ Y.Doc 변환, Y.Doc 라인 생성·삭제, 저장 payload, BE lineId 검증을 역방향으로 추적했다.
- 실서버는 `127.0.0.1:8080`, 현재 HEAD의 renderer는 `127.0.0.1:18502`에서 응답 중임을 읽기 전용으로 확인했다.
- 다만 이 세션의 in-app Browser runtime은 사용 가능한 브라우저를 `[]`로 반환했다. 스킬 규약상 별도 Playwright/외부 브라우저로 우회하지 않았다. 따라서 아래 결과는 **현재 HEAD의 실행 경로로 결정되는 사용자 도달 결함**이며, R14에서 새로 수행한 라이브 조작이라고 허위 표기하지 않는다.
- 기존 판매전표 실화면 산출물 `03-edit-mode-before-input-real-qa.png`, `04-after-last-line-delete-real-qa.png`는 읽기만 했다. 전표 `2026/07/27-245`, 품목 `삼성 윈드프리`/모델 `AR09TXEAAW`, 수정 폼의 행 삭제 동선이 실 UI에 존재함을 확인하는 보조 증거로만 사용했다.

## 결론 요약

도달 결함은 **2건**이다. 둘 다 R12의 “trailing 빈행은 로컬 draft”라는 경계를 실제 입력 컴포넌트와 행 삭제가 끝까지 지키지 못해서 발생한다. 따라서 목표 `① 도달 결함 0`은 성립하지 않는다.

## 도달 결함 1 — 미확정 행의 비품목 입력이 저장 뒤 다시 나타난다

### 사용자 조작 순서

1. 수정 가능한 판매전표에서 `수정`을 누른다.
2. 맨 아래 미확정 행에서 품목은 선택하지 않고 `규격 2`에 `R14-잔존`을 입력한다. 전표에 기존 확정행이 있으므로 `저장`은 활성 상태다.
3. 협업 전송 debounce가 지난 뒤 `저장`을 누른다. REST payload에는 미확정 행이 빠져 정상 저장된다.
4. 같은 전표에서 다시 `수정`을 누른다.

### 잘못된 결과 원문

- 다시 열린 맨 아래 미확정 행의 `규격 2` 값으로 **`R14-잔존`**이 재출현한다.
- 확정 사양 ③의 “저장 시 미확정 행은 자동 삭제된다”면 해당 입력은 빈 값이어야 한다.

### 도달 근거

- `CollaborativeSlipInput`은 `provider`가 있으면 모든 `items.{index}.{cell}` 입력을 `setProviderValue`로 Y.Doc에 쓴다 (`CollaborativeSlipInput.tsx:292-303`).
- 숫자 index 쓰기는 존재하지 않는 행도 `ensureItemMap`으로 생성한다 (`createCoeditProvider.ts:488-492`, `699-701`). 즉 품목 미확정 행은 React 로컬에만 있지 않다.
- 저장 payload는 `persistedDetailLines`가 `productId` 없는 행을 제외한다 (`SlipDetailPage.tsx:511-514`, `2452`). REST 저장 성공과 Y.Doc draft 잔존이 동시에 일어난다.
- 다시 열 때 `coeditLineIdsAreStale`은 `productId` 없는 행을 건너뛰어 그대로 유지한다 (`coeditLineIds.ts:86-103`). 이후 `coeditLinesToEditLines`가 그 규격 값을 화면 state로 되돌린다.

### 실 데이터 영향 건수

- 제공된 실데이터 기준 수정 가능 OUTBOUND **2,174건** 전부가 이 조작 경로의 모집단이다. 기존 확정행이 있어 미확정 행을 payload에서 제외하고도 저장할 수 있으며, 0라인 문서는 0건이다.

## 도달 결함 2 — 새로 확정한 행을 삭제해도 다음 편집에 부활한다

### 사용자 조작 순서

1. 수정 가능한 판매전표에서 `수정`을 누른다.
2. 맨 아래 빈행에서 실 품목(예: 화면 산출물에 확인되는 모델 `AR09TXEAAW`)을 선택해 확정한다.
3. 방금 확정한 행 우측의 `×`(`N번 행 삭제`)를 누른다. 화면에서 행이 사라진다.
4. 저장하기 전에 헤더의 `적요` 등 아무 협업 필드를 한 글자 편집한다.

### 잘못된 결과 원문

- 사용자가 삭제한 `AR09TXEAAW` 품목 행이 표에 다시 나타난다. 삭제 버튼은 오류나 취소 안내를 내지 않았으므로 기대 결과는 새 trailing 빈행만 남는 것이다.
- 부활한 행을 그대로 저장하면 신규 라인(`lineId: null`)으로 payload에 포함될 수 있다.

### 도달 근거

- 품목 확정 시 trailing 행에는 `addItem()`이 호출되고 Y.Doc 임의 lineId가 생긴다 (`SlipDetailPage.tsx:4827-4837`, `createCoeditProvider.ts:712-725`).
- 그 임의 ID는 현재 서버 소유 ID 집합에 없으므로 폼 변환에서 `lineId: null`로 강등된다 (`coeditLineIds.ts:49-57`, `SlipDetailPage.tsx:686-717`).
- `removeSalesLine`은 화면 state에서는 행을 지우지만 `lineId`가 truthy일 때만 `provider.removeItem(lineId)`를 호출한다 (`SlipDetailPage.tsx:4859-4866`). 신규 확정행은 `lineId: null`이라 Y.Doc 행이 삭제되지 않는다.
- 다음 헤더 편집은 doc update → `applyProviderState`를 발화하고, Y.Doc에 남은 행을 `coeditLinesToEditLines`로 다시 화면에 투영한다 (`SlipDetailPage.tsx:1819-1839`, `1889-1890`).
- R9의 `previousServerLineIds` 삭제 추론은 R12에서 제거됐고, 현재 R12 테스트도 서버 ID 목록이 비어도 기존 provider 품목행이 남는 것을 기대한다 (`SlipDetailPage.lineIdContract.test.tsx:785-797`). 따라서 R9가 막던 삭제행 부활 표면이 다른 형태로 재개방됐다.

### 실 데이터 영향 건수

- 제공된 실데이터 기준 수정 가능 OUTBOUND **2,174건** 전부에서 신규행 추가→삭제가 가능하다.
- 특히 1라인 문서 **2,026건**은 “기존행 삭제 후 새 행으로 교정”이 가장 흔한 경로라, 확정행 읽기 전용 사양의 복구 동선과 직접 겹친다.

## 나머지 새 표면 판정

### 품목 확정 순간의 동시 추가

Y.Array의 서로 다른 신규 ID 두 행은 함께 보존되는 구조다. 현재 코드 추적상 같은 위치를 두 사용자가 확정해도 한 행이 다른 행을 덮는 경로는 찾지 못했다. 다만 실제 2-peer 동시 조작은 이번 라운드에서 수행하지 못했다.

### 확정행 읽기 전용과 되돌림

기존 서버 확정행은 품목 선택기가 없지만 행의 `×` 삭제 후 trailing 빈행에서 다시 선택할 수 있다. 서버 확정행 삭제는 server lineId로 Y.Doc에서도 제거된다. 다만 **신규 확정행**은 결함 2 때문에 이 복구 경로가 막힌다.

### 저장 payload

`persistedDetailLines` 자체는 확정행 포함·미확정행 제외를 동시에 수행한다. 그러나 결함 1 때문에 “payload에서 제외”와 “화면/협업 문서에서 자동 삭제”가 갈라지고, 결함 2 때문에 사용자가 삭제한 신규 확정행이 다시 payload 후보가 된다. 따라서 사용자 관점의 저장 계약은 충족하지 못한다.

## 이 라운드가 보지 않은 것

- 견적·이동·분개는 재측정하지 않았다.
- 컨테이너 중지·재빌드, DB 직접 쓰기, 코드 수정은 하지 않았다.
- 브라우저가 노출되지 않아 R14 신규 라이브 조작, 네트워크 payload 캡처, 실제 2-peer 동시 확정은 수행하지 않았다.
- CI 49/49는 재실행하지 않았다.
- 자동완성 모달의 판매전표 `resultSelectionMode={null}` 의도는 재판정하지 않았다.
- 이동은 수정 가능 문서 0건이라는 기존 미판정을 바꾸지 않았다.

## 머지 판정

**머지 비권고.** R12가 분리했다고 한 로컬 draft가 비품목 셀 입력에서는 Y.Doc에 생성되고, 신규 확정행 삭제는 Y.Doc에서 빠지지 않아 부활한다. 두 결함 모두 일반 사용자 조작으로 수정 가능 판매전표 2,174건에 도달하며, 목표인 `도달 결함 0`이 아니다. CI green은 이 상태 전이의 부재를 의미하지 않는다.
