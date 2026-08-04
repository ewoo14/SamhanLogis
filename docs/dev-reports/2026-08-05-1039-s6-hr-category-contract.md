# S6 인사 카테고리 계약 테스트 — 작업 보고

## 시작 기록

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 저장소 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `2d40b9a006f5f4c2a6ab19b6654be2f6cd9b0310`
- 범위: CI Playwright red 1건의 원인 확정, 최소 계약 테스트 갱신, 실제 권한 조합 검증

## 조사 및 결과

### 1. 계약 테스트가 읽는 파일과 비교 방식

- 대상 스펙: `clients/desktop/playwright/menu-relocate/menu-ia-contract.spec.ts`
- 대상 소스: `clients/desktop/src/renderer/components/AppLayout.tsx`
- 스펙의 `read(relPath)`가 `fs.readFileSync(path.join(repoRoot, relPath), 'utf8')`로 소스 전체를 문자열로 읽는다.
- `toMatch()` 정규식으로 `const showAdminHrGroup = ...` 선언 문자열을 정적 비교한다. 따라서 CI 원문의 `Received string: "/**`는 읽은 `AppLayout.tsx` 전체 문자열의 시작이다.

### 2. 원인 및 새 OR 식

- 시작 시 실제 생산 코드는 이미 운송사 권한을 포함했다: 
  `showAdminEmployees || showCarrierMaster || showPermissionAdmin || showPermissionDelegation || showApprovalLineConfig || showSlipCutoff`.
- 계약 스펙만 이전 식(`showAdminEmployees || showPermissionAdmin || showPermissionDelegation`)을 단언하고 있었다.
- 갱신한 계약 식은 위 6개 자식 게이트 전체를 단언한다. `admin.users`는 자식 링크 소비처가 없어 포함하지 않는다.
- 근거: `SidebarCategory show={showAdminHrGroup}`와 인사 하위 `SidebarLink`들의 `show`가 각각 직원·운송사·권한관리·결재라인·출고마감으로 연결되어 있으며, 자식이 하나도 없으면 `SidebarCategory`가 `null`을 반환한다.

### 3. 권한 조합별 실제 결과

mock Playwright에서 각 조합마다 새 문서를 기동해 hash 권한을 재주입했다. fragment-only 이동은 모듈 초기화 상태를 재사용하므로 조합 사이 `about:blank`를 거쳤다.

| 조합 | 인사 헤더 | 운송사 링크 | 실제 진입 |
|---|---:|---:|---:|
| 운송사만 (`hr.carriers`) | 보임 | 보임 | `/admin/carriers` 도달, `carrier-list-page` 보임 |
| 인사관리만 (`admin.employees`) | 보임 | 숨김 | 해당 없음 |
| 권한관리만 (`system.permission-admin`) | 보임 | 숨김 | 해당 없음 |
| 없음 (`[]`) | 숨김 | 숨김 | 해당 없음 |

### 4. 참조 전수 조사

- `rg`로 `showAdminHrGroup`, 기존 3항 OR 식, 인사 그룹 권한 목록을 전수 조사했다.
- CI 수집 계약 스펙의 동일 OR 정규식은 `menu-relocate/menu-ia-contract.spec.ts` 1건뿐이었다.
- 별도 real-QA IA 기대 목록 `menu-5category-real-qa/menu-5category-real-qa.spec.ts`도 S3 운송사 및 기존 결재라인/출고마감 page code를 포함하도록 갱신했다.
- 기존 3항 OR 정규식 잔존 0건. 생산 코드의 OR는 변경하지 않았다.

### 5. RED/GREEN 원문

#### RED-A1

수정 전 계약 스펙:

```text
Error: 인사 OR 식 = showAdminEmployees || showPermissionAdmin || showPermissionDelegation
Expected pattern: /const showAdminHrGroup\s*=\s*showAdminEmployees\s*\|\|\s*showPermissionAdmin\s*\|\|\s*showPermissionDelegation/
Received string: "/** ... AppLayout.tsx 전체 소스 ..."
1 failed
```

수정 후 영향 스펙:

```text
Running 7 tests using 1 worker
7 passed (3.3s)
```

#### RED-A2 / RED-B1

권한 조합 실제 동작 스펙:

```text
Running 3 tests using 1 worker
[3/3] ... 인사 자식 권한 조합별 헤더 가시성과 운송사 진입을 보장한다
3 passed (5.5s)
```

조합 테스트 내부에서 RED-A2(운송사만의 헤더·링크·`/admin/carriers` 진입)와 RED-B1(자식 없음 헤더 미노출)을 함께 확인했으며, 인사관리만·권한관리만도 추가로 확인했다.

### 6. CI 범위 guard 원문

각 Playwright 실행은 `$env:CI='1'`로 수행했으며 Playwright 설정의 `reuseExistingServer`가 꺼져 새 Vite 서버를 강제 기동했다. 마지막 영향 실행 뒤 guard:

```text
[guard] expected=6 unexpected=0 skipped=0 flaky=0
```

### 7. 기타 검증

- 관련 Playwright: 계약 7/7, S3 mock 3/3 통과.
- 관련 Vitest: 5 files, 21 tests 통과.
- `npm run typecheck`: exit 0.
- React Router 기존 Future Flag warning과 로컬 real-QA untracked 안내는 기존 harness 출력이며 이번 변경 실패가 아니다.
