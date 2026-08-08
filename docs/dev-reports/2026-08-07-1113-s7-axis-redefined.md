# PR #1119 / 이슈 #1113 — S7 축 재정의 및 재수정

## 결론

S5 되돌림 후 실측 기준으로 축을 다시 적용했다. pipeline 결과를 세는 세 곳은 배열화했고, `Measure-Object` 반환 객체를 세는 두 곳은 원형을 유지했다. `SAMHAN_AUTH_PORT`, `SAMHAN_EUREKA_PORT`, `SAMHAN_API_GATEWAY_PORT`가 실제 호출·health·안내 URL에 반영되도록 정리했다.

## 축 재정의

### `@()`를 씌우는 것

마지막 pipeline 단계가 0개·1개·다건의 객체를 흘릴 수 있고, 그 객체 수를 세는 경우다.

```powershell
@($rows | Where-Object { ... }).Count
@($results | Where-Object { $_.Verdict -ne 'OK' }).Count
```

### `@()`를 씌우지 않는 것

마지막 단계가 이미 단일 객체를 반환하거나, 값 자체가 정확한 속성인 경우다.

```powershell
($items | Measure-Object).Count
($x | Select-Object -First 1).Count
$file.Length
$row.Rows.Count
```

판별문은 **“이 pipeline의 마지막 단계가 여러 객체를 흘릴 수 있는가?”**다. `Measure-Object`는 항상 하나의 측정 객체를 흘리므로 `@()`를 추가하면 안 된다.

## 적용 전수 목록

| 파일 | 위치 | 판정 및 조치 |
|---|---:|---|
| `tools/operational-validation/import-notion-csv.ps1` | 443 | `$results | Where-Object` 성공 pipeline에 `@()` 적용 |
| `tools/operational-validation/import-notion-csv.ps1` | 444 | 실패 집계를 `Get-SmokeFailureCount -Results @($results)`로 통일 |
| `tools/operational-validation/run-smoke-tests.ps1` | 197 | health 실패 pipeline에 `@()` 적용 |
| `tools/operational-validation/smoke-test-helpers.ps1` | 22 | 이미 올바른 `@($Results | Where-Object).Count`; 유지 |
| `infrastructure/scripts/operational-validation.ps1` | 780–781 | Pretendard의 `Measure-Object` 결과 Count; `@()` 미적용, 유지 |
| `infrastructure/scripts/operational-validation.ps1` | 830–831 | S3의 `Measure-Object` 결과 Count; `@()` 미적용, 유지 |
| 기타 `.Count` | 전수 sweep | 명시 배열, 단일 객체 속성, 문자열/행렬/컬렉션 자체 속성은 pipeline Count 함정이 아니므로 변경하지 않음 |

## port override 전수 목록

- `scripts/seed-local-stack.ps1:78`: auth health URL을 `$authServiceBaseUrl`로 구성해 `SAMHAN_AUTH_PORT`를 따른다.
- `infrastructure/scripts/operational-validation.ps1:68–81,599–600,629`: `SAMHAN_EUREKA_PORT`와 `SAMHAN_API_GATEWAY_PORT`를 `Resolve-OperationalPort`로 해석하고 Eureka 호출 및 health map에 사용한다.
- `infrastructure/scripts/start-local-full.ps1:409–410,563,567–568`: 서비스 배열의 override 적용 후 resolved gateway/eureka port를 login/Eureka/API Gateway 안내 URL에 사용한다.
- `start-local-full.ps1`의 기존 `$services` health polling과 `seed-local-stack.ps1`의 14 service health polling은 기존 resolver/환경변수 흐름을 유지했다.

## UTF-16 파일 처리 및 보존 확인

`infrastructure/scripts/operational-validation.ps1`는 UTF-16 LE BOM + CRLF 파일이라 일반 diff/grep이 binary로 처리했다. 다음처럼 UTF-16으로 읽어 검토했다.

```powershell
[IO.File]::ReadAllText($path, [Text.Encoding]::Unicode)
```

수정은 UTF-16 문자열을 정확히 치환한 뒤 `[IO.File]::WriteAllText(..., [Text.Encoding]::Unicode)`로 저장했다. 수정 후 헤더는 `FF-FE-23-00`으로 확인되어 UTF-16 LE BOM을 보존했고, `Measure-Object` 2곳은 `@()` 없이 남아 있다.

추가로 `scripts/seed-local-stack.ps1`는 실측상 UTF-8 BOM이 없어 Windows PowerShell 5.1 `-File`에서 한글 문자열 ParserError가 재현됐다. 내용은 바꾸지 않고 UTF-8 BOM(`EF-BB-BF`)으로 저장해 진입 파싱을 고쳤다.

## RED-A 원문과 검증

```text
RED-A  ① 0/1/다건 — 파이프라인 결과와 Measure-Object 결과 각각
       ② 고친 .ps1 전부를 powershell -NoProfile -File <path> -WhatIf 류로 파싱 확인
          (실행이 위험하면 파싱만이라도 -File 경로로)
       ③ AUTH_PORT · EUREKA_PORT · 안내 URL 이 override 를 따른다
```

- ① `test-s7-axis-redefined.ps1`에서 failure 결과 0/1/다건을 실제 helper에 주입해 0/1/2를 확인했다. `Measure-Object`는 두 곳 모두 단일 측정 객체 Count를 유지하고 잘못된 `@()`가 0건이다.
- ② 변경/신규 `.ps1` 6개를 Windows PowerShell 5.1 `-File ... -?`로 진입시켜 확인했다. `ParserError`, `Unexpected token`, `Missing closing`, `The string is missing`이 0건이다. seed는 BOM 추가 전 실제 ParserError가 났고, BOM 추가 후 통과했다.
- ③ S7 테스트가 auth resolved URL, Eureka/Gateway resolver, start 안내 URL을 확인했고, 정적 source sweep에서도 고정 Eureka 호출 URL이 남지 않았다.

## RED-B

```text
RED-B  ⑤ 전부 그대로
       smoke 7/8 정확 · exit 1 · 404 3종 분리 · seed 14 health · 5계정 로그인 · exit 0
       권한 경계 401/401/403/200 · 전체 위조 차단 · 자격 없으면 throw
```

RED-B 업무 기동/컨테이너 재빌드는 이번 작업 범위와 사용자 금지 조건에 따라 실행하지 않았다. 기존 S1~S4 산출물과 구현은 변경하지 않았으며, S7 회귀 테스트는 통과했다.

## 검증 명령

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\operational-validation\test-s7-axis-redefined.ps1
→ S7 axis regression tests passed.

git diff --check
→ 통과

변경/신규 .ps1 6개 Windows PowerShell 5.1 -File 진입 검사
→ changed_ps1_parser_errors=0
```

## 신규 파일 목록

```text
docs/dev-reports/2026-08-07-1113-s7-axis-redefined.md
tools/operational-validation/test-s7-axis-redefined.ps1
```

컨테이너 재빌드/기동, 다른 워크트리 조작, commit/push는 수행하지 않았다.
