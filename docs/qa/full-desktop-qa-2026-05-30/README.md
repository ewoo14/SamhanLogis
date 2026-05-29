# 전 기능 Docker 실 QA — 데스크톱 클라이언트 (2026-05-30)

> 현행 `main`(권한재편 #316 + RESTORE #318/#319/#320 머지 후) 기준 **16개 서비스 전체 재빌드**한 실
> Docker 스택 대상. 데스크톱 FE(`clients/desktop`)가 실제 호출하는 REST 엔드포인트를 **게이트웨이
> (:8080) 경유로 MASTER(dev_master) 인증** 하에 실사용 흐름대로 호출 — 멀티에이전트 워크플로 12개
> 영역 병렬 점검. **118개 엔드포인트 점검 / 54 정상 / 67 결함.**
>
> 의의: 기존 검증은 MockMvc IT(게이트웨이·서비스간 통합 미포함)뿐이라, 게이트웨이 라우팅·prefix·
> 인증전파·DB 스키마 불일치가 한 번도 잡히지 않았다. 본 QA가 그 통합 결함을 일괄 노출.

## 영역별 요약

| 영역 | 점검 | 정상 | 결함 | 실사용 가능? |
|---|---|---|---|---|
| 전표(Slip) 조회 | 7 | 7 | 0 | ✅ 정상 (단, 시드 데이터 없어 라이프사이클 미검증) |
| 대시보드 | 1 | 1 | 0 | ✅ 정상 |
| 재고/창고 | 11 | 10 | 3 | 🟡 조회 정상, 재고일괄조회 계약 불일치 |
| 알림/메신저 | 5 | 4 | 3 | 🟡 알림센터 정상, 알리고 CSV 403 |
| 인증/계정 | 14 | 5 | 7 | 🔴 로그인만 정상, 권한·사용자·비번변경 비동작 |
| 권한관리 | 3 | 0 | 5 | 🔴 **전면 비동작(P0)** |
| 거래처(Partner) | 9 | 3 | 7 | 🔴 **목록·4탭·버전이력 전면 비동작(P0)** |
| 견적(Estimate) | 10 | 4 | 8 | 🔴 MASTER 인데도 목록·편집 403 |
| 회계(Accounting) | 28 | 9 | 9 | 🔴 보고서·원장·일마감·현금출납 비동작(P0) |
| 판매/주문 | 14 | 4 | 11 | 🔴 DC설정·견적·vendor OCR 비동작 |
| 아로로지스 | 6 | 3 | 6 | 🔴 **전 배차화면 403(P1)** |
| 마스터데이터 | 10 | 4 | 8 | 🔴 사용자·부서·지역·시트동기화 비동작 |

## 근본원인(Root Cause) — 67개 결함이 9개 원인으로 수렴

### RC1 [P0] 게이트웨이 `/auth/**`·`/api/v1/auth/**` 라우트에 JwtAuthentication 필터 누락
- `api-gateway/.../application.yml` 의 `auth-service-legacy`(Path=/auth/**)·`auth-service-v1`(/api/v1/auth/**)
  에 `JwtAuthentication` 필터가 없어 게이트웨이가 X-User-Id/Role 헤더를 주입하지 않음 → auth-service
  `HeaderAuthenticationFilter` 인증 미성립 → `isAuthenticated()`/`hasRole('MASTER')` 모두 403.
- **영향**: 권한관리 전체(matrix/my/accounts/batch/PUT), 비밀번호 변경, 계정 잠금해제. **AppLayout 7-action
  게이트가 `/my` 403 으로 권한 캐시를 못 받아 메뉴 전반이 fail-closed 될 위험.**
- **수정**: 로그인/정책/재설정(public)은 필터 제외 유지하되, `/auth/admin/**` + `/auth/password/change`
  에 JwtAuthentication 적용하는 라우트 분리 추가.

### RC2 [P0] 게이트웨이 StripPrefix=2 ↔ BE 컨트롤러 풀패스 `@RequestMapping("/api/v1/...")` 불일치
- `/api/v1/...` 라우트가 StripPrefix=2 로 `/api/v1` 제거 → `/{svc}/...` 전달하는데, 일부 컨트롤러는
  풀패스 `/api/v1/{svc}/...` 로 매핑되어 영구 불일치 → DispatcherServlet 핸들러 미발견 → static fallback
  500 `"No static resource ..."`.
- **영향**: 거래처 4탭 전체(`/api/v1/partners/{code}/full|price-discount|shipping-addresses|contacts|revisions`,
  `POST /full`, 복원), 회계 보고서 10종·일마감·총계정원장, 제품 admin sync. (≈17건)
- **수정**: 해당 풀패스 컨트롤러군에 no-strip 게이트웨이 라우트 추가(`partner-blocks-v1` 선례) 또는 컨트롤러
  매핑을 strip 규약(`/{svc}/...`)에 맞춤. **거래처/회계가 통째로 막히므로 최우선.**

### RC3 [P1] FE 호출 경로 prefix 누락 (FE `/admin|/users` ↔ BE `/api/v1/...`)
- **영향**: `/admin/users`(사용자관리 전체, BE `/api/v1/admin/users`+게이트웨이 라우트 부재), `/users/departments`,
  `/users/me/is-executive-office`, 회계 `/admin/accounting/{cash,orders,snapshot}`, `/admin/{purchase,sales}-slips`. (≈10건)
- **수정**: FE apiClient 경로 정합 또는 게이트웨이 no-prefix 라우트 추가.

### RC4 [P0] PostgreSQL `function lower(bytea) does not exist`
- 검색 쿼리에서 keyword 미지정 시 null 이 bytea 로 바인딩 → `lower(col) like` 분기 SQL 실패.
- **영향**: `/admin/partners/search`(거래처 목록 최초 진입), `/api/v1/partner-dc-configs`(거래처 DC설정),
  `/inventory/warehouses/search`(창고 목록). (≈3건, 화면 최초 로드 즉시 500)
- **수정**: BE 쿼리 `cast(:keyword as text)` 또는 null 분기 정리.

### RC5 [P1] 견적(estimate) MASTER 인가 차단 (권한재편 회귀 의심)
- `/slips/estimates` 목록/상세 403 "견적 목록 조회 권한이 없습니다", 편집/발송/수주/거절/전표변환 403
  "견적 편집 권한이 없습니다" — **MASTER 토큰인데도 차단**(동일 토큰 `/slips` 200).
- **영향**: 견적 화면 첫 진입부터 전 조작 차단. 견적→전표 변환(핵심 종착점) 불가. (≈8건)
- **수정**: slip-service EstimateController/Guard 의 MASTER bypass 또는 estimates page 7-action 시드 점검.

### RC6 [P1] 아로로지스 JWT secret 불일치 + 게이트웨이 Authorization 헤더 미제거
- arologis `SAMHAN_AROLOGIS_JWT_SECRET`(dev `dev-only-secret-...`) ≠ 게이트웨이/auth `SAMHAN_JWT_SECRET`
  (dev `dev-secret-change-me-...`). 게이트웨이가 X-User-* 주입하되 원본 Authorization Bearer 를 그대로
  전달 → arologis `ArologisJwtFilter` 가 HeaderAuthenticationFilter 보다 먼저 실행, secret 불일치로 인증
  체인 파손 → 전 배차화면 403. (:8097 직접 + X-User-Role 헤더면 200 으로 정상 확인.)
- **영향**: 가배차(권역/시도)·미배차·배차list·기사배정·수동배차 전부. `/admin/arologis/regions` 도 동일. (≈7건)
- **수정**: 게이트웨이가 다운스트림 전달 시 Authorization 제거, 또는 arologis 가 X-User-Role 존재 시 자체 JWT
  검증 skip, 또는 양 secret 단일화.

### RC7 [P1] 한글 X-User-Department 헤더 인코딩 (ISO-8859-1 mojibake)
- 게이트웨이가 JWT claim `departmentName`("대표실")을 X-User-Department 헤더로 그대로 전파 → HTTP 헤더
  ISO-8859-1 디코딩으로 모지바케 → `@hr.isExecutiveOffice()` 비교 실패 → 정당한 대표실 MASTER 도 403.
- **영향**: 알리고 주소록 CSV 다운로드(`/admin/partners/export/aligo-csv`), 알리고 sync(동일 가드 추정). (≈2건)
- **수정**: 게이트웨이 한글 헤더 URL-encode 또는 charset 정렬 + BE 디코드.

### RC8 [P1/P2] FE-BE 요청/응답 계약 불일치
- `/accounting/journals`: FE period/status 전송, BE from/to 필수 → 500.
- `/inventory/balances/batch`: BE 평면 balances 배열 vs FE `{rows,perWarehouse,total}` 기대 → 화면 파싱 깨짐.
- `/api/v1/auth/password-reset/request`: FE email 미전송, BE email 필수 → 400.
- `PATCH /slips/{id}/driver`: 미매핑 500(기사정보 편집 저장 불가, RC2 계열).

### RC9 [P2] 미배포/데드 라우트 (구현 미완 또는 미배포 추정)
- vendor OCR 업로드/확정, `spec-key-templates`, `material-prices`, `odu-recommendations`, `branch-pipes`,
  `partners/long-pending`, `partners/search`, 구 `sales.ts /api/v1/estimates`(데드). (≈8건, 404)
- **수정**: 기능 구현 여부 확인 후 라우트 배포 또는 FE 데드코드 정리.

## 정상 동작 확인 (✅)
전표 목록/판매·구매 조회, 대시보드, 재고/창고 조회 대부분, 알림센터(미확인/history/ack)·단톡방 목록,
주문서(partner-orders)·주문승인·제품 카탈로그, 회계 계정과목/시산표/분개상세/거래처원장/마감목록/수정요청,
거래처 발송금지 목록·거래처 원장(회계 기반).

## 권고 수정 순서 (영향 범위순)
1. **RC1**(권한관리/메뉴게이트 P0) + **RC2**(거래처·회계 P0) — 게이트웨이 라우트 정합. 단일 게이트웨이
   config 수정으로 ~25건 해소. 최우선.
2. **RC4**(lower bytea) — BE 검색 쿼리 3곳. 화면 최초 진입 500 제거.
3. **RC3**(FE prefix) — 사용자관리 등 ~10건.
4. **RC5**(견적 MASTER 인가) + **RC6**(arologis secret) + **RC7**(한글 헤더) — 인증/인가 전파 3건.
5. **RC8/RC9** — 계약 정합 + 미배포 라우트.

> ⚠️ 본 QA 는 **게이트웨이 경유 = FE 실제 호출 경로** 기준이다. 다수 결함이 게이트웨이 라우팅/인증전파
> 계층에 집중 → 단위/서비스 테스트(MockMvc)는 통과하나 실 통합에서 깨지는 전형. 향후 게이트웨이 경유
> 통합 스모크 테스트를 CI 에 추가 권장.
