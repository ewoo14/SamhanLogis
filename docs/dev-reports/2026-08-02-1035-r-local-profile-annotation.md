# PR #1048 / 이슈 #1035 — `local` 창고 UUID 대체값 주석 보강

## 수정 대상

`services/slip-service/src/main/resources/application.yml`의 `local` 프로파일 전용
`app.publish.warehouse-code-map` 블록에 설명 주석만 추가했다.

## ① 수정 전/후 원문

### 수정 전

```yaml
# 로컬 개발은 운영 환경변수 없이도 기동할 수 있도록 테스트용 고정 UUID를 사용한다.
# 운영 문서의 env 필수 매핑은 이 프로파일에서만 같은 키로 덮어쓴다.
app:
  publish:
    warehouse-code-map:
      "[00003]": 11111111-1111-1111-1111-000000000001
      "[2]":     11111111-1111-1111-1111-000000000002
      "[14]":    11111111-1111-1111-1111-000000000003
      "[1]":     11111111-1111-1111-1111-000000000004
```

### 수정 후

```yaml
# 로컬 개발은 운영 환경변수 없이도 기동할 수 있도록 테스트용 고정 UUID를 사용한다.
# 운영 문서의 env 필수 매핑은 이 프로파일에서만 같은 키로 덮어쓴다.
# 아래 매핑은 dev 시드에 후발·안성·창원 창고가 아직 없어 사용하는 실 창고 아닌 대체값이다.
# UUID 자체는 dev 시드에 존재하지만 라이브 QA 기준 [2]=VH-001 1호차 차량재고,
# [14]=CS-001 거래처 위탁창고, [1]=VR-001 가상창고를 가리켜 키 이름의 의미와 일치하지 않는다.
# 이 값을 실 운영값으로 복사하지 말고, 실환경에서는 위 프로파일의 WAREHOUSE_UUID_* 환경변수에
# 실제 inventory_db.warehouses UUID를 주입한다.
app:
  publish:
    warehouse-code-map:
      "[00003]": 11111111-1111-1111-1111-000000000001
      "[2]":     11111111-1111-1111-1111-000000000002
      "[14]":    11111111-1111-1111-1111-000000000003
      "[1]":     11111111-1111-1111-1111-000000000004
```

## ② 런타임 무영향 근거

- 변경은 `local` 프로파일의 기존 매핑 앞에 추가한 YAML 주석뿐이다.
- `app.publish.warehouse-code-map`의 키와 UUID 4건은 수정 전후 동일하다.
- 따라서 기동 검증 로직, 프로파일 해석, Spring 주입 값, warehouse-code 매핑 결과에는 변화가 없다.
- `local` 프로파일 외의 문서 구간은 수정하지 않았다. 실환경은 기존과 동일하게
  `WAREHOUSE_UUID_*` 환경변수로 실제 `inventory_db.warehouses` UUID를 주입한다.

## 검증

### YAML 파싱

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:processResources --no-daemon
```

실제 출력:

```text
> Task :services:slip-service:processResources

BUILD SUCCESSFUL in 9s
1 actionable task: 1 executed
```

### slip-service 정상 기동

Docker 이미지 재빌드는 하지 않았다. standalone 실행 명령:

```powershell
.\gradlew.bat :services:slip-service:bootRun --args="--spring.profiles.active=local --server.port=18386" --no-daemon --console=plain
```

실제 출력(기동 확인 후 검증 프로세스 종료):

```text
The following 1 profile is active: "local"
Tomcat initialized with port 18386 (http)
warehouse-code-map 로드: 4 entries
Tomcat started on port 18386 (http) with context path '/'
```

검증용 프로세스는 확인 직후 종료했으며, Docker 이미지에는 접근하지 않았다.

## `git diff --numstat` 실측

실행 명령:

```powershell
git diff --numstat -- services/slip-service/src/main/resources/application.yml
```

실제 출력:

```text
5	0	services/slip-service/src/main/resources/application.yml
```

추가분: **5줄**

삭제분: **0줄**

보고서 파일은 새 untracked 파일이므로 위 경로 제한 명령의 출력에는 포함하지 않는다.
