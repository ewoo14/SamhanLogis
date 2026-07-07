# #765 vite.config pwaRegisterDevStub enforce:'pre' — desktop real-qa 렌더러 부팅 blocker

- PR · 이슈 #765 · 발견 #714 real-qa(qa-tester·frontend-engineer 양쪽 재현)

## 문제
`clients/desktop/vite.config.ts` `pwaRegisterDevStub()` 플러그인 `enforce` 미지정 → Vite 플러그인 순서상 코어 `vite:resolve`가 `virtual:pwa-register`를 일반 npm 패키지로 오인(`Failed to resolve import`·dep 최적화 스캔) → **dev 렌더러 부팅 실패**. desktop real-qa 전체가 잠재 차단(#714 QA는 임시 scratch config로 우회).

## fix
플러그인 반환 객체에 `enforce: 'pre'` 1줄 추가 → 코어 리졸버보다 먼저 실행돼 stub 이 `virtual:pwa-register`를 가로챔. #714 QA 단계서 2에이전트(qa-tester·frontend-engineer)가 동일 스텁+enforce:'pre' scratch config로 렌더러 정상 부팅 실증.

## 검증
- 실 vite.config로 렌더러 부팅 → `virtual:pwa-register` 에러 부재·앱 서빙 확인. typecheck.
