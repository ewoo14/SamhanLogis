# PR #984 이카운트 품목 임포트 실서버 라이브 QA 보고서

## 결론

product-service의 실제 임포트 컨트롤러에 같은 이카운트 파일 3종을 두 번 연속 전송한 결과는 **HTTP 200 / 200**, 두 번 모두 **HTTP 409 없음**, 활성 품목·품목코드·alias 행 수 모두 불변, 최종 중복 그룹 0건이었다.

다만 지정 게이트웨이 `http://localhost:8080/admin/products/imports/ecount`는 실제 POST가 **404 Not Found**였다. 따라서 판정은 다음과 같이 분리한다.

- **PR #984 product-service 임포트/모델코드 병합 실측:** PASS
- **게이트웨이 경유 종단간 임포트:** BLOCKED — 현재 게이트웨이 라우트 미등록(404)
- **화면에서 보던 품목명 불변:** 독립적인 전/후 품명 샘플 스냅샷을 남기지 못해 이 불변식은 완전 인증하지 않음

## 실행 조건 및 배포본 증명

- 실행일: 2026-07-30 (KST)
- 브랜치: `fix/ecount-import-model-code-merge`
- HEAD: `cf8e93546a8bae7bff0e2084acb8ed1460d14839`
- 관리자: `dev_master`, mock OFF
- 기존 Docker Compose 프로젝트: `infrastructure`
- 재배포 범위: `product-service` 단독
- Gradle: `GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t21`
- 배포 증명 원문: [deployment-proof.txt](evidence/deployment-proof.txt)

```text
worktree_jar_sha256=CC8F76608A7F3EB2D00D8992220CF7854B1BB721911AF8183CD5E326326932C8
main_jar_sha256=CC8F76608A7F3EB2D00D8992220CF7854B1BB721911AF8183CD5E326326932C8
image=sha256:c9466bc30d6b3fd30a7160a98c4a62ccec6db3a243821f22ca78f57bc0d91983
container=created=2026-07-30T01:01:03.670963583Z image=sha256:c9466bc30d6b3fd30a7160a98c4a62ccec6db3a243821f22ca78f57bc0d91983 status=running health=healthy
deployed_jar=cc8f76608a7f3eb2d00d8992220cf7854b1bb721911af8183cd5e326326932c8  /app/app.jar
```

기동 로그에는 DB가 이미 Flyway V28 상태이고 브랜치 최신 migration V27보다 높다는 경고가 있었다. 스키마는 validation 통과·변경 없음이었다. 이 QA에서는 migration을 수정하거나 실행하지 않았다.

## 입력 파일 실측

원본 파일은 저장소에 복사·추적하지 않았다. Swagger 업로드를 위해 만든 QA 임시 복사본은 검증 후 삭제했다.

| 파트 | 실제 파일 | 크기 | SHA-256 |
|---|---|---:|---|
| itemFile | `품목-Excel다운로드.csv` | 313,221 B | `02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C` |
| relationFile | `품목관계-Excel다운로드.csv` | 15,632 B | `00A1964DF081FEDB1EAF270ED0110345E1F856531EB630210F6E5BA7867DE85` |
| groupFile | `품목계층그룹-Excel다운로드.csv` | 4,710 B | `4955F2999017F37511AF3ADE552113FA30C0628B081D6B992F7D171A7CC1EB7E` |

## 라우팅 확인

지정 게이트웨이의 동일 POST를 원본 3파일로 실제 호출했으며 결과는 아래와 같았다.

```http
POST http://localhost:8080/admin/products/imports/ecount
HTTP/1.1 404 Not Found
```

응답 원문: [gateway-post-headers.txt](evidence/gateway-post-headers.txt), [gateway-post-body.txt](evidence/gateway-post-body.txt)

```json
{"timestamp":"2026-07-30T01:49:23.334+00:00","path":"/admin/products/imports/ecount","status":404,"error":"Not Found","requestId":"c4a229fe-786"}
```

