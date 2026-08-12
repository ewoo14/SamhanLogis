# PR #1125 (#894) 재수렴 2회차 라이브 QA 증거

- 격리 renderer: `http://127.0.0.1:42375`
- 격리 gateway: `http://127.0.0.1:42380`
- 격리 PostgreSQL: `127.0.0.1:42332`
- 격리 컨테이너 접두사: `reconv2-894-`
- DB 복제: 공유 PostgreSQL을 네트워크 read-only로 읽어 `C:\Temp\reconv2-894\*.dump` 파일 3개에 직접 기록한 뒤 신규 PostgreSQL에 복원했다. 파이프 복제는 사용하지 않았다.

## 스크린샷

PNG 0개. Browser runtime 선택 결과가 아래 원문처럼 비어 있어 실제 화면 캡처는 skipped 처리했다.

```text
No browser is available
[]
```

독립 JWT 세션 2개, 실제 gateway/groupware/user/auth, PostgreSQL, SSE로 왕복과 동시성은 검증했다. 상세 실행 원문과 집계는 `docs/dev-reports/2026-08-12-894-reconvergence2-sol.md`에 있다.
