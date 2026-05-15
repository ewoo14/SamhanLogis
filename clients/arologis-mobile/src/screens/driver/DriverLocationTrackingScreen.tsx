/**
 * DriverLocationTrackingScreen — Phase 10 W10-3 신규.
 *
 * GPS foreground 추적 + 30초 간격 POST `/driver-app/arologis/locations`.
 *
 * 사용자 결정 4 GPS 하이브리드 (2026-05-07):
 *   - foreground 권한 = 의무 (배송 도중 위치 추적)
 *   - background 권한 = 선택 (운영 시점 결정)
 *   - 거부 fallback = 어플 사용 불가 (차단 화면 표시)
 *
 * 본 PR (W10-3) 시점:
 *   - 본 어플 GPS 만 활성 — source = APP_GPS_ACTIVE.
 *   - 인성 LBS 통합 = W10-2 시점 별도 endpoint 활성.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { reportLocation } from '../../api/arologis';
import { getCurrentPositionAsync } from '../../hooks/useGpsPermission';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

const REPORT_INTERVAL_MS = 30_000;

interface Props {
  /** JWT access token — `/driver-app/arologis/locations` 호출 시 Authorization Bearer header. */
  token: string | null;
  /** background 권한 OK 여부 — 운영 시점 활성화 토글 (사용자 결정 4 GPS 하이브리드). */
  backgroundGranted: boolean;
}

interface LastReport {
  latitude: number;
  longitude: number;
  capturedAt: string;
  source: 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND';
  ok: boolean;
  error?: string;
}

export default function DriverLocationTrackingScreen({ token, backgroundGranted }: Props): ReactElement {
  const [tracking, setTracking] = useState(false);
  const [lastReport, setLastReport] = useState<LastReport | null>(null);
  const [reportCount, setReportCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reportOnce = async (source: 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND') => {
    try {
      const pos = await getCurrentPositionAsync();
      await reportLocation(token, {
        latitude: pos.latitude,
        longitude: pos.longitude,
        capturedAt: pos.capturedAt,
        source,
      });
      setLastReport({
        latitude: pos.latitude,
        longitude: pos.longitude,
        capturedAt: pos.capturedAt,
        source,
        ok: true,
      });
      setReportCount((c) => c + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastReport({
        latitude: 0,
        longitude: 0,
        capturedAt: new Date().toISOString(),
        source,
        ok: false,
        error: msg,
      });
    }
  };

  const start = () => {
    if (tracking) return;
    // FE-1 채택 fix (W10-3 종합 TM) — race 가드. React strict mode double-invoke 또는 빠른 토글
    // (start → stop → start) 시 timerRef 가 leak 되어 중복 setInterval 이 등록되는 회귀 차단.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTracking(true);
    // 즉시 1회 + 30초 주기.
    reportOnce('APP_GPS_ACTIVE');
    timerRef.current = setInterval(() => {
      reportOnce('APP_GPS_ACTIVE');
    }, REPORT_INTERVAL_MS);
  };

  const stop = () => {
    setTracking(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>GPS 위치 추적</Text>
        <Text style={styles.subtitle}>
          30초 간격 본 어플 GPS 위치를 arologis-service 에 보고합니다.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>foreground 추적</Text>
            <Switch
              value={tracking}
              onValueChange={(v) => {
                if (v) {
                  Alert.alert('GPS 추적 시작', '30초 간격 위치 보고를 시작합니다.', [
                    { text: '취소', style: 'cancel', onPress: () => setTracking(false) },
                    { text: '시작', onPress: start },
                  ]);
                } else {
                  stop();
                }
              }}
              trackColor={{ true: colors.action.brand, false: colors.line.default }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>background 권한</Text>
            <Text style={badgeStyle(backgroundGranted ? 'sliceSuccess' : 'sliceDeferred')}>
              {backgroundGranted ? '허용' : '미허용 (선택)'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>보고 source</Text>
            <Text style={badgeStyle('channelPush')}>APP_GPS_ACTIVE</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>보고 횟수</Text>
            <Text style={styles.value}>{reportCount} 회</Text>
          </View>
        </View>

        {lastReport && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>최근 보고</Text>
            <View style={styles.row}>
              <Text style={styles.label}>위도</Text>
              <Text style={styles.valueMono}>{lastReport.latitude.toFixed(7)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>경도</Text>
              <Text style={styles.valueMono}>{lastReport.longitude.toFixed(7)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>캡처 시각</Text>
              <Text style={styles.valueMono}>{lastReport.capturedAt}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>결과</Text>
              <Text style={badgeStyle(lastReport.ok ? 'ok' : 'warn')}>
                {lastReport.ok ? '성공' : '실패'}
              </Text>
            </View>
            {!lastReport.ok && lastReport.error && (
              <Text style={styles.errorMessage}>{lastReport.error}</Text>
            )}
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>인성 LBS 통합 (W10-2 시점)</Text>
          <Text style={styles.infoText}>
            본 어플 GPS 보고는 source=APP_GPS_ACTIVE 으로 적재됩니다. W10-2 인성데이타 vendor
            통합 시점에 EXTERNAL_INSUNG_LBS 우선순위 + APP_GPS_ACTIVE 보강 활성됩니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    marginBottom: spacing[3],
    fontFamily: typography.fontFamily.sans,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.line.default,
    marginBottom: spacing[3],
  },
  cardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
    borderBottomWidth: 0.5,
    borderBottomColor: colors.line.default,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  value: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  valueMono: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.mono,
  },
  errorMessage: {
    marginTop: spacing[2],
    color: colors.state.danger,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
  },
  infoCard: {
    backgroundColor: colors.action.brandSubtle,
    borderRadius: radii.card,
    padding: spacing[4],
    borderLeftWidth: 4,
    borderLeftColor: colors.action.brand,
  },
  infoTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.action.brandActive,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
});
