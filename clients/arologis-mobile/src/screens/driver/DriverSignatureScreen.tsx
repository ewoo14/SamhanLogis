import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';
import type { SignatureViewRef } from 'react-native-signature-canvas';
import { signAndSendCopy } from '../../api/arologis';
import type { DispatchVehicleSummary } from '../../api/arologis';
import type { CopyFailureReason, SignAndSendCopyResult } from '../../api/arologis';
import { getCurrentPositionAsync } from '../../hooks/useGpsPermission';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';
import { setOtaActivitySource } from '../../version/otaUpdates';

export interface SignatureTarget {
  dispatchType: DispatchVehicleSummary['dispatchType'];
  vehicleSequence: number;
  stopSequence: number;
  parsedKakaoSeq?: number | null;
  stopLabel: string;
  partnerName?: string | null;
}

interface Props {
  token: string | null;
  target: SignatureTarget | null;
  driverCode?: string | null;
  onBackToDashboard: () => void;
}

interface SignatureState {
  driverSig: string | null;
  recipientSig: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  submitting: boolean;
  submitted: boolean;
  toast: string | null;
  retryable: boolean;
}

const initialState: SignatureState = {
  driverSig: null,
  recipientSig: null,
  capturedAt: null,
  latitude: null,
  longitude: null,
  submitting: false,
  submitted: false,
  toast: null,
  retryable: false,
};

const SIGNATURE_WEB_STYLE = `
  .m-signature-pad {
    box-shadow: none;
    border: 0;
    background: #FFFFFF;
  }
  .m-signature-pad--body {
    border: 1px dashed #C9D1D9;
    border-radius: 8px;
  }
  .m-signature-pad--footer {
    display: none;
  }
  body, html {
    width: 100%;
    height: 100%;
  }
`;

