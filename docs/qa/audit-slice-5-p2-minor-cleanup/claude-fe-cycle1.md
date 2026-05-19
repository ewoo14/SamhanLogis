# FE 리뷰 — Audit Slice 5 P2 Minor Cleanup (Cycle 1)

**작성일**: 2026-05-19
**검토자**: Claude FE Agent
**대상 파일**: `clients/desktop/src/renderer/components/sales/SalesSubNav.tsx` (L31-43)

---

## 검토 항목

### [FE-1] localhost 하드코딩 → `import.meta.env` 환경변수 fallback 전환

**위치**: `SalesSubNav.tsx` L36-44 (`EXTERNAL_ITEMS` 배열)

**변경 내용**

```ts
// 변경 후 (L38, L42)
url: import.meta.env.VITE_WEB_ESTIMATE_URL ?? 'http://localhost:5183',
url: import.meta.env.VITE_WEB_ORDER_URL    ?? 'http://localhost:5180',
```

**검증 결과**

1. **Vite import.meta.env 사용 정합**: electron-vite 의 renderer 빌드는 표준 Vite 파이프라인을 사용한다. `import.meta.env.VITE_*` 접두사는 Vite 가 빌드 타임에 인라인 치환하는 방식으로, `electron.vite.config.ts` renderer 섹션이 `@vitejs/plugin-react` 를 사용하고 있어 정합하다. 기존 `VITE_API_BASE_URL` 역시 동일한 패턴(`import.meta.env['VITE_API_BASE_URL']`)으로 사용 중임을 `src/renderer/api/client.ts:31` 에서 확인했다.

2. **production 빌드 시 env 미설정 fallback**: `??` (nullish coalescing) 연산자를 사용하여, 환경변수가 `undefined` (미설정) 인 경우 `http://localhost:5183` / `http://localhost:5180` 으로 자동 fallback 된다. Vite 는 `VITE_*` 변수가 선언되지 않으면 `undefined` 를 반환하므로 개발 환경에서의 동작을 그대로 유지한다.

3. **README 환경변수 표 미등록 관찰**: `clients/desktop/README.md` L50-53 의 환경변수 표에 `VITE_API_BASE_URL` 만 있고 `VITE_WEB_ESTIMATE_URL`, `VITE_WEB_ORDER_URL` 두 변수가 미등록 상태다. 코드 동작에 영향을 주는 결함은 아니나, 운영자가 production 배포 시 해당 변수를 누락할 위험이 있다. 단, 본 리뷰는 코드 수정 금지 지시에 따라 문서 수정을 포함하지 않으며 다음 사이클 Fix 에서 반영을 권장한다.

4. **typecheck PASS**: `npm run typecheck` 실행 결과 오류 없음 확인.

**판정**: PASS (경미한 문서 누락 1건 → 다음 Fix 사이클 권장 사항으로 전달)

---

## 종합 판정

| 항목 | 결과 |
|---|---|
| Vite import.meta.env 사용 정합 | PASS |
| production fallback 동작 | PASS |
| desktop typecheck | PASS |
| README 환경변수 표 등록 | 미등록 (권장 사항) |

**최종 판정: PASS** — 핵심 변경 사항(localhost 하드코딩 제거)은 Vite 빌드 규약에 정합하며, fallback 값이 보존되어 개발 환경 호환성을 유지한다. README 문서 누락은 기능 결함이 아닌 운영 편의성 사안으로, Cycle 1 Fix 단계에서 환경변수 표에 두 변수를 추가할 것을 권장한다.
