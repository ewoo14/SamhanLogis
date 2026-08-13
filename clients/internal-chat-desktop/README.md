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

Windows installer/portable 빌드는 명시적인 `VITE_APP_VERSION=YYYY/MM/DD-N`과 `INTERNAL_CHAT_UPDATE_URL`을 함께 주입해 `npm run build:win`을 실행합니다. 코드서명 설정은 기존 S2 범위를 유지하며 별도 결정 대상입니다.
