# 🟢 Codex TM 5-Section Cross-Check Review — SP-08-FU1 Cycle 1

**HEAD**: `a800284b` on `feat/sp-08-fu1-userinternalclient-mockbean-bulk`
**PR**: #249

## 종합 판정: FIX 요청

### A. BE
- **P1** `services/slip-service/src/test/java/com/samhanair/logis/slip/it/ApplicationContextLoadIT.java:64`
  `@MockBean UserInternalClient`는 추가됐지만 `lenient().when(resolveFullName(any())).thenReturn(Optional.of("담당자"))` stub이 없음. 요청 scope의 "39 IT 패턴 일관성: @MockBean + lenient stub" 기준 미충족.
- **P2** 기존 적용 5 IT 동일성 주장 확인 불충분. `SlipQuerySalesIT.java:142`는 동일 패턴이나, `SlipFormV20MatchingIT.java:140`, `SlipInspectControllerIT.java:79`, `SlipSalesDeleteIT.java:108`, `SlipSalesUpdateIT.java:100`은 `UserInternalClient @MockBean`만 있고 `resolveFullName` lenient stub 없음.
- 제외 대상 정당성 확인: `AbstractPostgresIT.java:23` 추상 부모, `SlipRealtimeBrokerConcurrencyIT.java:28`은 `@SpringBootTest` 없음.

### B. FE
- **P0/P1/P2 없음**. `clients/` 변경 0 확인.

### C. Designer
- **P0/P1/P2 없음**. 인쇄/토큰/사이드바 영향 0.

### D. QA
- **P1** 위 BE 누락 때문에 "Eureka 비활성 환경 ApplicationContext/테스트 안정성 가드"를 전수 적용했다고 보기 어려움. 특히 이번 PR 변경 파일인 `ApplicationContextLoadIT.java`가 stub 없이 남음.

### E. DevOps
- **P0/P1/P2 없음**. CI/docker-compose/Grafana/운영 코드 변경 0 확인.

### F. 한국어 boundary
- 한국어 commit 의도 확인. UUID 비공개/명칭 boundary 영향 없음.

### G. 머지 판단
- 현재는 머지 비권장. `ApplicationContextLoadIT`에 동일 lenient stub 추가 후 재검증 필요.

Codex TM — 2026-05-19
