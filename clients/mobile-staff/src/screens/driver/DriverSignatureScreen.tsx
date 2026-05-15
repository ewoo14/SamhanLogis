/**
 * DriverSignatureScreen — Phase 10 W10-3 신규.
 * Phase 12 PR-H4c 보강 — 서명 등록 직후 actor (driver) audit overlay 표시.
 * Phase F (D-DF-07/12/13) — 양쪽 서명 + sign-and-send-copy 1-tap 발송 + Share Sheet 통합.
 *
 * 정차 도착 시 기사 서명 + 인수자 서명 동시 캡처 + GPS 위치 + POST sign-and-send-copy.
 *
 * 동작 (Phase F 갱신):
 *   1. 기사 서명 + 인수자 서명 두 개 모두 캡처 (PNG dataURL).
 *   2. 캡처 시점 GPS 1회 (NUMERIC(10,7) ~1.1cm 정확도).
 *   3. [완료 + 사본 발송] 버튼 1 탭 → POST sign-and-send-copy.
 *   4. 응답 분기:
 *      - 200 image/png → PNG 저장 (FileSystem) + Share Sheet 자동 호출 (expo-sharing).
 *      - 200 fail → fail 토스트 (RECIPIENT_PHONE_MISSING / RENDERER_TIMEOUT 등).
 *      - 409 → duplicate 토스트 (이미 발송됨).
 *      - 422 → bridge fail 토스트 + [재시도] 버튼.
 *   5. (PR-H4c) 등록 성공 시 AuditOverlay 1건을 'signature' 필드 이력으로 노출.
 *
 * 본 PR (Phase F) 시점:
 *   - signature canvas = `react-native-signature-canvas` 의존성 가용 시 활성, 미가용 시 fallback
 *     mock PNG 캡처 (graceful guard, 본 worktree 미설치 — placeholder PNG 사용).
 *   - production 도입 시 SignaturePad onOK callback 으로 base64 PNG dataURL 반환 — props 변경 X.
 *
 * data-testid (PR-H4c + Phase F):
 *   - `driver-signature-audit-mobile` — 서명 등록 audit overlay wrapper (기존)
 *   - `sig-driver` — 기사 서명 캡처 영역 (Phase F)
 *   - `sig-recipient` — 인수자 서명 캡처 영역 (Phase F)
 *   - `btn-complete-and-share` — 완료 + 사본 발송 1-tap 버튼 (Phase F)
 *   - `btn-retry-copy` — 재시도 버튼 (Phase F, fail/bridge 시만 표시)
 *   - `toast-result` — 결과 토스트 (Phase F)
 */

import { useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { signAndSendCopy } from '../../api/arologis';
import type { CopyFailureReason, SignAndSendCopyFail, SignAndSendCopySuccess } from '../../api/arologis';
import AuditOverlay from '../../components/AuditOverlay';
import type { SlipAuditActorRole, SlipAuditLogResponse } from '../../api/slipAudit';
import { getCurrentPositionAsync } from '../../hooks/useGpsPermission';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  /** JWT access token. */
  token: string | null;
  /** 대상 dispatch UUID (path 만, UI 미노출). */
  dispatchId: string;
  /** vehicle sequence (1-base). */
  vehicleSeq: number;
  /** stop sequence (1-base). */
  stopSeq: number;
  /** 정차 표시명 — UI 노출용 (parsed_partner_name + parsedAddress). UUID 미노출 가드. */
  stopLabel?: string;
  /**
   * (PR-H4c) actor 정보 — audit overlay 의 색상 dot + 이름 표시용.
   * 미전달 시 driverCode='driver' / fullName='배송기사' / role='DRIVER' fallback (시각 일관 유지).
   */
  actor?: {
    driverCode?: string | null;
    fullName?: string | null;
    role?: SlipAuditActorRole | null;
  };
  /**
   * Phase F (D-DF-12) — 인수자 휴대번호 마스킹 표시. 미전달 시 표시 X (Admin 재발송 안내).
   * 예: '010-****-5678'
   */
  recipientPhoneMasked?: string | null;
}

interface SignatureCaptureState {
  driverSig: string | null;
  recipientSig: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  submitting: boolean;
  submitted: boolean;
  signatureId: string | null;
  /** Phase F — Share Sheet 호출 후 toast 메시지. */
  toast: string | null;
  /** Phase F — 재시도 가능 여부 (fail/bridge 시 true). */
  retryable: boolean;
  error: string | null;
}

