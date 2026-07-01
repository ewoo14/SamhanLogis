# coedit awareness corrupt 내성 하드닝 (트랙 [3] v2) 구현 계획

> 2026-07-01. #690 소급이 라우팅한 MED. FE-only. #692(safeApplyUpdate) 하드닝의 **awareness-side 미보완 갭** 봉합.

## Goal
`createCoeditProvider`/`createDocCoeditProvider`의 **awareness 적용 경로를 corrupt-내성화**한다. corrupt/비-Yjs awareness payload가 들어와도 `applyAwarenessUpdate` 콜백 예외로 provider가 브릭되지 않고 **skip+warn** 하도록, #692 `safeApplyUpdate` 패턴을 awareness에 미러(`safeApplyAwareness`).

## 근본원인 (정찰)
`createCoeditProvider.ts`:
- `safeApplyUpdate`(L113)는 `coedit:update`를 try/catch로 감싸 corrupt update를 문서 브릭 없이 skip(#692).
- 그러나 **awareness 적용은 raw**: `applyAwarenessUpdate(awareness, decodeBase64Update(x), REMOTE_ORIGIN)`가 **4곳에서 try/catch 없이** 호출:
  - L312: provider1 SSE `coedit:awareness` 핸들러
  - L358: provider1 `applyRemoteAwareness`
  - L602: provider2(doc) SSE `coedit:awareness` 핸들러
  - L637: provider2(doc) `applyRemoteAwareness`
- `decodeBase64Update`(base64 디코딩) **또는** `applyAwarenessUpdate`(Yjs awareness 파싱)가 corrupt payload에서 throw → SSE 콜백/`applyRemoteAwareness` 호출자 예외 → 커서 표시 파손 가능.

## 비목표 (별도)
- **BE relay corrupt prune/압축**(`CollabCoeditService`): opaque relay(Yjs 미해석)라 corrupt 탐지·prune 불가 + prefix 삭제는 snapshot 계약 파손(코드 주석 L45). compaction 프로토콜=별도 에픽. 오염 transient(재기동 소멸)+caps 기존(5000/1MB). → 본 슬라이스 제외.
- **byId 행 원격삭제 피드백**: byId는 slA1b(소비자 배선) 전까지 dead → slA1b 소관.

## Global Constraints
- **FE-only**. BE/게이트웨이/Flyway 0.
- **#692 패턴 정확 미러**: `safeApplyUpdate`(boolean 반환, try/catch, `console.warn(logPrefix ...)`)와 동형 `safeApplyAwareness`.
- 두 provider(createCoeditProvider·createDocCoeditProvider) **4곳 전부** 치환(누락 시 갭 잔존).
- typecheck `npm run typecheck`([[feedback_desktop_typecheck_command]]), 변경 모듈 vitest green.

## 변경 (정확 매핑)

### `clients/desktop/src/renderer/realtime/createCoeditProvider.ts`
1. **`safeApplyAwareness` 헬퍼 신설**(`safeApplyUpdate`(L113) 인접에 배치):
```ts
/** corrupt/비-Yjs awareness update 를 커서 표시 파손 없이 건너뛰기 위한 안전 적용(awareness-side #692 미러). */
function safeApplyAwareness(awareness: Awareness, encoded: string, origin: unknown, logPrefix: string): boolean {
  try {
    applyAwarenessUpdate(awareness, decodeBase64Update(encoded), origin)
    return true
  } catch (err) {
    console.warn(`${logPrefix} corrupt coedit awareness 건너뜀`, err)
    return false
  }
}
```
2. **4곳 치환** — `applyAwarenessUpdate(awareness, decodeBase64Update(<x>), REMOTE_ORIGIN)` → `safeApplyAwareness(awareness, <x>, REMOTE_ORIGIN, '<logPrefix>')`:
   - L312 (provider1 SSE): `event.data.awareness`, logPrefix `'[coedit]'`
   - L358 (provider1 applyRemoteAwareness): `encodedAwareness`, logPrefix `'[coedit]'`
   - L602 (provider2 SSE): `event.data.awareness`, logPrefix `'[doc-coedit]'`
   - L637 (provider2 applyRemoteAwareness): `encodedAwareness`, logPrefix `'[doc-coedit]'`
   (logPrefix는 각 provider의 기존 `safeApplyUpdate` 호출 prefix와 일치.)

### `clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts`
- corrupt awareness 케이스 추가: SSE `coedit:awareness`에 **비-base64/비-Yjs awareness** 주입 → provider가 **throw 안 함**(safeApplyAwareness skip) + 정상 update는 계속 반영 + `console.warn` 호출. `applyRemoteAwareness('오염')`도 무예외.

## Verification
- `cd clients/desktop && npm run typecheck` → 0.
- `npm run test` → createCoeditProvider.test 포함 green(신규 corrupt-awareness 케이스 pass).
- **라이브 QA(실 캡처)**: coedit 2세션 중 한쪽에 corrupt awareness 주입(또는 계측)해도 상대 provider 무브릭·커서 정상·콘솔 warn(브릭 아님) 실증. 정상 awareness(커서)는 계속 표시.

## DoD ([[feedback_canonical_workflow]])
조기PR → Codex 구현 → Opus 5-agent+fix+라이브QA+TM게시 ↔ Codex 5-agent+fix+QA+TM게시 0수렴 → PM 종합 → CI green → squash 머지 → 핸드오프 갱신(트랙[3] 완료·②relay compaction/③byId 별도 후속 등재) → 트랙 [4] 결재 롤아웃.
