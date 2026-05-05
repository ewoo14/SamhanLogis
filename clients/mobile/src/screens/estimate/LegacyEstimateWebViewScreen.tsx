/**
 * LegacyEstimateWebViewScreen v5 — react-native-webview 로 estimate-app v2 임베드.
 *
 * DECISIONS Phase 6 v4 후속 정정 § (commit 1bb2c8e + estimate-app v2 머지 후 정정):
 *   - 사용자 명시: "기존 레거시 코드에는 견적서와 주문서 모두 모바일 버전이 있으므로
 *     이를 참고하여 그대로 구현 / 앱버전으로도 제작 요청"
 *   - 견적 RN screen = `<WebView>` 가 estimate-app v2 (Node + Express + EJS, port 5183) 로드.
 *   - estimate-app v2 의 views/index.ejs 자체가 legacy estimate index.html 18614 라인 1:1 보존
 *     → 모바일 분기 (@media + body.mobile-mode + .mobile-only) 자동 활성.
 *
 * 모바일 분기 자동화 (코드 변경 0):
 *   - line 162  : `body.mobile-mode .grid { grid-template-columns: minmax(0,1fr) !important }`
 *   - line 530  : `.mobile-only { display: none; }`  (기본 desktop 숨김)
 *   - line 533  : `@media (max-width: 1280px) { ... .mobile-only { display: table-cell !important } }`
 *   - line 7157 : `const mqMobile = window.matchMedia('(max-width: 1280px)')`
 *   - line 7159 : `function isMobileNow(){ return mqMobile.matches; }`
 *   - line 7187 : `document.body.classList.toggle('mobile-mode', isMobile)`
 *   → react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) → mobile-mode 자동.
 *
 * Bridge 설계 (Mobile v4 의 LegacyOrderWebViewScreen 패턴 1:1):
 *   - shimScript (legacyEstimateShim.ts) → `injectedJavaScriptBeforeContentLoaded` 로 사전 주입.
 *   - shim 이 estimate-app v2 의 inline `google.script.run` shim 의 fetch 콜에 Authorization Bearer 추가.
 *   - BizGate native 인증 token → `setEstimateAuthScript({...})` injectJavaScript 로 WebView 에 전달.
 *   - WebView → RN 메시지 (`postMessage`) — log / rpc-error / shim-installed / legacy-loaded.
 *
 * UUID 미노출:
 *   - estimate-app v2 의 EJS 자체가 사업자번호/거래처코드/모델명 만 노출 (UUID X).
 *   - userEmail (BizGate 통과 시 회사 이메일) 만 query parameter 로 전달.
 */

import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight } from '@/tokens/tokens';
import { getInjectedEstimateShim, setEstimateAuthScript } from '@/webview/legacyEstimateShim';
import { getLegacyEstimateUri } from '@/webview/legacyEstimateSource';

const API_BASE_URL =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (globalThis as any).__DEV__ !== 'undefined' && (globalThis as any).__DEV__
    ? 'http://localhost:8080'
    : 'https://api.samhan-air.com';

/**
 * legacy estimate isMobileNow() trigger — userAgent 에 'samhan-mobile' 마커 추가.
 * 결정적 분기는 `(max-width: 1280px)` matchMedia 이지만, UA 마커는 server-side 인지 보조용.
 */
const MOBILE_USER_AGENT_SUFFIX = ' SamhanMobileApp/0.4.0 (samhan-mobile)';

