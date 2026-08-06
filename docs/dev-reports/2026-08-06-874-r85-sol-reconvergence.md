# R85 SOL 재수렴 보고 — PR #1057 · 이슈 #874

- 역할: 2차 적대검증자(SOL)
- 검증 HEAD: `3e1ac1a4d032e1d5f4c3829d5e6d1c89f0f463d6`
- 질문: R84 변경면과 그 반대급부에서 실 사용자 경로로 재현 가능한 결함이 있는가
- 판정: **결함 0건 — 머지 권고**

## 1. 정상 거래처 변경과 3중 가드의 반대급부

평범한 `A→B` 거래처 변경은 새 거래처 B의 bulk 최근단가를 적용하고 `lookupLoading`을 내린 뒤 저장을 다시 연다. renderer 사용자 상호작용 테스트에서 자동 라인은 B 단가 `200000`으로 바뀌고, 함께 둔 USER 라인 `7777`은 그대로 보존됐다. 이 단일 정상 변경 재현은 `113.54ms`에 끝났다. 이는 mock 응답 기준이며 실 네트워크 SLA 수치로 확대하지 않는다.

거래처 해제(`partner=null`)는 `handlePartnerAutocompleteChange`에서 `partnerReprice.invalidate(null)`을 한 번만 호출한다. 이어지는 두 `setLines`는 모두 `lookupLoading=false`를 쓰는 멱등 상태 정리이며, 두 번째 갱신만 `priceRefreshChanged=false`를 함께 확정한다. 해제 후 기존 기억단가는 유지되고 거래처 마커만 해제되며, B를 다시 고르면 B 기준 bulk 재가격이 정상 실행됐다. 중복 API 조회나 중복 세션 무효화는 재현되지 않았다.

DC 조회가 끝나지 않는 경로는 `withPriceLookupTimeout`의 `5,000ms` 상한 뒤 `null` DC로 수렴한다. fake timer 실측에서 `5,001ms`에 정가 CATALOG fallback Promise가 settle됐고, 저장 영구 차단은 발생하지 않았다. DC만 지연되고 bulk가 정상 응답하는 조건에서는 저장이 열리는 상한은 약 **5초 + bulk 응답 시간**이다. bulk 자체도 끝나지 않으면 별도의 5초 상한이 적용된다.

## 2. 경합 재수렴

- `A→B`: B의 정당한 bulk 응답 `222000`을 적용한 뒤 늦은 A 단건 응답 `111000`을 폐기했다. 현재 B 단가와 로딩 종료 상태가 유지됐다.
- `A→B→A`: 새 A의 DC가 대기 중인 동안 늦은 B bulk가 도착해도 A의 정가 fallback, 빈 `discountInfo`, `lookupLoading=true`를 바꾸지 않았다. 즉 B 응답이 저장을 잘못 여는 R83 경합은 닫혔다.
- 공격적 무효화 반대급부: 공용 훅의 최신 request id, DC 세대, 현재 거래처가 모두 일치하는 정상 응답은 적용됐다. 이전 응답의 `finally`는 최신 요청의 `isPending`을 내리지 않고, 현재 응답 완료 시에만 로딩이 내려갔다. 정당한 현재 응답 폐기, 정가 고착, `lookupLoading` 영구 잔류는 재현되지 않았다.

## 3. 화면값과 저장값 · 서버 이중 적용

화면에서 확정한 VAT 포함 단가는 생성 payload에 값 그대로 `unitPrice`와 `priceVatInclusive=true`로 한 번 전달됐다. 서버 `SlipService.create`는 현재 요청 단가 목록을 그대로 `calculatedPrices`로 사용하며 DC client 재호출 경로가 없다. 따라서 R67의 `970,200 → 494,802` 서버 이중 적용 경로는 되살아나지 않았다.

좁은 서버 확인인 `:services:slip-service:test --tests '*SlipServiceTest'`도 성공했다. R84와 PM 드라이버 제거 커밋은 이 서버 경로를 수정하지 않았다.

## 4. 증거 무결성

R84 보고서의 명령을 그대로 다시 실행한 결과는 `3 files passed`, `83 passed (83)`, exit 0이었다.

PM 커밋 `71d26bf4e`의 전체 diff는 QA 드라이버 11개 삭제, 총 11경로·1,286줄뿐이다. production 코드, 테스트, 보고서, 캡처, 네트워크 원문은 그 커밋에서 바뀌지 않았다. 현재 HEAD까지 R84 production 변경은 `SlipFormPage.tsx`와 `SlipFormPage.test.tsx` 두 파일뿐이다.

현재 작업트리를 HEAD와 대조하면 `docs/qa`의 추가 차이는 `docs/qa/874-riusage-r76-real-qa/renderer.log` 35줄뿐이다. HEAD에는 빈 파일로 존재하고, 현재 프로세스가 Vite/HMR 35줄을 작업트리에 기록한 상태이며 이 변경은 커밋에 담기지 않았다. 이 파일을 제외한 다른 `docs/qa` 산출물의 작업트리 훼손은 없다.

검증 시작 전부터 있던 untracked 파일 `.qa-r79-renderer.err`, `.qa-renderer.err`, `r62-live-qa-driver.mjs`는 건드리지 않았다. 마지막 파일은 PM이 삭제한 커밋 경로와 이름이 비슷하지만 저장소 루트의 별도 untracked 파일이며, 커밋 증거에는 포함되지 않는다.

## 5. 최종 판정 · 범위

**재현 가능한 결함 0건. PR #1057 머지를 권고한다.** 남은 게이트는 PM이 지정한 ② CI green과 머지 전 라이브QA 재실시다.

이번 라운드에서 보지 않은 범위: R81 `802/802` 전달 계약, R83 오차단 수치 재계수, 알림 내구성, 마이그레이션 번호, riUsage 일마감, `#1077` DTO 충돌, 전체 게이트, Docker 재빌드·재배포·중지, 실제 vendor 발송, 금지된 Playwright 파일, 다른 트랙 `#1066`·`#1069`·`#1075`. DB 직접 쓰기와 실 화면/API 저장도 하지 않았다. 5173 서버를 점유하거나 종료하지 않았고 별도 서버도 기동하지 않았다.

이번 라운드의 새 저장소 파일은 이 보고서 1개뿐이다. QA 디렉토리를 재사용하지 않았고 QA 드라이버와 raw `.log`를 만들지 않았다.
