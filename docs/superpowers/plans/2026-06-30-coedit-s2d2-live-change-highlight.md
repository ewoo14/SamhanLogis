# 코-에디팅 S2d-2 라이브 변경 하이라이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 임계 前 Yjs 라이브 코-에디팅 중 타 사용자가 방금 바꾼 값을 그 사용자 색으로 ~2.5s 펄스 하이라이트해 실시간 가시화한다.

**Architecture:** awareness 상태에 `lastEdit:{fieldPath,ts}` 추가(FE 정의, relay opaque → BE 무변경). 편집 시 로컬 awareness에 lastEdit 세팅 → SSE relay → 타 클라이언트가 `getRemoteEdits`로 최근(<2.5s) 원격 편집을 읽어 셀 펄스 + 이름. 기존 커서 링(S2a)에 additive.

**Tech Stack:** React + TypeScript, Yjs awareness(`y-protocols/awareness`), vitest.

## Global Constraints
- 브랜치 `feat/coedit-s2d2-live-change-highlight`(base=main). 커밋=Claude 대행(Codex는 파일만).
- **BE 변경 0** — awareness는 opaque base64 relay(`SlipCoeditService`)라 lastEdit 추가는 FE 전용.
- presence 단일색상 `presenceHexFromUserId`(S2a) 재사용 — 커서·하이라이트·이름 동일 색.
- 후방호환: lastEdit는 옵션 필드 — 구버전 클라이언트(미세팅)와 혼재 시 하이라이트만 미표시.
- 본인 편집 하이라이트 제외(원격만). accept/reject 없음(표시만).
- FE 런타임이라 `Date.now()` 사용 가능(워크플로 스크립트 금지 대상 아님).
- 한국어 커밋. 변경 모듈 전체 vitest 통과 후 push.

---

### Task 1: createCoeditProvider — awareness lastEdit (setLocalLastEdit + getRemoteEdits)

**Files:**
- Modify: `clients/desktop/src/renderer/realtime/createCoeditProvider.ts` (가드 추가 ~`:142`, 인터페이스 `:53-71`, provider 메서드 `:530-547` 부근)
- Test: `clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts` (없으면 신규, 있으면 케이스 추가)

**Interfaces:**
- Produces: `interface RemoteFieldEdit { clientId: number; displayName: string; color: string; fieldPath: string; ts: number }`. `DocCoeditProvider`에 `setLocalLastEdit(fieldPath: string): void` + `getRemoteEdits(fieldPath?: string, now?: number): RemoteFieldEdit[]`. 상수 `EDIT_HIGHLIGHT_MS = 2500`.

- [ ] **Step 1: 실패 테스트 — setLocalLastEdit + getRemoteEdits 만료·본인제외**

```ts
// createCoeditProvider.test.ts: 두 provider(doc 공유 시뮬) 또는 awareness 직접 검증
it('setLocalLastEdit + getRemoteEdits: 최근 원격 편집만, 본인·만료 제외', () => {
  const a = createDocCoeditProvider({ slipId: 's1', /* deps mock */ })
  const b = createDocCoeditProvider({ slipId: 's1', /* deps mock */ })
  // a 가 편집 → b 가 a 의 lastEdit 수신(awareness 왕복 시뮬)
  a.setLocalLastEdit('header.memo')
  // relay 시뮬: b.applyRemoteAwareness(a awareness 인코딩)
  const now = a.__lastEditTsForTest ?? 0
  expect(b.getRemoteEdits('header.memo', now + 100).map((e) => e.fieldPath)).toEqual(['header.memo'])
  expect(b.getRemoteEdits('header.memo', now + 3000)).toEqual([]) // 만료(>2500)
  expect(a.getRemoteEdits('header.memo', now + 100)).toEqual([]) // 본인 제외
})
```
> awareness 왕복 시뮬이 복잡하면, `isEditAwarenessState` 가드 + getRemoteEdits 필터 로직을 awareness.getStates() mock으로 직접 단위 검증(권장). 핵심 단언: fieldPath 매칭·now-ts<2500·clientId≠self.

- [ ] **Step 2: 실패 확인** — `node_modules/.bin/vitest run src/renderer/realtime/createCoeditProvider.test.ts` → FAIL(메서드 없음)

- [ ] **Step 3: 구현**

