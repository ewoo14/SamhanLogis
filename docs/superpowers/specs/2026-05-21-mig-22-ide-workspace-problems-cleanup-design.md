# MIG-22 IDE workspace + PROBLEMS 정리 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-22-ide-workspace-problems-cleanup`
> 입력: **사용자 PROBLEMS 지적** (MIG-21 머지 후)

## 개요

PM 자율 연속 (F→I) 완료 후 사용자 지적 PROBLEMS 정리 (CRITICAL + Minor 다수).

- baseline: MIG-1~21 머지 완료
- 옵션 C 21단계 + Codex 전체 권한

## 결함 정리

### 🚨 CRITICAL: IDE workspace shared:ecount-io 인식 안 됨

- Eclipse/VS Code Java workspace 가 MIG-15 분리 후 `shared:ecount-io` module 인식 안 함
- 오류:
  - `Project 'accounting-service' is missing required Java project: 'ecount-io'`
  - `Project 'inventory-service' is missing required Java project: 'ecount-io'`
  - `Project 'partner-service' is missing required Java project: 'ecount-io'`
  - `Project 'slip-service' is missing required Java project: 'ecount-io'`
  - `EcountXlsxSupport cannot be resolved` (5 file)
  - `ExcelExporter cannot be resolved` (JournalExcelExportService)
- Gradle / CI 정상 (BUILD SUCCESSFUL) — IDE workspace 만 stale

**fix**: 
- `gradle eclipse` 또는 `./gradlew eclipse` 으로 `.project` / `.classpath` 재생성
- 또는 IDE 수동 import (Eclipse: Refresh Gradle Project / VS Code: Java: Clean Workspace)
- repo 에 `.project` / `.classpath` 위치 시 동기화

### Minor 1: tsconfig.web.json baseUrl deprecated
- `clients/desktop/tsconfig.web.json:21` `baseUrl` TypeScript 7.0 제거 예정
- **fix**: `ignoreDeprecations: "6.0"` 추가 (TS 6 호환성 유지)

### Minor 2: DynamicPermissionClient deprecated 20+ file 잔존
- SP-D5 PermissionGuard 단일화 후 deprecated 표시 됐으나 다수 service 잔존
- 영향 파일: arologis/notification/partner-order/product/user/auth 등 25+ file
- **fix**: 점진적 마이그레이션 (별 슬라이스 분리) — 본 PR 은 명시만 추가, 실 제거는 MIG-23+

### Minor 3: unused import + dead code
- 약 30+ unused import warning 분산
- VehicleTonnage TONNAGE_1_4/TONNAGE_BIG deprecated 사용 (arologis)
- **fix**: unused import 일괄 제거 (자동화 가능)

## 산출 (10~20 file, 약 100~300 LOC docs/config)

| 영역 | 변경 |
|---|---|
| `.project` / `.classpath` (4 service) | shared:ecount-io 의존성 추가 |
| `clients/desktop/tsconfig.web.json` | ignoreDeprecations 추가 |
| 다수 java file | unused import 일괄 제거 |
| dev-report + DECISIONS | D-MIG-22-01~04 |
| MIG-23+ 백로그 명시 | DynamicPermissionClient 점진 제거 |

## 결정 (D-MIG-22-XX)

- D-MIG-22-01 IDE workspace 정정 — `./gradlew eclipse` 명령으로 재생성 또는 settings.gradle 명시
- D-MIG-22-02 tsconfig ignoreDeprecations "6.0" 추가
- D-MIG-22-03 unused import 일괄 제거 (gradlew check 또는 IDE auto-fix)
- D-MIG-22-04 DynamicPermissionClient 점진 제거 MIG-23+ 백로그
- D-MIG-22-05 옵션 C 21단계 + Codex 전체 권한

🤖 PM Claude — 2026-05-21 PROBLEMS 정리