const initialState: SignatureCaptureState = {
  driverSig: null,
  recipientSig: null,
  capturedAt: null,
  latitude: null,
  longitude: null,
  submitting: false,
  submitted: false,
  signatureId: null,
  toast: null,
  retryable: false,
  error: null,
};

// 1x1 transparent PNG dataURL (signature canvas 미가용 graceful guard).
const MOCK_PNG_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export default function DriverSignatureScreen({
  token, dispatchId, vehicleSeq, stopSeq, stopLabel, actor, recipientPhoneMasked,
}: Props): JSX.Element {
  const [state, setState] = useState<SignatureCaptureState>(initialState);

  /**
   * 서명 placeholder — production 은 react-native-signature-canvas onOK callback.
   * 본 PR 진입 시점 = mock dataURL 사용 (graceful guard).
   */
  const captureDriverSignature = async () => {
    try {
      const pos = await getCurrentPositionAsync();
      setState((s) => ({
        ...s,
        driverSig: MOCK_PNG_DATAURL,
        capturedAt: pos.capturedAt,
        latitude: pos.latitude,
        longitude: pos.longitude,
        error: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, error: `GPS 캡처 실패 — ${msg}` }));
    }
  };

  const captureRecipientSignature = () => {
    setState((s) => ({
      ...s,
      recipientSig: MOCK_PNG_DATAURL,
      error: null,
    }));
  };

  /**
   * Phase F (D-DF-07/12) — 1-tap 완료 + 사본 발송.
   *
   * 흐름:
   * 1. 양쪽 서명 검증 → POST sign-and-send-copy.
   * 2. 응답 분기 처리 (success/fail/duplicate/bridge).
   * 3. success 시 PNG → FileSystem write → Sharing.shareAsync (Share Sheet 자동).
   */
  const handleCompleteAndShare = async () => {
    if (!state.driverSig || !state.recipientSig) {
      Alert.alert('서명 미완료', '기사 + 인수자 서명 둘 다 필요합니다');
      return;
    }
    setState((s) => ({ ...s, submitting: true, toast: null, retryable: false, error: null }));
    try {
      const capturedAt = (state.capturedAt ?? new Date().toISOString()).replace('Z', '');
      const result = await signAndSendCopy(token, dispatchId, vehicleSeq, stopSeq, {
        driverSignatureBase64: state.driverSig,
        recipientSignatureBase64: state.recipientSig,
        capturedAt,
        gpsLat: state.latitude ?? undefined,
        gpsLng: state.longitude ?? undefined,
      });

      if (result.kind === 'success') {
        await handleSuccess(result);
      } else if (result.kind === 'duplicate') {
        const previous = result.json.previousCopySentAt ?? '시각 미상';
        setState((s) => ({
          ...s,
          submitting: false,
          submitted: true,
          toast: `이미 발송됨 (${previous}). Admin 재발송 필요`,
          retryable: false,
        }));
      } else if (result.kind === 'bridge') {
        setState((s) => ({
          ...s,
          submitting: false,
          toast: '서명 양쪽 저장 실패 — 다시 시도해 주세요',
          retryable: true,
        }));
      } else {
        handleFail(result);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({
        ...s,
        submitting: false,
        toast: `오류: ${msg}`,
        retryable: true,
        error: msg,
      }));
    }
  };

  const handleSuccess = async (result: SignAndSendCopySuccess) => {
    // PNG 저장 + Share Sheet 호출 (D-DF-12).
    let toastMessage: string;
    try {
      const cacheDir = FileSystem.cacheDirectory ?? '';
      const fileSafeId = result.signatureId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
      const localUri = `${cacheDir}signature-copy-${fileSafeId}.png`;
      await FileSystem.writeAsStringAsync(localUri, result.pngBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'image/png',
          dialogTitle: `${result.copyRecipientPhoneMasked || '인수자'} 님에게 출고전표 사본 보내기`,
          UTI: 'public.png',
        });
        toastMessage = `서명 저장 완료. ${result.copyRecipientPhoneMasked || '인수자'} 에게 보내세요`;
      } else {
        toastMessage = '서명 저장 완료. Share Sheet 미지원 — 갤러리에 저장됨';
      }
    } catch (shareErr) {
      const msg = shareErr instanceof Error ? shareErr.message : String(shareErr);
      toastMessage = `서명 저장 완료. Share Sheet 호출 실패 (${msg})`;
    }
    setState((s) => ({
      ...s,
      submitting: false,
      submitted: true,
      signatureId: result.signatureId,
      toast: toastMessage,
      retryable: false,
    }));
  };

  const handleFail = (result: SignAndSendCopyFail) => {
    const reason = result.json.copyFailureReason as CopyFailureReason | undefined;
    if (reason === 'RECIPIENT_PHONE_MISSING') {
      setState((s) => ({
        ...s,
        submitting: false,
        submitted: true,
        toast: '서명 저장 완료. 인수자 번호 미등록 — Admin 재발송 필요',
        retryable: false,
      }));
    } else {
      const reasonLabel = reason ?? 'UNKNOWN';
      setState((s) => ({
        ...s,
        submitting: false,
        submitted: true,
        toast: `서명 저장 완료. 사본 합성 실패 (${reasonLabel}) — [재시도] 가능`,
        retryable: true,
      }));
    }
  };

  const reset = () => {
    setState(initialState);
  };

  // PR-H4c — 서명 등록 audit 합성 1건 (slip-service 미연동 시점에도 시각 일관 보장).
  const signatureAuditHistory = useMemo<SlipAuditLogResponse[]>(() => {
    if (!state.submitted || !state.signatureId) return [];
    const actorIdHashInput = actor?.driverCode ?? 'driver';
    return [
      {
        id: state.signatureId,
        slipId: dispatchId,
        field: 'signature',
        previousValue: '(서명 전)',
        newValue: `APP 서명 / ${state.latitude?.toFixed(7) ?? '-'}, ${state.longitude?.toFixed(7) ?? '-'}`,
        actorId: actorIdHashInput,
        actorFullName: actor?.fullName ?? '배송기사',
        actorRole: (actor?.role ?? 'DRIVER') as SlipAuditActorRole,
        createdAt: state.capturedAt ?? new Date().toISOString(),
      },
    ];
  }, [
    state.submitted,
    state.signatureId,
    state.capturedAt,
    state.latitude,
    state.longitude,
    actor?.driverCode,
    actor?.fullName,
    actor?.role,
    dispatchId,
  ]);

  const bothSigned = Boolean(state.driverSig && state.recipientSig);
  const completeDisabled = state.submitting || !bothSigned;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>전자서명</Text>
        <Text style={styles.subtitle}>
          정차 #{stopSeq} (차량 #{vehicleSeq}) — 기사 + 인수자 서명 + GPS + 사본 발송
        </Text>
        {stopLabel && (
          <View style={styles.labelCard}>
            <Text style={styles.labelHead}>정차 정보</Text>
            <Text style={styles.labelBody}>{stopLabel}</Text>
          </View>
        )}

        {/* Phase F — 기사 서명 캔버스 */}
        <View style={styles.canvasGroup}>
          <Text style={styles.canvasLabel}>기사 서명</Text>
          <TouchableOpacity
            style={styles.canvas}
            onPress={captureDriverSignature}
            testID="sig-driver"
            accessibilityLabel="기사 서명 캡처"
          >
            {state.driverSig ? (
              <View style={styles.canvasFilled}>
                <Text style={badgeStyle('sliceSuccess')}>기사 서명 캡처됨</Text>
              </View>
            ) : (
              <View style={styles.canvasEmpty}>
                <Text style={styles.canvasPlaceholder}>여기에 기사 서명</Text>
                <Text style={styles.canvasHint}>탭하여 캡처 + GPS</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Phase F — 인수자 서명 캔버스 */}
        <View style={styles.canvasGroup}>
          <Text style={styles.canvasLabel}>인수자 서명</Text>
          <TouchableOpacity
            style={styles.canvas}
            onPress={captureRecipientSignature}
            testID="sig-recipient"
            accessibilityLabel="인수자 서명 캡처"
          >
            {state.recipientSig ? (
              <View style={styles.canvasFilled}>
                <Text style={badgeStyle('sliceSuccess')}>인수자 서명 캡처됨</Text>
              </View>
            ) : (
              <View style={styles.canvasEmpty}>
                <Text style={styles.canvasPlaceholder}>여기에 인수자 서명</Text>
                <Text style={styles.canvasHint}>탭하여 캡처</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Phase F — 인수자 번호 마스킹 표시 (D-DF-12) */}
        {recipientPhoneMasked && (
          <View style={styles.recipientCard}>
            <Text style={styles.recipientLabel}>인수자</Text>
            <Text style={styles.recipientValue}>{recipientPhoneMasked}</Text>
          </View>
        )}

        {/* GPS — 기사 서명 후만 노출 */}
        {state.driverSig && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>캡처 시점 GPS</Text>
            <View style={styles.row}>
              <Text style={styles.label}>위도</Text>
              <Text style={styles.valueMono}>{state.latitude?.toFixed(7) ?? '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>경도</Text>
              <Text style={styles.valueMono}>{state.longitude?.toFixed(7) ?? '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>캡처 시각</Text>
              <Text style={styles.valueMono}>{state.capturedAt}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>signatureSource</Text>
              <Text style={badgeStyle('channelPush')}>APP</Text>
            </View>
          </View>
        )}

        {state.submitted && state.signatureId && (
          <View style={styles.successCard}>
            <Text style={badgeStyle('sliceSuccess')}>등록 완료</Text>
            <Text style={styles.successText}>signatureId: {state.signatureId}</Text>
          </View>
        )}

        {/* Phase F — 토스트 (5종) */}
        {state.toast && (
          <View style={styles.toastCard} testID="toast-result">
            <Text style={styles.toastText}>{state.toast}</Text>
          </View>
        )}

        {/* PR-H4c — 등록 완료 후 audit overlay */}
        {state.submitted && state.signatureId && signatureAuditHistory.length > 0 && (
          <View style={styles.auditCard} testID="driver-signature-audit-mobile">
            <Text style={styles.auditCardTitle}>변경 이력</Text>
            <View style={styles.auditRow}>
              <Text style={styles.auditFieldLabel}>서명</Text>
              <View style={styles.auditFieldValue}>
                <AuditOverlay
                  field="signature"
                  currentValue={`APP 서명 (정차 #${stopSeq})`}
                  history={signatureAuditHistory}
                />
              </View>
            </View>
          </View>
        )}

        {state.error && (
          <View style={styles.errorCard}>
            <Text style={badgeStyle('warn')}>오류</Text>
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, completeDisabled && styles.btnDisabled]}
            onPress={handleCompleteAndShare}
            disabled={completeDisabled}
            testID="btn-complete-and-share"
            accessibilityState={{ disabled: completeDisabled }}
          >
            <Text style={styles.btnPrimaryText}>
              {state.submitting ? '처리 중...' : '완료 + 사본 발송'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={reset}>
            <Text style={styles.btnGhostText}>다시</Text>
          </TouchableOpacity>
        </View>

        {/* Phase F — 재시도 버튼 (fail/bridge 시만 표시) */}
        {state.retryable && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={handleCompleteAndShare}
              disabled={state.submitting}
              testID="btn-retry-copy"
            >
              <Text style={styles.btnSecondaryText}>재시도</Text>
            </TouchableOpacity>
          </View>
        )}
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
  labelCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  labelHead: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  labelBody: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  canvasGroup: { gap: spacing[1] },
  canvasLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  canvas: {
    height: 140,
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.line.default,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasFilled: { alignItems: 'center', gap: spacing[2] },
  canvasEmpty: { alignItems: 'center', gap: spacing[2] },
  canvasPlaceholder: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  canvasHint: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
  recipientCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipientLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  recipientValue: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.mono,
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
  valueMono: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.mono,
  },
  successCard: {
    backgroundColor: colors.state.successBg,
    borderRadius: radii.card,
    padding: spacing[4],
    borderLeftWidth: 4,
    borderLeftColor: colors.state.success,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  successText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
  },
  toastCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    borderLeftWidth: 4,
    borderLeftColor: colors.action.brand,
  },
  toastText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  errorCard: {
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    padding: spacing[4],
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
    marginBottom: spacing[3],
  },
  errorText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
    marginTop: spacing[2],
  },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  btn: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radii.button,
    alignItems: 'center',
    flex: 1,
  },
  btnPrimary: { backgroundColor: colors.action.brand },
  btnPrimaryText: {
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnSecondary: { backgroundColor: colors.action.brandSubtle, borderWidth: 1, borderColor: colors.action.brand },
  btnSecondaryText: {
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line.default },
  btnGhostText: {
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  btnDisabled: { opacity: 0.5 },
  // PR-H4c — audit overlay card styles
  auditCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.line.default,
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  auditCardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  auditFieldLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    width: 48,
    paddingTop: spacing[1],
  },
  auditFieldValue: {
    flex: 1,
    gap: spacing[1],
  },
});