```ts
// 상수(파일 상단 기존 상수부)
const EDIT_HIGHLIGHT_MS = 2500

// 가드 (isFieldAwarenessState :142 아래)
function isEditAwarenessState(value: unknown, fieldPath?: string): value is {
  user: { displayName: string; color: string }
  lastEdit: { fieldPath: string; ts: number }
} {
  if (typeof value !== 'object' || value === null) return false
  const state = value as { user?: unknown; lastEdit?: unknown }
  if (typeof state.user !== 'object' || state.user === null) return false
  if (typeof state.lastEdit !== 'object' || state.lastEdit === null) return false
  const user = state.user as Record<string, unknown>
  const edit = state.lastEdit as Record<string, unknown>
  if (typeof user['displayName'] !== 'string' || typeof user['color'] !== 'string') return false
  if (typeof edit['fieldPath'] !== 'string' || typeof edit['ts'] !== 'number') return false
  if (fieldPath && edit['fieldPath'] !== fieldPath) return false
  return true
}

// 타입(RemoteFieldCursor 정의부 근처)
export interface RemoteFieldEdit {
  clientId: number
  displayName: string
  color: string
  fieldPath: string
  ts: number
}

// DocCoeditProvider 인터페이스에 추가
setLocalLastEdit: (fieldPath: string) => void
getRemoteEdits: (fieldPath?: string, now?: number) => RemoteFieldEdit[]

// provider 객체(setLocalCursor/getRemoteCursors :530-547 뒤)
setLocalLastEdit: (fieldPath: string) => {
  awareness.setLocalStateField('lastEdit', { fieldPath, ts: Date.now() })
},
getRemoteEdits: (fieldPath?: string, now: number = Date.now()) => {
  const edits: RemoteFieldEdit[] = []
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === doc.clientID || !isEditAwarenessState(state, fieldPath)) continue
    if (now - state.lastEdit.ts >= EDIT_HIGHLIGHT_MS) continue
    edits.push({ clientId, displayName: state.user.displayName, color: state.user.color,
      fieldPath: state.lastEdit.fieldPath, ts: state.lastEdit.ts })
  }
  return edits
},
```
> `createCoeditProvider`(단일 Y.Text, `:156-353`)에도 동일 setLocalLastEdit/getRemoteEdits 추가(CollaborativeTextField가 이 provider 사용 시). 인터페이스 공유면 1곳, 분리면 양쪽.

- [ ] **Step 4: 통과 확인** + **Step 5: 커밋** — `feat(collab): S2d-2 Task1 — createCoeditProvider awareness lastEdit(setLocalLastEdit·getRemoteEdits<2500ms·본인제외)`

---

### Task 2: CollaborativeSlipInput + CollaborativeTextField — 편집 송신 + 원격 펄스 하이라이트

**Files:**
- Modify: `clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.tsx` (`remoteEditsFor` 헬퍼, state, onChange `:144-150`, 렌더 `:81-130`)
- Modify: `clients/desktop/src/renderer/components/collab/CollaborativeTextField.tsx` (메모 동일 패턴)
- Modify: `clients/desktop/src/renderer/styles/*` 또는 inline — 펄스 keyframe
- Test: `clients/desktop/src/renderer/components/collab/CollaborativeSlipInput.test.tsx`

**Interfaces:**
- Consumes: Task1 `provider.setLocalLastEdit`, `provider.getRemoteEdits`, `RemoteFieldEdit`.

- [ ] **Step 1: 실패 테스트 — 원격 lastEdit 시 펄스 표시 + 2.5s 후 소멸**

```tsx
// CollaborativeSlipInput.test.tsx (fake timers)
it('원격 편집 시 셀 펄스 하이라이트 + 이름, 2.5s 후 소멸', () => {
  vi.useFakeTimers()
  const provider = makeProviderStub() // getRemoteEdits 가 [edit] → 이후 [] 반환하도록 제어
  provider.getRemoteEdits = vi.fn()
    .mockReturnValueOnce([{ clientId: 2, displayName: '김영업', color: '#DB2777', fieldPath: 'header.memo', ts: 0 }])
    .mockReturnValue([])
  render(<CollaborativeSlipInput provider={provider} fieldPath="header.memo" value="" onValueChange={() => {}} />)
  // 구독 콜백 트리거(provider.subscribeAwareness 등록 콜백 호출) → 펄스
  act(() => provider.__emitAwareness())
  expect(screen.getByTestId('slip-coedit-edit-pulse')).toBeTruthy()
  act(() => vi.advanceTimersByTime(2500))
  expect(screen.queryByTestId('slip-coedit-edit-pulse')).toBeNull()
  vi.useRealTimers()
})
```

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: 구현 (CollaborativeSlipInput)**

