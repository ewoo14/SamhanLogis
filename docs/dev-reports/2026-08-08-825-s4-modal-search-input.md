# PR #1120 / 이슈 #825 S4 — 공용 선택 모달 내부 검색 입력

> 검증일: 2026-08-08
> 범위: `SearchResultSelectionModal` 검색 입력·필터·접근성·기존 소비처 회귀

## 1. 결론

- 모달 안에 `검색 결과 필터` 입력을 추가했다. 입력은 design-system 공용 `Input`을 사용한다.
- 입력값은 각 후보의 `getLabel`을 기준으로 대소문자 무시 부분 일치 필터링한다.
- 모달이 열리면 검색 입력에 포커스한다. 발동 시점(`2건 이상이면 모달`)과 소비처의 발동 코드는 변경하지 않았다.
- `single`·`multiple` 모두 필터된 목록에서 선택·확정할 수 있다.
- 필터 결과가 0건이면 `검색 결과가 없습니다.`를 표시하고, 선택 후보가 없을 때 `선택 확정`은 비활성화된다.
- API 호출, mock handler, 화면 UUID 노출 경로는 추가하지 않았다.

## 2. 구현 결정

### 검색 기준

`getLabel(option)`을 검색 텍스트로 사용한다. query는 trim 후 `toLocaleLowerCase()`하고, label도 같은 방식으로 비교한다. query가 비어 있으면 `options` 원본을 그대로 사용하므로 기존 전체 목록 동작과 선택·확정 순서를 보존한다.

검색어를 모달이 열릴 때마다 비운다. 취소 또는 확정 후 다시 열린 모달이 이전 검색어 때문에 빈 목록으로 시작하지 않도록 하기 위함이다. multiple 모드의 선택 key는 검색어를 바꿔도 유지되어, 여러 번 필터링하며 선택한 후보를 한 번에 확정할 수 있다.

### 접근성·포커스

- input type은 `search`, `aria-label`은 `검색 결과 필터`다.
- 공용 `Input`의 `forwardRef`로 모달의 `initialFocusRef`에 연결했다. 기존 후보 `<label>` DOM 비용 계약을 건드리지 않기 위해 `Input`의 `label` prop은 사용하지 않고, 바로 앞의 시각 텍스트와 `aria-label`로 이름을 제공한다.
- `Modal.initialFocusRef`에 안정적인 ref를 전달해 모달 open 시 검색 입력으로 포커스한다.
- 이유: 이 변경의 목적이 모달이 열린 뒤에도 검색어를 계속 입력하게 하는 것이므로, 닫기 버튼이나 첫 선택 컨트롤에 포커스하면 첫 글자 입력 경로가 다시 막힌다.
- Modal의 포커스 트랩·닫힘 후 원래 포커스 복원 계약은 그대로 사용한다.

### 0건 표시

table/list 모두 후보 영역 안에 한국어 안내 문구 `검색 결과가 없습니다.`를 표시한다. 후보가 없고 기존 선택도 없으면 확정 버튼은 disabled 상태다. UUID나 내부 key는 문구·DOM 식별자에 노출하지 않는다.

## 3. 소비처 전수 영향표

`SearchResultSelectionModal` 심볼을 design-system 소스 전체에서 열거한 결과다.

| 소비처 | 사용 형태 | 영향 |
|---|---|---|
| `AsyncAutocomplete.tsx:790` | 실제 모달 렌더링. `single`·`multiple` wrapper의 공통 경로 | 발동 조건·후보 전달·확정 callback 불변. 모달 내부 검색만 추가 |
| `WarehouseAutocomplete.tsx:372` | 실제 모달 렌더링. table columns 경로 | 창고 후보 발동·확정 callback 불변. table도 검색/0건 안내 지원 |
| `MultiSelectAutocomplete.tsx:10` | `SearchResultSelectionMode` type-only import | 런타임 동작 없음. 실제 모달은 `AsyncAutocomplete` 경유 |
| `PartnerAutocomplete.tsx:9` | `SearchResultSelectionMode` type-only import | 런타임 동작 없음. 실제 모달은 `AsyncAutocomplete` 경유 |
| `ProductAutocomplete.tsx:13` | 모달 관련 type import | 런타임 동작 없음. 실제 모달은 `AsyncAutocomplete`/`MultiSelectAutocomplete` 경유 |
| `src/index.ts:83`, `SearchResultSelectionModal/index.ts` | export/re-export | 공개 API 시그니처 변경 없음 |

소비처 파일은 수정하지 않았다. 기존 모달을 쓰는 거래처 5,587건 비용 테스트도 검색 입력이 후보 `<label>`로 집계되지 않도록 유지했고 GREEN이다.

## 4. 테스트 RED → GREEN

추가한 모달 테스트:

- single 모드: 검색어로 한 후보를 남긴 뒤 선택·확정
- multiple 모드: 대소문자 무시 검색으로 후보를 남긴 뒤 선택·확정
- multiple 모드: 0건 안내·확정 disabled·후보 checkbox 없음
- 기존 두 테스트: 검색어 없이 기존 단일/복수 선택·확정 동작 유지
- modal open 후 검색 입력 포커스
- `getLabel`만 검색 기준으로 사용하고 `renderOption` 텍스트는 검색하지 않는 경계
- 실제 창고 소비처와 같은 table columns 경로의 필터·0건 안내
- close 후 재오픈 시 검색어 초기화·검색 입력 재포커스

RED 확인:

```text
검색 입력이 없어서 role="searchbox" name="검색 결과 필터"를 찾지 못함
```

GREEN 확인:

```text
SearchResultSelectionModal.test.tsx: 8 tests passed
```

## 5. 검증

실행 위치: `clients/web/design-system`

```powershell
npm run typecheck
npm run lint
npm test
```

결과:

- typecheck exit 0
- lint exit 0, 기존 경고 69건·오류 0건
- 전체 Vitest `26 passed`, `200 passed`
- PartnerAutocomplete 비용 계약 `5,587` 후보와 DOM 비용 실측 GREEN
- 새 API 호출 0건. `VITE_API_BASE_URL` 격리 실행이 필요한 변경 없음
- 공유 Docker 스택 재기동 없음

## 6. 변경 파일 및 diff 통계

수정 파일:

- `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.tsx`
- `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.test.tsx`
- `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.module.css`

신규 파일:

- `docs/dev-reports/2026-08-08-825-s4-modal-search-input.md`

현재 작업 트리의 `git diff --stat` 삭제 줄 수: **4줄**. 커밋·push는 하지 않았다.
