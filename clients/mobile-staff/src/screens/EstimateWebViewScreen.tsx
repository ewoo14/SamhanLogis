/**
 * EstimateWebViewScreen v2 — mobile-staff v2 의 단일 메인 screen.
 *
 * 사용자 명시 (PR #63 회고, DECISIONS Phase 6 §, commit `ad313ed`):
 *   "앱 버전에서도 현재 견적서의 모바일 뷰를 그대로 사용하는 방안으로 진행".
 *
 * 설계 원칙:
 *   - v1 의 StaffLogin / Home / Profile native screen + BottomTab Navigator 전부 폐기.
 *   - 단일 screen = react-native-webview 가 estimate-app v2 (Node + Express + EJS) 임베드.
 *   - RN wrapper = SafeAreaView + WebView + 뒤로가기 button (hardware back 지원) only.
 *   - 인증 = WebView 안 legacy estimate `checkUserAuth(USER_EMAIL)` (Apps Script Code.js line 8726 1:1).
 *   - shim = X-Samhan-Staff header (Mobile v5 패턴 보존, v2 default 무인증).
 *
 * 모바일 분기 자동 활성:
 *   - estimate-app v2 의 views/index.ejs `@media max-width:1280px` + `body.mobile-mode` 가
 *     react-native-webview 의 device width (iPhone/Galaxy 모두 < 1280) 에서 자동 활성.
 *   - 4 카드 grid (홈멀티/싱글중대형/상업멀티/구형) 가 1열 stack 으로 자동 변환.
 *
 * Android hardware 뒤로가기:
 *   - WebView 의 navigation history (canGoBack) 가 있으면 webview.goBack() 우선.
 *   - history 끝이면 default (앱 종료) 흐름.
 *
 * UUID 미노출:
 *   - EstimateWebViewScreen 자체에서 UUID 노출 없음.
 *   - estimate-app v2 의 EJS 가 사업자번호/거래처코드/모델명 만 표시.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildShim } from '../webview/legacyEstimateShim';
import { getEstimateAppUrl } from '../webview/legacyEstimateSource';
import { setOtaActivity } from '../version/otaUpdates';

/**
 * legacy estimate 의 isMobileNow() trigger 보조 — userAgent 에 'samhan-staff' 마커 추가.
 * 결정적 분기는 `(max-width: 1280px)` matchMedia 이지만, UA 마커는 server-side 인지 보조용.
 */
const MOBILE_USER_AGENT_SUFFIX = ' SamhanStaffApp/0.2.0 (samhan-staff-v2-webview)';

function getOrigin(uri: string): string | null {
  try {
    return new URL(uri).origin;
  } catch (_e) {
    return null;
  }
}

function isAllowedWebViewNavigation(requestUrl: string, appUrl: string): boolean {
  if (requestUrl === 'about:blank') return true;
  const appOrigin = getOrigin(appUrl);
  const requestOrigin = getOrigin(requestUrl);
  return Boolean(appOrigin && requestOrigin && appOrigin === requestOrigin);
}

export default function EstimateWebViewScreen(): JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const url = getEstimateAppUrl();
  const injectedJavaScript = buildShim();
  const allowedOrigin = getOrigin(url);

  useEffect(() => () => setOtaActivity(false), []);

  // -------- Android hardware 뒤로가기 — WebView history 우선 --------
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // event consumed — 앱 종료 막음
      }
      return false; // history 끝 → default (앱 종료)
    });
    return () => sub.remove();
  }, [canGoBack]);

  const handleNavStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  const handleMessage = useCallback((evt: WebViewMessageEvent) => {
    // dev 가시성 — production 은 silent (log-service push 가 후속에 추가 가능).
    try {
      const raw = evt.nativeEvent.data;
      const msg = JSON.parse(raw) as { type: string; payload?: Record<string, unknown> };
      if (msg.type === 'rpc-error' || msg.type === 'rpc-missing') {
        // eslint-disable-next-line no-console
        console.warn(`[Estimate WebView v2] ${msg.type}`, msg.payload);
      }
      if (msg.type === 'ota-activity') setOtaActivity(Boolean(msg.payload?.active));
      // legacy 의 google.script.host.close() 호출 시 — v2 단일 screen 이므로 무시 (또는 reload).
    } catch (_e) {
      // swallow — 메시지 파싱 실패는 무시 (legacy 가 임의 postMessage 가능).
    }
  }, []);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      if (isAllowedWebViewNavigation(request.url, url)) return true;
      Linking.openURL(request.url).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[Estimate WebView v2] 외부 링크 열기 실패', err);
      });
      return false;
    },
    [url],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        originWhitelist={allowedOrigin ? [allowedOrigin] : []}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        applicationNameForUserAgent={MOBILE_USER_AGENT_SUFFIX}
        // shim 은 contentLoaded 이전 주입 — fetch monkey-patch 첫 호출 보호.
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        startInLoadingState
        style={styles.webview}
        testID="estimate-webview"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