export default function DriverSignatureScreen({
  token,
  target,
  driverCode,
  onBackToDashboard,
}: Props): React.ReactElement {
  const [state, setState] = React.useState<SignatureState>(initialState);
  const driverSignatureRef = React.useRef<SignatureViewRef>(null);
  const recipientSignatureRef = React.useRef<SignatureViewRef>(null);

  React.useEffect(() => {
    setState(initialState);
  }, [target?.dispatchType, target?.vehicleSequence, target?.stopSequence, target?.parsedKakaoSeq]);

  if (!target) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.h1}>전자서명</Text>
          <Text style={styles.muted}>배차 탭에서 정차를 선택해 주세요</Text>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onBackToDashboard}>
            <Text style={styles.btnPrimaryText}>배차로 이동</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const captureDriverSignature = () => {
    driverSignatureRef.current?.readSignature();
  };

  const captureRecipientSignature = () => {
    recipientSignatureRef.current?.readSignature();
  };

  const handleDriverSignature = async (signatureDataUrl: string) => {
    try {
      const pos = await getCurrentPositionAsync();
      setState((prev) => ({
        ...prev,
        driverSig: normalizeSignatureBase64(signatureDataUrl),
        capturedAt: pos.capturedAt,
        latitude: pos.latitude,
        longitude: pos.longitude,
        toast: '기사 서명과 GPS가 캡처되었습니다',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, toast: `GPS 캡처 실패: ${message}` }));
    }
  };

  const handleRecipientSignature = (signatureDataUrl: string) => {
    setState((prev) => ({
      ...prev,
      recipientSig: normalizeSignatureBase64(signatureDataUrl),
      toast: '인수자 서명이 캡처되었습니다',
    }));
  };

  const completeAndShare = async () => {
    if (!state.driverSig || !state.recipientSig) {
      setState((prev) => ({ ...prev, toast: '기사와 인수자 서명이 모두 필요합니다' }));
      return;
    }

    setState((prev) => ({ ...prev, submitting: true, toast: null, retryable: false }));
    setOtaActivitySource('driver-signature-submit', true);
    try {
      const capturedAt = (state.capturedAt ?? new Date().toISOString()).replace('Z', '');
      const result = await signAndSendCopy(
        token,
        target.dispatchType,
        target.vehicleSequence,
        target.stopSequence,
        {
          driverSignatureBase64: state.driverSig,
          recipientSignatureBase64: state.recipientSig,
          capturedAt,
          gpsLat: state.latitude ?? undefined,
          gpsLng: state.longitude ?? undefined,
          parsedKakaoSeq: target.parsedKakaoSeq ?? undefined,
        },
      );
      await handleResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({
        ...prev,
        submitting: false,
        toast: `서명 처리 실패: ${message}`,
        retryable: true,
      }));
    } finally {
      setOtaActivitySource('driver-signature-submit', false);
    }
  };

  const handleResult = async (result: SignAndSendCopyResult) => {
    if (result.kind === 'success') {
      const shareMessage = await saveAndSharePng(result.pngBase64, target);
      setState((prev) => ({
        ...prev,
        submitting: false,
        submitted: true,
        retryable: false,
        toast: result.copyRecipientPhoneMasked
          ? `${shareMessage} (${result.copyRecipientPhoneMasked})`
          : shareMessage,
      }));
      return;
    }

    if (result.kind === 'duplicate') {
      setState((prev) => ({
        ...prev,
        submitting: false,
        submitted: true,
        retryable: false,
        toast: result.previousCopySentAt
          ? `이미 발송된 정차입니다 (${result.previousCopySentAt})`
          : '이미 발송된 정차입니다',
      }));
      return;
    }

    if (result.kind === 'bridge') {
      setState((prev) => ({
        ...prev,
        submitting: false,
        retryable: result.retryable ?? true,
        toast: '서명 양쪽 저장 실패입니다. 다시 시도해 주세요',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      submitting: false,
      submitted: true,
      retryable: isRetryableCopyFailure(result.copyFailureReason),
      toast: copyFailureMessage(result.copyFailureReason, result.error),
    }));
  };

  const reset = () => {
    setState(initialState);
  };

  const bothSigned = Boolean(state.driverSig && state.recipientSig);
  const primaryDisabled = state.submitting || !bothSigned || state.submitted || state.retryable;
  const primaryLabel = state.submitting ? '처리 중...' : state.submitted ? '발송 완료' : '완료 + 사본 발송';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>전자서명</Text>
            <Text style={styles.subtitle}>차량 #{target.vehicleSequence} / 정차 #{target.stopSequence}</Text>
          </View>
          <TouchableOpacity style={styles.backBtn} onPress={onBackToDashboard}>
            <Text style={styles.backText}>배차</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stopCard}>
          <Text style={styles.cardTitle}>{target.partnerName ?? '정차 정보'}</Text>
          <Text style={styles.stopLabel}>{target.stopLabel}</Text>
          {driverCode ? <Text style={styles.driverCode}>기사 {driverCode}</Text> : null}
        </View>

        <SignaturePad
          title="기사 서명"
          captured={Boolean(state.driverSig)}
          hint="서명 후 캡처를 눌러 GPS와 함께 저장"
          testID="arologis-signature-driver"
          canvasRef={driverSignatureRef}
          onCapture={captureDriverSignature}
          onClear={() => setState((prev) => ({ ...prev, driverSig: null, capturedAt: null, latitude: null, longitude: null }))}
          onOK={handleDriverSignature}
          onEmpty={() => setState((prev) => ({ ...prev, toast: '기사 서명을 먼저 입력해 주세요' }))}
        />
        <SignaturePad
          title="인수자 서명"
          captured={Boolean(state.recipientSig)}
          hint="서명 후 캡처를 눌러 저장"
          testID="arologis-signature-recipient"
          canvasRef={recipientSignatureRef}
          onCapture={captureRecipientSignature}
          onClear={() => setState((prev) => ({ ...prev, recipientSig: null }))}
          onOK={handleRecipientSignature}
          onEmpty={() => setState((prev) => ({ ...prev, toast: '인수자 서명을 먼저 입력해 주세요' }))}
        />

        {state.driverSig ? (
          <View style={styles.gpsCard}>
            <Text style={styles.cardTitle}>GPS</Text>
            <InfoRow label="위도" value={state.latitude?.toFixed(7) ?? '-'} mono />
            <InfoRow label="경도" value={state.longitude?.toFixed(7) ?? '-'} mono />
            <InfoRow label="캡처" value={state.capturedAt ?? '-'} mono />
          </View>
        ) : null}

        {state.toast ? (
          <View style={styles.toast} testID="arologis-signature-toast">
            <Text style={styles.toastText}>{state.toast}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, primaryDisabled && styles.btnDisabled]}
            onPress={completeAndShare}
            disabled={primaryDisabled}
            testID="arologis-signature-complete-share"
            accessibilityState={{ disabled: primaryDisabled }}
          >
            <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={reset}>
            <Text style={styles.btnGhostText}>다시</Text>
          </TouchableOpacity>
        </View>

        {state.retryable ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={completeAndShare}
            disabled={state.submitting}
            testID="arologis-signature-retry"
          >
            <Text style={styles.btnSecondaryText}>재시도</Text>
          </TouchableOpacity>
        ) : null}

        {state.submitted ? (
          <View style={styles.doneCard}>
            <Text style={badgeStyle('sliceSuccess')}>서명 저장 완료</Text>
            <Text style={styles.doneText}>사본은 기기 공유창에서 인수자에게 전달합니다</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

interface SignaturePadProps {
  title: string;
  captured: boolean;
  hint: string;
  testID: string;
  canvasRef: React.RefObject<SignatureViewRef | null>;
  onCapture: () => void;
  onClear: () => void;
  onOK: (signatureDataUrl: string) => void;
  onEmpty: () => void;
}

function SignaturePad({
  title,
  captured,
  hint,
  testID,
  canvasRef,
  onCapture,
  onClear,
  onOK,
  onEmpty,
}: SignaturePadProps): React.ReactElement {
  return (
    <View style={styles.padGroup}>
      <Text style={styles.padTitle}>{title}</Text>
      <View style={styles.signatureCanvasBox} testID={testID}>
        <SignatureCanvas
          ref={canvasRef}
          onOK={onOK}
          onEmpty={onEmpty}
          onClear={onClear}
          imageType="image/png"
          autoClear={false}
          trimWhitespace
          descriptionText={hint}
          clearText="지우기"
          confirmText="캡처"
          webStyle={SIGNATURE_WEB_STYLE}
          backgroundColor="#FFFFFF"
          penColor="#111827"
          minWidth={2}
          maxWidth={4}
        />
      </View>
      <View style={styles.padActions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost, styles.padActionBtn]}
          onPress={() => canvasRef.current?.clearSignature()}
          testID={`${testID}-clear`}
        >
          <Text style={styles.btnGhostText}>지우기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, styles.padActionBtn]}
          onPress={onCapture}
          testID={`${testID}-capture`}
        >
          <Text style={styles.btnSecondaryText}>{captured ? '다시 캡처' : '캡처'}</Text>
        </TouchableOpacity>
      </View>
      {captured ? <Text style={badgeStyle('sliceSuccess')}>캡처됨</Text> : null}
    </View>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoValueMono]}>{value}</Text>
    </View>
  );
}

