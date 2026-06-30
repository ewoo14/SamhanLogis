# 코-에디팅 S2d-2 — 라이브 변경 하이라이트 (설계)

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2d 분할 3(최종). S2a(Yjs 라이브 코-에디팅) + S2d-1/1b(저장 redline) 후속. clients/desktop 중심(BE 변경 0).

## Goal
임계 前 Yjs 라이브 코-에디팅 중, **타 사용자가 방금 바꾼 값**을 실시간으로 그 사용자 색으로 일시 하이라이트해 "누가 무엇을 바꺼는지"를 즉시 보이게 한다(편집 순간 타인 화면에도). spec 비목표대로 accept/reject 없이 **표시만**.

## 배경 — 현 갭 (정찰 aacb7fe96b88e593a)
- S2a awareness는 **커서 위치·선택·이름·색만** 공유(`createCoeditProvider.ts:126-141` `isFieldAwarenessState`). **값 변경 정보는 awareness에 없음.**
- 원격 값 변경은 `subscribeDoc`→`onValueChange`(`CollaborativeSlipInput.tsx:64-79`)로 input value를 **조용히 치환**할 뿐, 색·하이라이트 없음. 유일 단서는 그 사람 커서가 둔 셀의 컬러 링.
- 라이브 코-에디팅은 **편집 모달(`salesEditOpen/purchaseEditOpen`) + 임계 前(DRAFT/SAVED)** 에서만 활성(`SlipDetailPage.tsx:911-976, 1002-1018`).
- 저장 redline(S2d)은 임계 後 read-only view 전용 — 라이브와 분리.

## 결정 — 접근법 A (라이브 변경 하이라이트)
B(편집모드 내 redline 스택)·C(혼합) 대신 **A**: transient 하이라이트. 사유: spec 비목표 "accept/reject 없음·표시만", 라이브엔 일시 하이라이트가 깔끔(저장 redline은 S2d로 완성), BE 변경 0, 저위험. 편집모드 redline 스택(B)은 필요 시 S2d-2b 분리.

## Architecture
awareness 상태에 **`lastEdit: { fieldPath, ts }`** 추가(FE 정의, relay는 opaque base64 그대로 → **BE 무변경**). 사용자가 값을 편집하면 자신의 awareness에 `lastEdit` 설정. 타 클라이언트는 remote awareness의 `lastEdit`를 관찰해 해당 fieldPath 셀을 그 사용자 색으로 ~2.5s 펄스 하이라이트 + 이름. 기존 커서 링(S2a) 위에 additive.

## 컴포넌트

### 1. `createCoeditProvider.ts` — awareness lastEdit 확장
- awareness 상태 타입에 옵션 `lastEdit?: { fieldPath: string; ts: number }` 추가. `isFieldAwarenessState` 가드는 cursor 중심 유지(lastEdit는 옵션, 무해 후방호환).
- `DocCoeditProvider` 인터페이스에 `setLocalLastEdit(fieldPath: string): void` 추가 — 로컬 awareness에 `{ fieldPath, ts: <전달된 timestamp> }` 세팅(`setLocalCursor` 패턴 재사용). **⚠️ `Date.now()`는 워크플로 스크립트 금지 대상이 아닌 런타임 FE라 사용 가능**(브라우저 런타임).
- `getRemoteEdits(fieldPath: string): Array<{ userId, displayName, color, ts }>` — 해당 fieldPath에 최근(예: now-ts < 2500ms) lastEdit가 있는 원격 사용자 목록(`getRemoteCursors` 패턴).

### 2. `CollaborativeSlipInput.tsx` — 편집 시 lastEdit 송신 + 원격 하이라이트
- onChange(`setProviderValue` 직후)에 `provider.setLocalLastEdit(fieldPath)` 추가(`updateCursor`와 병행, debounce 공유 가능).
- 렌더: `provider.getRemoteEdits(fieldPath)`에 최근 편집자가 있으면 셀에 **펄스 하이라이트**(배경 틴트 fade-out 또는 언더라인 펄스, 사용자색) + "{displayName} 수정" 마이크로 배지(기존 커서 이름 배지 패턴 재사용). 2.5s 후 자연 소멸(ts 기반 재렌더 — `requestAnimationFrame` 또는 setTimeout 재평가).
- 본인 편집은 하이라이트 제외(원격만).

### 3. `CollaborativeTextField.tsx` — 메모(Y.Text) 동일 패턴
- 텍스트 변경 시 `setLocalLastEdit('header.memo')` 송신, 원격 lastEdit 시 라벨 영역에 "{name} 수정중" 일시 표시(mirror-div 커서와 별개, 또는 필드 테두리 펄스).

### 4. presence 색상
`presenceHexFromUserId`(S2a 단일색상원) 재사용 — 커서·하이라이트·이름 동일 색.

## Data flow
사용자 편집 → `setProviderValue`(Y.Doc 반영, 기존) + `setLocalLastEdit`(awareness lastEdit) → SSE relay(opaque, BE 무변경) → 타 클라이언트 awareness update → `getRemoteEdits` → 셀 펄스 하이라이트(2.5s) + 이름.

## Error handling / edge
- lastEdit 없는 구버전 클라이언트와 혼재: 옵션 필드라 무해(하이라이트만 미표시). 후방호환.
- 빠른 연속 편집: ts 갱신으로 하이라이트 연장(자연스러움).
- awareness 비영속(재시작 소실)은 S2a 동일 — 라이브 전용이라 무관.
- 본인 변경 하이라이트 제외(원격만), 자기 커서/이름 중복 제외.

## Testing
- 단위(vitest): `setLocalLastEdit`가 awareness에 fieldPath+ts 세팅, `getRemoteEdits`가 최근(<2500ms)만 반환·만료 제외·본인 제외. `CollaborativeSlipInput` 원격 lastEdit 시 하이라이트 DOM(배경/배지) 표시·2.5s 후 소멸(fake timer).
- 통합: 2-provider(로컬+원격 시뮬) awareness 왕복으로 원격 lastEdit 수신 → 하이라이트.
- 라이브 QA: vite 직접서빙 데모(2-세션 시뮬) 또는 mock awareness로 펄스 하이라이트 캡처.

## 비대상 (후속/YAGNI)
- **B 편집모드 내 라이브 redline 스택**(취소선 옛값+새값) = S2d-2b 후속(필요 시).
- 라이브 델타 ↔ 저장 anchor redline 봉합 = 임계 게이트 정책 동반, 후속.
- accept/reject UI = 에픽 비목표(표시만).
- 단일라인 셀 문자 캐럿(handoff 미해결) = 별도 polish.

→ 본 슬라이스 후 **S3**(6문서 롤아웃 + coedit relay shared 공용화)로 협업 에픽 종결.
