# 2026-08-01 D-1013 클립보드 복사 구현 보고서

## 1단계 — 레거시 복사 데이터와 계승 범위 확정

레거시 결과표의 원문 헤더 순서는 다음과 같다(`tools/legacy-gas/배차안내문자/Index.html:323-330`).

```html
<th>날짜</th>
<th>원본내역</th>
<th>거래처명</th>
<th>전표번호</th>
<th>배송주소</th>
<th>인수자번호</th>
<th>발송멘트</th>
<th>단톡방</th>
```

선택 셀 복사의 직렬화 원문은 다음과 같다(`Index.html:894-913`).

```js
let rows = [...new Set(selectedCells.map(td => td.parentElement.rowIndex))].sort((a,b)=>a-b);
let cols = [...new Set(selectedCells.map(td => td.cellIndex))].sort((a,b)=>a-b);
for (let r of rows) {
  let rowData = [];
  for (let c of cols) {
    let cell = table.rows[r].cells[c];
    if (cell && cell.classList.contains('selected')) {
      if(cell.style.display === 'none') {
        rowData.push('');
      } else {
        rowData.push(cell.innerText.replace(/\n$/, ''));
      }
    }
  }
  textLines.push(rowData.join('\t'));
}
e.clipboardData.setData('text/plain', textLines.join('\n'));
```

따라서 계승 불변식은 “선택된 것만 복사”, “행은 `\n`”, “열은 `\t`”, “숨은 선택 셀은 빈 값”, “셀 끝의 마지막 줄바꿈은 제거”이다. 우클릭 복사도 동일한 `getSelectedText()` 결과를 숨은 textarea와 `document.execCommand('copy')`로 저장한다(`Index.html:1490-1527`).

현행 `DispatchSmsPreviewResponse`에는 `partnerName`, `slipNo`, `message`, `chatRoomName`이 있고 레거시의 날짜·원본내역·배송주소·인수자번호 전체 값은 없다. 그러므로 현행 화면에서 복사 가능한 배차 대상/멘트 표현 열은 레거시 의미를 보존하는 `거래처명 → 전표번호 → 발송멘트 → 단톡방`으로 정한다. 클립보드 복사는 선택 행에만 적용하고, 기존 `buildSendEntries`/SMS 발송 흐름은 변경하지 않는다.

## 2단계 — RED 실패 테스트

복사 직렬화 helper가 없는 상태에서 다음 테스트를 먼저 추가했다.

실행 명령:

```text
npm test -- --run src/renderer/routes/dispatchSmsClipboard.test.ts
```

RED 원문:

```text
[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\\main\\index.js. npm run build
```

사전 가드를 우회해 직접 실행한 원문도 기록한다.

```text
vitest.config.ts [UNRESOLVED_IMPORT] Could not resolve 'vitest/config'
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

## 3단계 — 최소 구현

- `clients/desktop/src/renderer/routes/dispatchSmsClipboard.ts`에 레거시 직렬화 규칙을 순수 helper로 구현했다.
- 현행 화면에서 제공되는 표현 열을 `거래처명 → 전표번호 → 발송멘트 → 단톡방` 순서로 고정하고, 선택된 행만 `\t`와 `\n`으로 만든다.
- `DispatchSmsPage.tsx`의 각 배차 대상에 선택 checkbox를 추가하고 `design-system`의 기존 `CopyButton`을 사용했다.
- 미매핑 대상도 선택할 수 있으며 단톡방 값은 빈 열로 복사된다. 전화번호와 UUID는 복사 문자열 및 보고서에 넣지 않았다.
- 멘트 textarea 편집값을 복사 문자열에 반영한다.
- `buildSendEntries`, `sendDispatchBatch`, SMS 발송 확인/감사 저장 흐름은 변경하지 않았다.
- `clients/desktop/src/renderer/routes/dispatchSmsClipboard.test.ts`에 선택 행 TSV와 빈 선택 결과 테스트를 추가했다.

## 4단계 — 데스크톱 타입체크 원문

실행 명령:

```text
npm run typecheck
```

결과 원문:

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
```

사전 가드가 실패하여 `tsc` 단계의 타입 오류 유무는 확인하지 못했다.

## 5단계 — 변경 모듈 테스트 원문

실행 명령:

```text
npm test -- --run src/renderer/routes/dispatchSmsClipboard.test.ts
```

결과 원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
- file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts. cd ..\\web\\design-system; npm run build
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다: out\\main\\index.js. npm run build
```

사전 가드가 실패하여 Vitest의 GREEN 결과는 확인하지 못했다. Docker 재빌드·재기동, 실 DB 쓰기, 실제 문자 발송은 수행하지 않았다.

## 6단계 — 정적 확인

- `buildSendEntries`와 `sendDispatchBatch` 호출 위치가 기존과 동일하게 남아 있음을 검색으로 확인했다.
- 복사 helper/test/page 변경 파일만 추가·수정했으며, `git` 명령은 사용하지 않았다.
- `tsc` 전역 실행 파일도 없어 타입체크 사전 가드 우회 검증은 불가능했다.
