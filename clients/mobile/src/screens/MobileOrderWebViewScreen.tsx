/**
 * MobileOrderWebViewScreen v4 — Mobile v4 의 단일 메인 screen (회고 #2 정정).
 *
 * 회고 #2 (2026-05-05) — 사용자 명시:
 *   "종합견적서 모바일용 앱은 구글 스크립트를 거의 그대로 계승한 것으로 보이나, 주문서는 여전히 구글 스크립트
 *    모바일 버전의 UI와 처음 모바일 게이트를 제외한 나머지는 모두 다름을 확인."
 *
 * 정정 결정 (mobile-staff v3 의 `EstimateWebViewScreen` 패턴 1:1 적용):
 *   - 이전 v4 = `RootNavigator + AuthStack(BizGate/TempPassword/Register) + BottomTab(Home/Order/Notif/Profile)
 *     + HomeScreen(4 카테고리 + extra-menu 5개) + LegacyOrderWebViewScreen(WebView with header)` 7+ screen 구조
 *     → legacy 의 BizGate / 모바일 게이트 / 페이지 메뉴 drawer / 4 카테고리 / 임시저장 / 확정 모두 WebView 안
 *     legacy 가 자체 처리함에도 RN 측이 별도 noise (HomeScreen + extra-menu) 추가.
 *   - 신규 v4 = `SafeAreaProvider + StatusBar + 단일 MobileOrderWebViewScreen`. 모든 native screen + navigation
 *     + store + api + token + theme 폐기.
 *
 * 설계 원칙:
 *   - 단일 screen = react-native-webview 가 order-legacy v4 (Node + Express + EJS) 임베드.
 *   - RN wrapper = SafeAreaView + WebView + Android hardware back 만.
 *   - 인증 = WebView 안 legacy `tryLogin` (Apps Script 1:1) 가 cookie 로 처리.
 *   - shim = X-Samhan-Partner header 첨부 (default 무인증, mobile-staff v3 패턴 보존).
 *
 * 모바일 분기 자동 활성:
 *   - order-legacy v4 의 views/index.ejs `@media max-width:1280px` + `body.mobile-mode` 가
 *     react-native-webview 의 device width (iPhone/Galaxy 모두 < 1280) 에서 자동 활성.
 *   - 모바일 게이트 4 카테고리 (홈멀티/싱글중대형/상업멀티/구형) + 페이지 메뉴 drawer (▼) +
 *     과거 발송내역 + 자동 로그아웃 timer 가 모두 legacy 에서 표시.
 *
 * Android hardware 뒤로가기:
 *   - WebView 의 navigation history (canGoBack) 가 있으면 webview.goBack() 우선.
 *   - history 끝이면 default (앱 종료) 흐름.
 *
 * UUID 미노출:
 *   - MobileOrderWebViewScreen 자체에서 UUID 노출 없음.
 *   - order-legacy v4 의 EJS 가 사업자번호/거래처코드/모델명 만 표시.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildOrderShim } from '../webview/legacyOrderShim';
import { getOrderAppUrl } from '../webview/legacyOrderSource';
import { setOtaActivity } from '../version/otaUpdates';

/**
 * legacy order 의 isMobileNow() trigger 보조 — userAgent 에 'samhan-mobile' 마커 추가.
 * 결정적 분기는 `(max-width: 1280px)` matchMedia 이지만, UA 마커는 server-side 인지 보조용.
 */
const MOBILE_USER_AGENT_SUFFIX = ' SamhanMobileApp/0.5.0 (samhan-mobile-v4-webview)';

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

export default function MobileOrderWebViewScreen(): JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const url = getOrderAppUrl();
  const injectedJavaScript = buildOrderShim();
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
        console.warn(`[Order WebView v4] ${msg.type}`, msg.payload);
      }
      if (msg.type === 'ota-activity') {
        setOtaActivity(Boolean(msg.payload?.active));
      }
      // legacy 의 google.script.host.close() 호출 시 — v4 단일 screen 이므로 무시 (또는 reload).
    } catch (_e) {
      // swallow — 메시지 파싱 실패는 무시 (legacy 가 임의 postMessage 가능).
    }
  }, []);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      if (isAllowedWebViewNavigation(request.url, url)) return true;
      Linking.openURL(request.url).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[Order WebView v4] 외부 링크 열기 실패', err);
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
        testID="order-webview"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
