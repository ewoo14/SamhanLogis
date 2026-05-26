# SP-D6-4 partner + arologis Permission Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** partner-service와 arologis-service의 role 기반 `@PreAuthorize` endpoint를 `@RequirePermission`으로 이관하고, auth/desktop/test까지 단일 PR 단위로 맞춘다.

**Architecture:** controller annotation은 `@RequirePermission(page, action)`으로 통일한다. 정적 HR guard만 남기고, `isAuthenticated()`와 `/internal/**`는 그대로 둔다. DPC bean은 각 서비스가 auth-service를 직접 호출한다.

**Tech Stack:** Spring Boot, shared:security `PermissionAspect`, Flyway SQL, React desktop permission matrix, Gradle/Jest-free FE typecheck/lint/build.

---

- [ ] 기존 `@PreAuthorize` 목록을 partner/arologis별로 분류하고 제외 대상을 확정한다.
- [ ] 신규 `@WebMvcTest` IT를 추가해 grant/deny와 `permission.guard.denied` counter를 검증한다.
- [ ] partner-service controller annotation을 PageCode 매핑에 따라 전환한다.
- [ ] arologis-service controller annotation을 PageCode 매핑에 따라 전환한다.
- [ ] 두 서비스에 `DynamicPermissionClientConfig`와 `SAMHAN_AUTH_SERVICE_URL` 설정을 추가한다.
- [ ] auth-service `PageCode` enum과 V34 seed를 추가한다.
- [ ] desktop `permissionsApi.ts`, `PermissionMatrixPage.tsx`에 신규 PageCode를 반영한다.
- [ ] 기존 IT DPC mock이 신규 aspect와 충돌하지 않도록 lenient 기본값을 보강한다.
- [ ] 지정 Gradle/desktop 검증을 모두 통과시킨다.
- [ ] 한국어 단일 commit을 만들고 push하지 않는다.
