/**
 * 테스트 전용 — "0ms 경계" 결정적 flush 헬퍼.
 *
 * 배경 (2026-07-26 하네스 배치, #933 후속):
 *   테스트에서 한 틱을 흘려보내려고 흔히 쓰는
 *     `await new Promise((resolve) => setTimeout(resolve, 0))`
 *   는 WHATWG 의 **중첩 타이머 클램프**(nesting level ≥ 5 → 최소 4ms) 대상이다.
 *   같은 코드라도 "그 파일에서 앞서 실행된 테스트가 있는지"(= 현재 실행 컨텍스트의
 *   타이머 중첩 레벨)에 따라 실제 지연이 1ms 가 되기도 4ms 가 되기도 한다. 그 결과
 *   React 스케줄러(=MessageChannel 매크로태스크)와의 큐 순서가 뒤집혀
 *   **격리 실행은 RED / 전체 실행은 GREEN**(또는 그 반대)이 나온다 — #933 에서 실측됐다.
 *
 * 이 헬퍼는 그 순서 의존을 없앤다. 호출 시점에 이미 예약돼 있던
 *   ① 0ms 타이머 큐 작업(컴포넌트 debounce 등 `setTimeout(fn, 0)`)
 *   ② MessageChannel 매크로태스크(React 스케줄러가 쓰는 큐)
 * 를 **양쪽 모두** 통과시킨 뒤 마이크로태스크 체인을 드레인한다.
 *
 * 결정성의 근거:
 *   - 우리 타이머는 같은 지연의 기존 타이머들보다 **나중에** 등록되므로 항상 마지막에
 *     실행된다(클램프로 우리 지연이 더 길어질 수는 있어도 짧아지지는 않는다).
 *   - 우리 port 메시지도 기존 메시지들보다 나중에 큐잉되므로 항상 마지막이다.
 *   → 두 큐 중 어느 쪽이 먼저 돌든, 반환 시점에는 "호출 시점에 예약돼 있던 0ms 작업이
 *     전부 끝난" 상태가 보장된다. 즉 기존 `setTimeout(resolve, 0)` 보다 **결코 약해지지
 *     않으면서**(경계를 하나 더 통과) 실행 순서 의존만 제거한다.
 *
 * 프로덕션 코드에서 import 하지 않는다 — 테스트에서만 쓴다.
 */
export async function flushZeroDelayTasks(): Promise<void> {
  // ① 타이머 큐 — 이미 예약된 0ms 타이머(컴포넌트 debounce 등)를 통과시킨다.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  // ② MessageChannel 매크로태스크 1틱 — React 스케줄러와 동일한 큐.
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (): void => {
      channel.port1.close()
      channel.port2.close()
      resolve()
    }
    channel.port2.postMessage(undefined)
  })
  // ③ 위 두 경계에서 파생된 마이크로태스크 체인 드레인.
  await Promise.resolve()
  await Promise.resolve()
}