async function saveAndSharePng(pngBase64: string, target: SignatureTarget): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const suffix = `${target.dispatchType}-v${target.vehicleSequence}-s${target.stopSequence}-${Date.now()}`;
  const localUri = `${cacheDir}arologis-signature-copy-${suffix}.png`;
  await FileSystem.writeAsStringAsync(localUri, pngBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    return '서명 저장 완료. 공유창을 지원하지 않는 기기입니다';
  }

  await Sharing.shareAsync(localUri, {
    mimeType: 'image/png',
    dialogTitle: '출고전표 사본 보내기',
    UTI: 'public.png',
  });
  return '서명 저장 완료. 공유창에서 사본을 전달하세요';
}

function normalizeSignatureBase64(signatureDataUrl: string): string {
  return signatureDataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
}

function isRetryableCopyFailure(reason?: CopyFailureReason): boolean {
  return reason === 'RENDERER_TIMEOUT' || reason === 'RENDERER_ERROR';
}

function copyFailureMessage(reason?: CopyFailureReason, fallback?: string): string {
  switch (reason) {
    case 'RECIPIENT_PHONE_MISSING':
      return '서명은 저장되었습니다. 인수자 번호가 없어 사본 발송은 관리자 재발송이 필요합니다';
    case 'RENDERER_TIMEOUT':
      return '서명은 저장되었습니다. 사본 합성이 지연되어 재시도할 수 있습니다';
    case 'RENDERER_ERROR':
      return '서명은 저장되었습니다. 사본 합성 오류로 재시도할 수 있습니다';
    case 'STORAGE_FULL':
      return '서명은 저장되었습니다. 서버 저장공간 부족으로 관리자 확인이 필요합니다';
    default:
      return fallback ?? '서명 처리 결과를 확인해 주세요';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  emptyState: {
    flex: 1,
    padding: spacing[6],
    justifyContent: 'center',
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  titleBlock: { flex: 1 },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  subtitle: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  muted: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  backBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    backgroundColor: colors.surface.card,
  },
  backText: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  stopCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  stopLabel: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  driverCode: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  padGroup: { gap: spacing[2] },
  padTitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  signatureCanvasBox: {
    height: 176,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  padActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  padActionBtn: {
    flex: 1,
    minHeight: 38,
  },
  pad: {
    minHeight: 132,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    borderStyle: 'dashed',
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  padEmpty: { alignItems: 'center', gap: spacing[1] },
  padPlaceholder: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  padHint: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  gpsCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  infoValueMono: { fontFamily: typography.fontFamily.mono },
  toast: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.selected,
    padding: spacing[3],
  },
  toastText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  actions: { flexDirection: 'row', gap: spacing[2] },
  btn: {
    minHeight: 44,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: colors.action.brand,
  },
  btnDisabled: {
    backgroundColor: colors.ink.tertiary,
  },
  btnPrimaryText: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.card,
  },
  btnGhostText: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.state.warningBg,
    borderWidth: 1,
    borderColor: colors.state.warning,
  },
  btnSecondaryText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  doneCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  doneText: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
  },
});
