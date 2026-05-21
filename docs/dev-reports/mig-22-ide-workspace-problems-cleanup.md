# MIG-22 IDE workspace + PROBLEMS 정리

> 날짜: 2026-05-21
> 브랜치: `spec/2026-05-21-mig-22-ide-workspace-problems-cleanup`
> 입력: MIG-21 머지 후 사용자 PROBLEMS 지적

## 변경 요약

| 영역 | 변경 |
|---|---|
| IDE workspace | Gradle Java leaf project에 `eclipse` plugin을 적용해 `.classpath` 생성 시 `shared:ecount-io`를 `/ecount-io` project dependency로 인식하게 했다. |
| README | VS Code/Eclipse stale workspace 복구 절차(`./gradlew eclipse`, Java LS clean, Gradle refresh)를 추가했다. |
| desktop | `tsconfig.web.json`에 로컬 TypeScript 5.9 허용값인 `ignoreDeprecations: "5.0"`을 추가했다. |
| Java cleanup | 52개 파일에서 unused import 69건을 제거했다. |
| arologis | `VehicleTonnage.fromRaw("1.4"/"11"/"25")`가 deprecated enum 대신 active enum으로 normalize되도록 정리했다. |

## 결정

| 결정 | 내용 |
|---|---|
| D-MIG-22-01 | `.project`/`.classpath`는 기존 `.gitignore` 정책대로 commit하지 않고, Gradle Eclipse task와 IDE refresh 절차를 source of truth로 둔다. |
| D-MIG-22-02 | TypeScript `baseUrl` deprecation은 로컬 TypeScript 5.9가 허용하는 `ignoreDeprecations: "5.0"`으로 고정한다. |
| D-MIG-22-03 | unused import는 자동 스캔으로 제거하고 compile로 오탐을 검증한다. |
| D-MIG-22-04 | VehicleTonnage legacy 값은 저장 데이터 호환 상수로만 유지하고 신규 raw 입력은 active enum으로 보정한다. |
| D-MIG-22-05 | service-local `DynamicPermissionClient` 잔존 25+ 파일은 MIG-23+에서 shared/security 통합 client로 점진 제거한다. |

## IDE workspace 검증

- repo tracked `.project`/`.classpath`: 없음. 기존 `.gitignore`가 `.project`, `.classpath`, `.settings/`를 로컬 IDE 산출물로 제외한다.
- `./gradlew :shared:ecount-io:eclipseProject :services:accounting-service:eclipseClasspath :services:inventory-service:eclipseClasspath :services:partner-service:eclipseClasspath :services:slip-service:eclipseClasspath --no-daemon --no-parallel` PASS.
- 생성된 4개 service `.classpath`에서 다음 항목 확인:
  - `services/accounting-service/.classpath`: `<classpathentry kind="src" path="/ecount-io">`
  - `services/inventory-service/.classpath`: `<classpathentry kind="src" path="/ecount-io">`
  - `services/partner-service/.classpath`: `<classpathentry kind="src" path="/ecount-io">`
  - `services/slip-service/.classpath`: `<classpathentry kind="src" path="/ecount-io">`

## 검증

- `./gradlew :services:accounting-service:compileJava :services:inventory-service:compileJava :services:partner-service:compileJava :services:slip-service:compileJava --no-daemon --no-parallel` PASS.
- 변경 모듈별 `compileTestJava` PASS:
  - accounting-service, arologis-service, auth-service, dashboard-service, inventory-service, notification-service
  - partner-auth-service, partner-order-service, partner-service, product-service, slip-service
- `./gradlew :services:arologis-service:test --tests com.samhanair.logis.arologis.domain.VehicleTonnageTest --tests com.samhanair.logis.arologis.parser.KakaoDispatchParserTest --no-daemon --no-parallel` PASS.
- `clients/desktop`: `npm.cmd run typecheck`, `npm.cmd run build` PASS. 기존 Pretendard font runtime warning 유지.
- 전체 `./gradlew compileJava compileTestJava --no-daemon`은 Windows 로컬 native memory 부족으로 Gradle daemon이 crash했다. `hs_err_pid*.log`의 root cause는 `Native memory allocation ... Chunk::new`였고, `--no-parallel` 및 모듈별 실행으로 검증을 완료했다.

## 백로그

- MIG-23+: `DynamicPermissionClient` service-local adapter 및 test mock 잔존 25+ 파일을 shared/security 통합 client 기준으로 점진 제거한다.
