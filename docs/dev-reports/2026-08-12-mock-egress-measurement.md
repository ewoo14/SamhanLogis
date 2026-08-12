# Mock fail-closed 전환 전 이탈 경로 실측 보고서

> 측정 라운드: 2026-08-12
> 범위: 측정·목록 작성만 수행. 코드 변경과 git 조작은 수행하지 않음.

## 1. 진행 상태

- 외부 trap: `http://127.0.0.1:28089` 예정
- mock Playwright 실행: 아직 시작 전
- 전체 스위트 20분 제한: 초과 시 즉시 중단하고 당시 결과로 보고

## 2. 진입점 사전 확인

`clients/desktop/src/renderer/api/client.ts:64-83`의 mock interceptor는 `isMockMode()`일 때 `getMockResponse(config)`를 호출한다. 반환값이 `null`이 아니면 `config.adapter`를 mock adapter로 설정하고 반환한다.

반환값이 `null`인 경우 `client.ts:64-83`에는 종료 분기가 없으므로 `client.ts:85` 이후 정상 Axios 요청 처리가 계속된다. 따라서 현재 mock mode의 미처리 Axios 요청은 `client.ts:83` 다음에 실제 네트워크로 이탈할 수 있다.

## 3. fetch / EventSource 사전 grep

측정 대상 소스에서 `fetch(` 호출은 `clients/desktop/src/renderer/realtime/createCoeditProvider.ts:317` 등 realtime/co-edit 경로에 존재한다. `createRealtimeClient.test.ts`에는 테스트용 `globalThis.fetch` 호출도 있다.

`EventSource` 및 `new EventSource`의 실제 renderer 소스 좌표는 별도 grep 결과를 측정 결과에 확정 기재한다.

## 4. 외부 trap 실측

아직 실행 전.

## 5. 전환 설계 초안

아직 실측 결과 반영 전.