실제 PR 컨트롤러가 노출된 `http://localhost:8084/swagger-ui/index.html`의 `POST /admin/products/imports/ecount`를 사용해 아래 두 번의 임포트를 실행했다. 이는 product-service의 실제 Docker 배포본·실 PostgreSQL에 대한 검증이며 게이트웨이 404와 혼동하지 않았다.

## 임포트 요청·응답 원문

인증 토큰과 내부 계정 UUID는 보안·UUID 비공개 원칙에 따라 redaction했다. multipart 파일의 실제 원본 바이트와 해시는 [import-request.txt](evidence/import-request.txt)에 기록했다.

```http
POST /admin/products/imports/ecount HTTP/1.1
Host: localhost:8084
Accept: */*
X-User-Id: [dev_master 계정 UUID redacted]
X-Is-System-Master: true
Cookie: access_token=[redacted]
Content-Type: multipart/form-data; boundary=[browser-generated]
```

multipart part는 `itemFile=@item.csv;type=text/csv`, `relationFile=@relation.csv;type=text/csv`, `groupFile=@group.csv;type=text/csv`였다.

### 1회차

```text
POST http://localhost:8084/admin/products/imports/ecount
HTTP 200
```

응답 JSON 전체 원문: [import-response-1.json](evidence/import-response-1.json)

```json
{
  "totalRows": 2836,
  "imported": 0,
  "updated": 2655,
  "rejectedNullName": 1,
  "skippedPlaceholder": 0,
  "skippedRelationOrphan": 0,
  "aliasImported": 2811,
  "sourceFileHash": "02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C",
  "skippedGroupCount": 12
}
```

위 블록의 생략된 `rejectedSample` 20건과 `skippedGroups` 12건까지 포함한 전체 원문은 링크한 JSON 파일이다. `SKIPPED_MAIN_CANDIDATE`는 fail-closed로 제외된 후보이며 HTTP 실패나 부분 커밋 오류가 아니다.

### 2회차

동일 브라우저 화면에서 동일한 세 파일을 다시 Execute했다.

```text
POST http://localhost:8084/admin/products/imports/ecount
HTTP 200
```

응답 JSON 전체 원문: [import-response-2.json](evidence/import-response-2.json)

1회차·2회차 응답 JSON 파일 SHA-256은 각각 `A294AF12FE4D8EDACD95F49F87AB78D27629BC740EF4506663F4A6BA29B2E1E6`로 완전히 같았다.

## DB 전/후 실측

두 번의 403 권한 탐색 요청은 컨트롤러 본문에 진입하지 않았고 DB 변경이 없었다. 아래 전 스냅샷은 그 탐색 전, 실제 성공 임포트 전 상태다. 모든 스냅샷은 같은 SQL을 `docker exec ... psql -c`로 실행했으며 stdin heredoc은 사용하지 않았다.

```sql
SELECT count(*) FROM products WHERE deleted_at IS NULL;
SELECT count(*) FROM products WHERE deleted_at IS NULL AND product_code IS NOT NULL AND product_code <> '';
SELECT count(*) FROM product_aliases WHERE deleted_at IS NULL;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
```

| 시점 | 활성 products | 활성 product_code 비공백 | 활성 product_aliases |
|---|---:|---:|---:|
| 임포트 전 | 3,049 | 2,655 | 2,811 |
| 1회차 후 | 3,049 | 2,655 | 2,811 |
| 2회차 후 | 3,049 | 2,655 | 2,811 |

전체 psql 원문: [db-pre.txt](evidence/db-pre.txt), [db-post-1.txt](evidence/db-post-1.txt), [db-post-2.txt](evidence/db-post-2.txt)

각 시점의 Flyway 상위 5개는 모두 동일했다.

```text
28 | add product lineage                     | t
27 | allow skipped main candidate status     | t
26 | align price change schedule to live gas | t
25 | product sheet sync generation           | t
24 | quantity sync rule schema               | t
```

## 불변식별 판정

