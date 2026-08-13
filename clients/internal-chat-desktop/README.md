# Samhan Internal Chat Desktop

S2 앱 셸입니다. 본체(`clients/desktop`)와 독립 실행되며, 창을 닫으면 트레이에 상주합니다.

현재 범위에는 로그인 연계, 접속 상태, 부재중, 알림, 파일 전송, 참조번호, 이모티콘, 채팅 서버 API와 DB가 포함되지 않습니다. 공개 `/app/version` 정책 조회와 generic feed 자동 업데이트는 삼한 데스크톱·아로로지스 데스크톱과 같은 Electron 경로로 연결되어 있습니다.

## 확인

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Windows installer/portable 릴리스는 명시적인 `VITE_APP_VERSION=YYYY/MM/DD-N`, 사내 `INTERNAL_CHAT_UPDATE_URL`, 자체서명 PFX의 `CSC_LINK`·`CSC_KEY_PASSWORD`를 주입해 `npm run build:win`을 실행합니다. `forceCodeSigning: true`이므로 서명 입력이 없으면 릴리스 산출물을 만들지 않습니다.

> **운영 선행조건 — 인증서 신뢰 루트 배포 필수**
>
> 자체서명 인증서의 발급자 루트를 사내 Windows PC의 신뢰할 수 있는 루트 인증 기관에 배포해야 합니다. `electron-updater`는 신뢰 루트가 없으면 `Get-AuthenticodeSignature` 결과가 `UnknownError`가 되어 `ERR_UPDATER_INVALID_SIGNATURE`로 설치를 거부합니다. 이 경우 main 프로세스의 상세 오류는 로그에만 남고 renderer에는 인증서 배포를 요청하는 안전한 안내가 표시됩니다. 신뢰 루트 배포가 없으면 자동 설치는 전부 막힙니다.
