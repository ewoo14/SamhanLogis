# #1131 머지 후 V119 실서버 검증

> 머지 `4eda57a6b` · 검증 2026-08-11 · 집PC 공유 스택

## 왜 이 확인이 필요했나

SOL R17 이 **"이 라운드가 보지 않은 표면"** 첫 줄로 `배포 후 V119/백엔드 실동작` 을 명시했다.
그리고 이 저장소는 *"고쳤다"와 "동작한다"가 다른* 전례가 있다(`#993` — 로컬 테스트는 통과했으나
env 리터럴 탓에 실제로는 동작하지 않았다).

## 순서

```text
머지 → 배포 → 확인
🔑 미머지 마이그레이션을 공유 DB 에 올리지 않는 순서를 이 세션 내내 지켰다.
   한 번 어겼다가(#1132 의 V36·V37) 닫았고, 그 뒤로는 지켰다.
```

## 실측

```text
samhan-slip-service                     Up (healthy)

slip_db flyway_schema_history
  119 | materialize r9 keyless bundle instances | success=true
  118 | create slip closed date policy          | success=true

전표 2026/08/07-20
  라인 12 · 그중 **instanceKey 보유 8**
  ⟹ V119 가 대상으로 삼은 정확히 그 8행에 명시적 키가 부여됐다
```

## 남은 표면 (SOL 명시분 중 미확인)

```text
공유 DB write E2E · Electron native shell · 모바일 viewport ·
동시 편집 경쟁 · 실제 사용자 인지 조사
```