| 불변식 | 실측 판정 | 근거 |
|---|---|---|
| 같은 파일 임포트 시 409 없음 | PASS | direct product-service 1·2회 모두 HTTP 200; `CONFLICT` 없음 |
| 같은 물건이 두 행이 되지 않음 | PASS | 활성 products 3,049 불변, 활성 product_code 2,655 불변, 최종 model_name 중복 그룹 0·product_code 중복 그룹 0 |
| 화면에서 보던 품목명이 바뀌지 않음 | 미완전 | 병합 응답은 2,655 existing row update였으나 품명 전/후 DB 샘플 스냅샷을 별도로 남기지 못함. GUI 사전 화면도 캡처 시 목록이 비어 있어 품명 대조 근거로 사용할 수 없음 |
| 같은 파일 2회 멱등 | PASS | 두 응답 JSON SHA-256 동일, post-1/post-2 DB 스냅샷 SHA-256 동일: `D4366B13CEE8B26832B395F7406CEE4E1620F27CCB88B2ED3F003A928CBBF593` |
| 실패 시 부분 반영 없음 | 조건부 확인 | 실제 성공 임포트에는 실패가 없었다. 사전 403과 게이트웨이 404는 importer 미진입이며 DB 수치는 불변. 강제 importer 내부 실패 경로는 만들지 않았다 |

최종 중복 점검 원문: [db-duplicate-check-post-2.txt](evidence/db-duplicate-check-post-2.txt)

```text
duplicate_active_model_name_groups   0
duplicate_active_product_code_groups 0
```

## GUI 캡처

- [11-import-form-files-selected.png](screenshots/11-import-form-files-selected.png): 관리자 OpenAPI 임포트 화면에서 실제 3파일 선택
- [22-import-result-response-only.png](screenshots/22-import-result-response-only.png): 2회차 HTTP 200 응답 영역 및 결과
- [07-product-catalog-before-import.png](screenshots/07-product-catalog-before-import.png): 데스크톱 기초품목 관리 사전 화면
- [08-sheet-sync-before-import.png](screenshots/08-sheet-sync-before-import.png): 데스크톱 시트 동기화 사전 화면

## 신규 생성 파일 전체 목록

아래 목록은 다음 확인 직후 보완한다. 원본 이카운트 CSV와 업로드 임시 복사본은 목록에 없으며 임시 복사본은 삭제 완료했다.

```text
REPORT.md
evidence/db-duplicate-check-post-2.txt
evidence/db-post-1.txt
evidence/db-post-2.txt
evidence/db-pre.txt
evidence/deployment-proof.txt
evidence/desktop-dev-r3.err.log
evidence/desktop-dev-r3.out.log
evidence/desktop-local-dev.err.log
evidence/desktop-local-dev.out.log
evidence/desktop-vite.err.log
evidence/desktop-vite.out.log
evidence/desktop-vite-r2.err.log
evidence/desktop-vite-r2.out.log
evidence/desktop-vite-r4.err.log
evidence/desktop-vite-r4.out.log
evidence/gateway-post-body.txt
evidence/gateway-post-headers.txt
evidence/import-request.txt
evidence/import-response-1.json
evidence/import-response-2.json
evidence/qa-renderer.err.log
evidence/qa-renderer.out.log
evidence/renderer-vite.err.log
evidence/renderer-vite.out.log
screenshots/02-login.png
screenshots/03-dashboard-after-login.png
screenshots/04-after-login.png
screenshots/05-dashboard.png
screenshots/06-dashboard-authenticated.png
screenshots/07-product-catalog-before-import.png
screenshots/08-sheet-sync-before-import.png
screenshots/09-import-route-guess.png
screenshots/10-product-service-swagger.png
screenshots/11-import-form-files-selected.png
screenshots/12-import-result-1.png
screenshots/13-import-result-1-authenticated.png
screenshots/14-import-result-1-authenticated-retry.png
screenshots/15-import-result-1-cookie.png
screenshots/16-import-result-1-userid.png
screenshots/17-import-result-1-master.png
screenshots/18-import-result-1-success-candidate.png
screenshots/19-import-result-1-success.png
screenshots/20-import-result-2-success.png
screenshots/21-import-result-2-focused.png
screenshots/22-import-result-response-only.png
```
