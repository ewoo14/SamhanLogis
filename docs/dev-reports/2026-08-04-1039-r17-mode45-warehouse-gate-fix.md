# R17 모드 4·5 출고창고 게이트 정합성 조사 보고서

## 조사 시작 기록

- 워크트리: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 조사 시작 HEAD: `0fb4eac51c2f733cd23af7cc3900f1462383ebe0`
- 범위: `arologis-service` 백엔드의 pre-classify 모드 4·5 판정 및 응답 표시 계약
- 금지 범위: `clients/**` 수정, Docker 조작, 전체 Gradle 스위트, git add/commit/push

### 확인 1 — 워크트리·HEAD

명령:

```text
git -C . rev-parse --show-toplevel
git -C . rev-parse --abbrev-ref HEAD
git -C . rev-parse HEAD
git -C . status --short
```

출력:

```text
C:/dev/Samhan-Public/.claude/worktrees/t1039
feat/1039-provisional-dispatch
0fb4eac51c2f733cd23af7cc3900f1462383ebe0
```

### 확인 2 — 레거시 원문 재확인 결과

명령:

```text
rg -n -C 4 "function yajeok_only|function region_only|lastIndexOf\('야적'|lastIndexOf\('지방'|출고창고|skip_warehouse_filter" tools/legacy-gas/가배차분류리스트/Code.js
```

출력 원문:

```text
tools/legacy-gas/가배차분류리스트/Code.js:439:function yajeok_only(rows, day) {
tools/legacy-gas/가배차분류리스트/Code.js:444:    var y = extract_yajek_item(raw, r); if (!y) { counters.skip++; return; }
tools/legacy-gas/가배차분류리스트/Code.js:445:    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
tools/legacy-gas/가배차분류리스트/Code.js:452:function region_only(rows, day) {
tools/legacy-gas/가배차분류리스트/Code.js:456:    if (String(raw).lastIndexOf('야적',0) === 0) { counters.skip++; counters.yajeok++; return; }
tools/legacy-gas/가배차분류리스트/Code.js:458:    if (String(raw).lastIndexOf('지방',0) !== 0) { counters.skip++; return; }
tools/legacy-gas/가배차분류리스트/Code.js:461:    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
```

판정:

- 모드 4는 `extract_yajek_item` 통과 후 `출고창고`가 상일 또는 초월인지 검사한다.
- 모드 5는 주소의 야적 prefix와 지방 prefix를 먼저 판정하지만, 이후 `출고창고`가 상일 또는 초월인지 검사한다.
- 따라서 "모드 4·5는 출고창고를 보지 않는다"는 대조는 이 워크트리의 레거시 원문과 불일치한다.
- 사용자 지정 중단 조건에 따라 RED 테스트, 구현 변경, 영향 테스트는 수행하지 않는다.
