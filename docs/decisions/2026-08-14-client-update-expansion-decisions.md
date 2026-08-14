# `#910` + `#935` 클라이언트 자동 업데이트 확대 — 개발책임자 결정 5건 (2026-08-14)

> 근거 정찰: [`docs/dev-reports/2026-08-14-910-935-recon.md`](../dev-reports/2026-08-14-910-935-recon.md) (사용자 대면 앱 9개 전수)
> 관련: `#1204`(사내 메신저 1앱 경로 개통 · 머지됨) · `#1181`(정책·관측 계약 + updater 골격)

---

## 🚩 먼저 — 이름과 실체의 차이를 정정한다

```
#1204  제목은 "#910+#935" 였으나 실제로는 사내 메신저 Electron 1앱만
       자체서명 feed · 설치 · 재기동까지 검증했다
       실측  git show --stat 675c2c4de → clients/internal-chat-desktop (유일)
       ⟹ #935(아로로지스 데스크톱)는 손대지 않았다

#1181  "클라이언트 자동 업데이트 9앱" 으로 머지됐으나 실체는
       9앱 정책·오류 관측 계약 + 사내 메신저 updater 골격이다
       ⟹ 9앱 운영 자동 업데이트를 완성한 것이 아니다
```

🔑 **두 이슈가 열려 있는 이유가 이것이다.** 앞으로 핸드오프에 *"9앱 자동 업데이트 완료"* 로 쓰지 마라.

---

## 결정 요약

| # | 주제 | 결정 |
|---|---|---|
| **1** | 배포 채널 | **제품별 URL prefix + 동일 `latest`** |
| **2** | 모바일 업데이트 | **EAS Update OTA + 사용자 동의** |
| **3** | 인증서 배포 범위 | **Electron 3앱 공통 인증서 1개** |
| **4** | 사용 중 확인 주기 | **30분 + jitter ±20%** |
| **5** | 웹 릴리스 wrapper | **웹 3앱 모두 신설** |

---

## 결정 1 — 배포 채널: **제품별 URL prefix + 동일 `latest`**

```
/desktop/latest.yml
/arologis/latest.yml
/internal-chat/latest.yml
beta 는 별도 prefix 로 추가
```

현재 세 builder 구조와 가장 가깝다. 공유 URL + 제품별 channel 이름 방식은 manifest 이름과 updater channel 설정을 더 많이 바꿔야 하고 **운영자가 잘못 publish 할 위험**이 있어 택하지 않았다.

⏳ **파생 미결** — beta 대상자를 *별도 설치본*으로 둘지 *동일 앱의 설정 전환*으로 둘지.

## 결정 2 — 모바일: **EAS Update OTA + 사용자 동의**

```
JS 변경     EAS Update OTA + 사용자 동의 후 reload
native 변경  store / internal build
```

현재 코드와 `runtimeVersion: appVersion` 을 살린다.

🚨 **즉시 `reloadAsync()` 는 그대로 두면 안 된다.** dirty 보호와 명시 동의를 **OTA 활성화와 같은 슬라이스에서** 넣는다. 저장되지 않은 입력을 조용히 잃게 하는 것이 이 프로젝트에서 가장 나쁜 실패다.

⏳ **선행 필요** — EAS project 소유 계정·비용 정책 확정.

## 결정 3 — 인증서: **Electron 3앱 공통 인증서 1개**

```
동일 publisher 로 통일 · CurrentUser Root 에 전 사내 PC 배포
🔑 PC당 1회 설치로 끝나고, 앱이 늘어도 비용이 안 늘어난다
🔑 CurrentUser Root 라 관리자 권한이 필요 없다 (원격에서도 가능)
```

🔴 **현재 인증서 2개는 `CN=Samhan Internal Release` 로 삼한·아로로지스 publisher 와 불일치한다.** 이 결정에 맞춰 **publisher 를 정합시키는 것이 이 트랙의 선행 작업**이다.

⏳ **운영 세부 확정 필요** — 정본 thumbprint · 발급/보관 책임자 · `.cer` 배포 수단 · inventory · 만료 전 roll-over 기간 · 폐기 인증서 제거 기준.

## 결정 4 — 사용 중 확인: **30분 + jitter ±20%**

```
기본 주기        30분
설치별 jitter    ±20%          ← 9앱이 동시에 서버를 때리지 않게
foreground 복귀  최소 10분 경과했으면 확인
```

현재 **0/9** 앱이 기동·최초 mount 때만 확인한다. 단주기(5~10분)는 9앱 동시 요청 부하가 크고, 서버 push 는 새 인프라가 필요해 범위를 크게 늘린다.

## 결정 5 — 웹 릴리스 wrapper: **웹 3앱 모두 신설**

명시 버전 wrapper 로 Electron 과 **같은 fail-closed 운영 계약**을 갖는다. 현 resolver 만 유지하면 일반 `npm run build` 와 릴리스 산출물의 구분이 약하다.

---

## 착수 순서 (정찰 제안 + 결정 반영)

```
1  Electron 공통 운영 계약 + 인증서 publisher 정합   ← 결정 1·3
2  아로로지스 데스크톱                                ← #935
3  삼한 데스크톱
4  웹 3앱                                            ← 결정 5
5  Expo 3앱                                          ← 결정 2 · EAS project 주입 선행
```

## 🔒 착수 시 보존할 불변식 (정찰 §11)

```
1  한 앱의 릴리스가 다른 앱의 정책이나 feed 를 오염시키지 않는다
2  사용 중 자동 install/reload/새로고침이 저장되지 않은 입력을 조용히 잃게 하지 않는다
3  버전 정책·feed 실패가 앱 사용을 무조건 차단하지 않되 사용자에게는 드러난다
   (CRITICAL 정책만 차단)
4  내부 오류 코드·경로·UUID 를 사용자 화면에 노출하지 않는다
5  모든 Electron 릴리스는 서명 없이는 빌드 실패하고, signer 와 배포된 신뢰 루트가 일치한다
6  하네스 성공은 실제 updater 경로·실제 installer·실제 재기동·cleanup 성공을 포함한다
7  9개 앱은 각각의 실행 환경에서 별도로 검증한다
```

## ⏳ 남은 파생 결정

```
① beta 대상자 — 별도 설치본인가 동일 앱 설정 전환인가
② EAS project 소유 계정과 비용 정책
③ 인증서 운영 세부 — thumbprint · 책임자 · 배포 수단 · roll-over 기간
```