export function LegacyEstimateWebViewScreen(): JSX.Element {
  const nav = useNavigation();
  const token = useAuthStore((s) => s.token);
  const partnerCode = useAuthStore((s) => s.partnerCode);
  const partnerName = useAuthStore((s) => s.partnerName);

  const webViewRef = useRef<WebView>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shimReady, setShimReady] = useState(false);
  const [mobileModeActive, setMobileModeActive] = useState<boolean | null>(null);

  // BizGate 의 partnerCode 를 estimate-app v2 의 ?email 자리로 전달 (estimate-app 는
  // userEmail 식별자로 권한/이력 조회). 운영 시 실 이메일로 교체.
  const userEmailHint = partnerCode ? `${partnerCode}@samhan-air.com` : undefined;
  const initialUri = getLegacyEstimateUri({ userEmail: userEmailHint });
  const shimScript = getInjectedEstimateShim({
    apiBaseUrl: API_BASE_URL,
    token,
    partnerCode,
    userEmail: userEmailHint ?? null,
  });

  // RN → WebView token 갱신 — auth 변경 시 동기화 (logout / 재로그인).
  useEffect(() => {
    if (!shimReady || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(
      setEstimateAuthScript({
        apiBaseUrl: API_BASE_URL,
        token,
        partnerCode,
        userEmail: userEmailHint ?? null,
      }),
    );
  }, [shimReady, token, partnerCode, userEmailHint]);

  const handleMessage = useCallback((evt: WebViewMessageEvent) => {
    try {
      const raw = evt.nativeEvent.data;
      const msg = JSON.parse(raw) as { type: string; payload: { mobileMode?: boolean } & Record<string, unknown> };
      if (msg.type === 'shim-installed') {
        setShimReady(true);
      } else if (msg.type === 'legacy-loaded') {
        setLoading(false);
        if (typeof msg.payload?.mobileMode === 'boolean') {
          setMobileModeActive(msg.payload.mobileMode);
        }
      } else if (msg.type === 'rpc-error') {
        // dev 가시성 — production 은 silent (log-service 로 별도 push 가능).
        // eslint-disable-next-line no-console
        console.warn('[Legacy Estimate] RPC error', msg.payload);
      } else if (msg.type === 'rpc-missing') {
        // eslint-disable-next-line no-console
        console.warn('[Legacy Estimate] RPC missing — check ESTIMATE_RPC_INVENTORY', msg.payload);
      } else if (msg.type === 'host-close') {
        // legacy estimate 도 google.script.host.close() 호출 가능 — BottomTab 으로 복귀.
        nav.goBack();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Legacy Estimate] message parse failed', e);
    }
  }, [nav]);

  const handleNavStateChange = useCallback((state: WebViewNavigation) => {
    if (!state.loading && state.url) setLoading(false);
  }, []);

  const handleError = useCallback((evt: { nativeEvent: { description?: string } }) => {
    const desc = evt?.nativeEvent?.description ?? '알 수 없는 오류';
    setLoadError(desc);
    setLoading(false);
  }, []);

  const handleReload = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setShimReady(false);
    setMobileModeActive(null);
    webViewRef.current?.reload();
  }, []);

  const handleHelp = useCallback(() => {
    Alert.alert(
      '견적서 (legacy)',
      [
        '본 화면은 estimate-app v2 (Node + Express + EJS) 를 임베드합니다.',
        `URL: ${initialUri}`,
        partnerName ? `거래처: ${partnerName} (${partnerCode ?? '-'})` : '',
        mobileModeActive === null ? '' : `mobile-mode: ${mobileModeActive ? '활성' : '비활성'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }, [initialUri, partnerName, partnerCode, mobileModeActive]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerBar} testID="legacy-estimate-header">
        <Text style={styles.headerTitle}>견적서 (legacy)</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerBtn} onPress={handleReload} testID="legacy-estimate-reload">
            <Text style={styles.headerBtnLabel}>새로고침</Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={handleHelp} testID="legacy-estimate-help">
            <Text style={styles.headerBtnLabel}>?</Text>
          </Pressable>
        </View>
      </View>

      {loadError ? (
        <View style={styles.errorBox} testID="legacy-estimate-error">
          <Text style={styles.errorTitle}>견적서 (legacy) 화면 로드 실패</Text>
          <Text style={styles.errorDesc}>{loadError}</Text>
          <Text style={styles.errorHint}>
            URL: {initialUri}
            {'\n'}
            estimate.samhan-air.com 호스팅 또는 dev (localhost:5183) 가 켜져 있는지 확인하세요.
          </Text>
          <Pressable style={styles.retryBtn} onPress={handleReload}>
            <Text style={styles.retryBtnLabel}>재시도</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webviewWrap}>
          <WebView
            ref={webViewRef}
            source={{ uri: initialUri }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            applicationNameForUserAgent={MOBILE_USER_AGENT_SUFFIX}
            // shim 은 contentLoaded 이전 주입 — fetch monkey-patch 첫 호출 보호.
            injectedJavaScriptBeforeContentLoaded={shimScript}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavStateChange}
            onError={handleError}
            onHttpError={handleError}
            renderLoading={() => (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.brand500} />
              </View>
            )}
            startInLoadingState
            style={styles.webview}
            testID="legacy-estimate-webview"
          />
          {loading && !loadError ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.brand500} />
              <Text style={styles.loadingText}>legacy 견적서 로드 중…</Text>
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.neutral0 },
  headerBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.neutral0,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.neutral100,
  },
  headerBtnLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semibold },

  webviewWrap: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#ffffff' },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    gap: 12,
  },
  loadingText: { color: colors.textMuted, fontSize: fontSize.sm },

  errorBox: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
  },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#991B1B' },
  errorDesc: { fontSize: fontSize.sm, color: '#991B1B', textAlign: 'center' },
  errorHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.brand500,
  },
  retryBtnLabel: { color: colors.neutral0, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
});