```tsx
// 헬퍼(remoteCursorsFor 옆)
function remoteEditsFor(provider: DocCoeditProvider | null, fieldPath: string): RemoteFieldEdit[] {
  return provider ? provider.getRemoteEdits(fieldPath) : []
}
// state
const [remoteEdits, setRemoteEdits] = useState<RemoteFieldEdit[]>(() => remoteEditsFor(provider, fieldPath))
const editHighlight = remoteEdits[0]
// syncAwareness(:70)에 추가
const syncAwareness = () => {
  setRemoteCursors(remoteCursorsFor(provider, fieldPath))
  setRemoteEdits(remoteEditsFor(provider, fieldPath))
}
// 페이드 타이머: 편집 있으면 2.5s 후 재평가(추가 awareness 업데이트 없어도 소멸)
useEffect(() => {
  if (!provider || remoteEdits.length === 0) return undefined
  const timer = setTimeout(() => setRemoteEdits(remoteEditsFor(provider, fieldPath)), 2500)
  return () => clearTimeout(timer)
}, [provider, fieldPath, remoteEdits])
// onChange(:148 setProviderValue 뒤)
if (provider) { setProviderValue(provider, fieldPath, nextValue); provider.setLocalLastEdit(fieldPath) }
// 렌더: wrapperStyle에 editHighlight 시 펄스 배경 추가(커서 ring과 공존), 이름 배지 옆 "수정"
// editHighlight && !primaryRemote 일 때 background 펄스, primaryRemote 있으면 ring 우선 + 배지에 "수정" 병기
```
펄스 시각: `editHighlight` 존재 시 wrapper에 `data-testid="slip-coedit-edit-pulse"` 오버레이 `<span aria-hidden style={{ position:'absolute', inset:0, borderRadius:'var(--radius-md)', background:`${editHighlight.color}22`, animation:'slip-edit-pulse 2.5s ease-out forwards', pointerEvents:'none', zIndex:1 }} />` + 이름 배지 텍스트 `{displayName} 수정`. keyframe `@keyframes slip-edit-pulse { from{opacity:1} to{opacity:0} }`(global.css 또는 styled). key={editHighlight.ts}로 새 편집 시 애니 재시작.

- [ ] **Step 4: CollaborativeTextField 동일 패턴** — 메모 textarea onChange에 `setLocalLastEdit('header.memo')`(또는 props fieldPath), 원격 lastEdit 시 필드 테두리/라벨 펄스(mirror-div 커서와 별개, `data-testid="memo-coedit-edit-pulse"`).

- [ ] **Step 5: 통과 + typecheck** — `npm run typecheck && vitest run src/renderer/components/collab/` → PASS

- [ ] **Step 6: 커밋** — `feat(collab): S2d-2 Task2 — CollaborativeSlipInput/TextField 편집 시 lastEdit 송신 + 원격 펄스 하이라이트(2.5s 소멸·이름)`

---

### Task 3: 문서 + 라이브 QA

**Files:**
- Create: `docs/dev-reports/2026-06-30-coedit-s2d2-live-change-highlight.md`
- Modify: `migration/decisions/DECISIONS.md`(D-COEDIT-S2D-04 라이브 변경 하이라이트=접근법 A), `ROADMAP.md`

- [ ] **Step 1: dev-report + DECISIONS + ROADMAP**
- [ ] **Step 2: 전체 vitest + typecheck + lint** (변경 모듈 회귀)
- [ ] **Step 3: 실 캡처** — vite 직접서빙 데모(redline-demo 패턴)로 CollaborativeSlipInput에 원격 lastEdit 시뮬 주입 → 펄스 하이라이트+이름 캡처(BE 무변경이라 mock provider로 충분)
- [ ] **Step 4: 커밋** — `docs(collab): S2d-2 dev-report·DECISIONS·ROADMAP`

---

## Self-Review

**1. Spec coverage:** awareness lastEdit=Task1 ✓ / 편집 송신+원격 펄스=Task2 ✓ / 메모=Task2 Step4 ✓ / presence 색 재사용=Task1·2(state.user.color) ✓ / vitest 만료·본인제외·소멸=Task1·2 ✓ / BE 무변경=Global Constraints ✓.

**2. Placeholder scan:** TBD 없음. awareness 왕복 시뮬이 복잡하면 getStates() mock 대안 명시(Task1 주석).

**3. Type consistency:** `RemoteFieldEdit`(Task1 정의) ↔ Task2 사용 일치. `setLocalLastEdit(fieldPath)`/`getRemoteEdits(fieldPath?, now?)` 시그니처 Task1↔2 일치. `EDIT_HIGHLIGHT_MS=2500` ↔ 타이머 2500 일치. testid `slip-coedit-edit-pulse` Task2 정의↔테스트 일치.

> 비대상: 편집모드 내 라이브 redline 스택(B)=S2d-2b. 워크플로우=조기PR→Codex구현→순차 듀얼리뷰 0수렴→라이브QA→PM종합→CI→squash머지.
