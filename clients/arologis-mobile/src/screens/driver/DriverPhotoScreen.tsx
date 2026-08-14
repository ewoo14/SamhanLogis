import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArologisApiError, uploadStopPhoto, type DispatchVehicleSummary, type PhotoType } from '../../api/arologis';
import PhotoAttachmentCapture, { type PhotoItem } from '../../components/PhotoAttachmentCapture';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';
import { setOtaActivitySource } from '../../version/otaUpdates';

export interface PhotoTarget {
  dispatchType: DispatchVehicleSummary['dispatchType'];
  vehicleSequence: number;
  stopSequence: number;
  parsedKakaoSeq?: number | null;
  stopLabel: string;
  partnerName?: string | null;
}

interface Props {
  token: string | null;
  target: PhotoTarget | null;
  driverCode?: string | null;
  onBackToDashboard: () => void;
}

interface UploadStatus {
  uploading: boolean;
  uploaded: boolean;
  error?: string | null;
}

export default function DriverPhotoScreen({
  token,
  target,
  driverCode,
  onBackToDashboard,
}: Props): React.ReactElement {
  const [photoType, setPhotoType] = React.useState<PhotoType>('DELIVERY');
  const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
  const [statuses, setStatuses] = React.useState<UploadStatus[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPhotos([]);
    setStatuses([]);
    setToast(null);
    setPhotoType('DELIVERY');
  }, [target?.dispatchType, target?.vehicleSequence, target?.stopSequence, target?.parsedKakaoSeq]);

  if (!target) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.h1}>현장 사진</Text>
          <Text style={styles.muted}>배차 탭에서 정차를 선택해 주세요</Text>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onBackToDashboard}>
            <Text style={styles.btnPrimaryText}>배차로 이동</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleChangePhotos = (next: PhotoItem[]) => {
    setPhotos(next);
    setStatuses((prev) => next.map((photo, index) => (
      photos[index]?.uri === photo.uri ? prev[index] ?? { uploading: false, uploaded: false } : { uploading: false, uploaded: false }
    )));
  };

  const uploadAll = async (retryOnly = false) => {
    if (photos.length === 0) {
      setToast('먼저 사진을 촬영하거나 갤러리에서 선택해 주세요');
      return;
    }
    setBusy(true);
    setOtaActivitySource('driver-photo-upload', true);
    setToast(null);
    const next = photos.map((_, index) => statuses[index] ?? { uploading: false, uploaded: false });
    for (let i = 0; i < photos.length; i += 1) {
      if (next[i]?.uploaded) continue;
      if (retryOnly && !next[i]?.error) continue;
      next[i] = { uploading: true, uploaded: false, error: null };
      setStatuses([...next]);
      try {
        await uploadStopPhoto(token, target.dispatchType, target.vehicleSequence, target.stopSequence, photoType, {
          uri: photos[i].uri,
          fileName: photos[i].fileName,
          mimeType: photos[i].mimeType,
          exifGpsLat: photos[i].exifGpsLat ?? null,
          exifGpsLng: photos[i].exifGpsLng ?? null,
          capturedAt: photos[i].capturedAt ?? null,
          parsedKakaoSeq: target.parsedKakaoSeq ?? null,
        });
        next[i] = { uploading: false, uploaded: true, error: null };
      } catch (error) {
        next[i] = { uploading: false, uploaded: false, error: friendlyUploadError(error) };
      }
      setStatuses([...next]);
    }
    setBusy(false);
    setOtaActivitySource('driver-photo-upload', false);
    const done = next.filter((status) => status.uploaded).length;
    const failed = next.filter((status) => status.error).length;
    setToast(failed > 0 ? `${done}장 성공 / ${failed}장 실패` : `${done}장 업로드 완료`);
  };

  const doneCount = statuses.filter((status) => status?.uploaded).length;
  const failedCount = statuses.filter((status) => status?.error).length;
  const maxItems = photoType === 'DELIVERY' ? 3 : 5;
  const title = photoType === 'DELIVERY' ? '배송 사진' : '검수 사진';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>현장 사진</Text>
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

        <View style={styles.segment}>
          <TypeButton
            label="배송사진"
            active={photoType === 'DELIVERY'}
            onPress={() => setPhotoType('DELIVERY')}
            testID="arologis-photo-type-delivery"
          />
          <TypeButton
            label="검수사진"
            active={photoType === 'INSPECTION'}
            onPress={() => setPhotoType('INSPECTION')}
            testID="arologis-photo-type-inspection"
          />
        </View>

        <PhotoAttachmentCapture
          value={photos}
          onChange={handleChangePhotos}
          title={`${title} (${photoType})`}
          maxItems={maxItems}
          itemStatus={statuses}
        />

        {photos.length > 0 ? (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>업로드 현황</Text>
            <View style={styles.summaryRow}>
              <Text style={badgeStyle('info')}>전체 {photos.length}</Text>
              <Text style={badgeStyle('sliceSuccess')}>완료 {doneCount}</Text>
              {failedCount > 0 ? <Text style={badgeStyle('warn')}>실패 {failedCount}</Text> : null}
            </View>
          </View>
        ) : null}

        {toast ? (
          <View style={styles.toast} testID="arologis-photo-toast">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, (busy || photos.length === 0) && styles.btnDisabled]}
            onPress={() => uploadAll(false)}
            disabled={busy || photos.length === 0}
            testID="arologis-photo-upload-all"
            accessibilityState={{ disabled: busy || photos.length === 0 }}
          >
            <Text style={styles.btnPrimaryText}>{busy ? '업로드 중...' : `사진 ${photos.length}장 업로드`}</Text>
          </TouchableOpacity>
          {failedCount > 0 ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              onPress={() => uploadAll(true)}
              disabled={busy}
              testID="arologis-photo-retry-failed"
            >
              <Text style={styles.btnSecondaryText}>실패 재시도</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TypeButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  return (
    <TouchableOpacity
      style={[styles.typeBtn, active && styles.typeBtnActive]}
      onPress={onPress}
      testID={testID}
    >
      <Text style={[styles.typeText, active && styles.typeTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function friendlyUploadError(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status)
    : 0;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 413) {
    return '파일이 너무 큽니다. 다시 촬영하거나 다른 사진을 선택해 주세요.';
  }
  if (status === 422 || message.includes('SLIP_MAPPING_NOT_FOUND')) {
    return '정차와 연결된 전표를 찾을 수 없습니다. 배차 담당자에게 확인해 주세요.';
  }
  if (status === 401 || status === 403) {
    return '권한이 없습니다. 다시 로그인해 주세요.';
  }
  if (error instanceof ArologisApiError || status > 0) {
    return message;
  }
  return '네트워크가 불안정합니다. 잠시 후 다시 시도해 주세요.';
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
  segment: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.card,
  },
  typeBtnActive: {
    backgroundColor: colors.action.brandSubtle,
    borderColor: colors.action.brand,
  },
  typeText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  typeTextActive: {
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
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
    fontFamily: typography.fontFamily.sans,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  btnPrimary: { backgroundColor: colors.action.brand },
  btnSecondary: {
    backgroundColor: colors.state.warningBg,
    borderWidth: 1,
    borderColor: colors.state.warning,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnSecondaryText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
