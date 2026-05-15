/**
 * SignaturePhotoScreen — P1-8 (Stage 4) driver mode 사진 첨부 통합.
 *
 * <p>기존 {@code DriverSignatureScreen} 의 서명 흐름을 보존하면서, 정차 도착 시 사진 첨부를
 * 옵션 toggle 로 추가. 사용자 결정 옵션 C (driver mode 우선 P1) 일관.
 *
 * <p>흐름:
 * <ol>
 *   <li>정차 도착 → "사진 첨부" toggle ON → DELIVERY / INSPECTION 유형 선택.</li>
 *   <li>{@code PhotoAttachmentCapture} 로 카메라 / 갤러리 / 파일 진입 + 압축 + 미리보기.</li>
 *   <li>"사진 일괄 업로드" 버튼 → public token + slipNo 기반 multipart 업로드 (3회 재시도).</li>
 *   <li>업로드 progress / 실패 메시지 inline 표시 — 사용자는 실패 사진만 재시도 가능.</li>
 *   <li>업로드 완료 후 기존 서명 캡처 흐름 (DriverSignatureScreen) 진입 — 사진은 옵션, 미수행 시
 *       서명만 진행.</li>
 * </ol>
 *
 * <p>제약:
 * <ul>
 *   <li>Phase F (D-DF-13) — W10-4 deep link 활성: DriverTabNavigator 가 본 화면을 'signature-photo'
 *       탭으로 등록 + onUploaded → 'signature' 탭 자동 이동. 사진은 slip-service attachment 로만 보관.</li>
 *   <li>업로드는 public token 경로 (no auth) 만 활성. 인증 기반은 admin / estimate (P2 stub).</li>
 *   <li>EXIF GPS 는 BE 에 함께 전송 (slip-service 가 메타 보존).</li>
 *   <li>UUID 비공개 — 응답의 attachment id 는 UI 미노출, 사용자에게는 fileName + uploadedAt 만.</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md} §2-1 / §4-1.
 */

import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AttachmentApiError,
  uploadAttachmentByToken,
  type SlipAttachmentResponseDto,
  type SlipAttachmentTypeApi,
} from '../../api/attachmentApi';
import PhotoAttachmentCapture, { type PhotoItem } from '../../components/PhotoAttachmentCapture';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  /** DeliveryBatch 토큰 — public 업로드 경로 의존. 없으면 사진 첨부 비활성. */
  batchToken: string | null;
  /** 슬립 번호 (e.g. S-2026-00321) — 사용자 노출 가능 식별자. */
  slipNo: string;
  /** 정차 표시명 (parsedPartnerName + parsedAddress). UI 노출 — UUID 미포함. */
  stopLabel?: string;
  /** 첨부 유형 — driver mode 는 DELIVERY (배송) / INSPECTION (검수) 양자택일. */
  defaultType?: 'DELIVERY' | 'INSPECTION';
  /** 업로드 완료 후 부모 callback (옵션) — 후속 서명 화면 deeplink 등. */
  onUploaded?: (results: SlipAttachmentResponseDto[]) => void;
}

interface UploadStatus {
  uploading: boolean;
  uploaded: boolean;
  error?: string | null;
  /** 업로드 성공 시점 응답 — 부모 callback 으로 전달. */
  response?: SlipAttachmentResponseDto;
}

export default function SignaturePhotoScreen({
  batchToken, slipNo, stopLabel, defaultType = 'DELIVERY', onUploaded,
}: Props): JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(true); // 사진 첨부 toggle (default ON)
  const [type, setType] = useState<SlipAttachmentTypeApi>(defaultType);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  const handleChange = useCallback((next: PhotoItem[]) => {
    setPhotos(next);
    // 새 항목이 추가되면 status 도 동기화 (이미 업로드된 항목은 status 보존).
    setStatuses((prev) => {
      const out: UploadStatus[] = [];
      next.forEach((p, i) => {
        const matched = prev.find((s, j) => j < prev.length && photos[j]?.uri === p.uri);
        out.push(matched ?? { uploading: false, uploaded: false });
      });
      return out;
    });
  }, [photos]);

  const uploadAll = useCallback(async () => {
    if (!batchToken) {
      Alert.alert('업로드 불가', '배송 토큰이 없습니다. 영업 / 배차 담당에게 새 링크를 요청해주세요.');
      return;
    }
    if (photos.length === 0) {
      Alert.alert('첨부된 사진 없음', '먼저 촬영 또는 갤러리에서 사진을 선택해주세요.');
      return;
    }
    setBusy(true);
    const next: UploadStatus[] = photos.map((_, i) => statuses[i] ?? { uploading: false, uploaded: false });
    const successResponses: SlipAttachmentResponseDto[] = [];
    for (let i = 0; i < photos.length; i += 1) {
      if (next[i]?.uploaded) {
        if (next[i].response) successResponses.push(next[i].response!);
        continue; // 이미 업로드된 항목은 skip.
      }
      next[i] = { uploading: true, uploaded: false, error: null };
      setStatuses([...next]);
      try {
        const res = await uploadAttachmentByToken(batchToken, slipNo, {
          uri: photos[i].uri,
          fileName: photos[i].fileName,
          mimeType: photos[i].mimeType,
          exifGpsLat: photos[i].exifGpsLat ?? null,
          exifGpsLng: photos[i].exifGpsLng ?? null,
          capturedAt: photos[i].capturedAt ?? null,
        });
        next[i] = { uploading: false, uploaded: true, response: res };
        successResponses.push(res);
      } catch (e) {
        const msg = e instanceof AttachmentApiError
          ? e.message
          : (e instanceof Error ? e.message : String(e));
        next[i] = { uploading: false, uploaded: false, error: msg };
      }
      setStatuses([...next]);
    }
    setBusy(false);
    const failedCount = next.filter((s) => s.error).length;
    if (failedCount === 0) {
      Alert.alert('업로드 완료', `사진 ${successResponses.length}장 업로드가 완료되었습니다.`);
      onUploaded?.(successResponses);
    } else {
      Alert.alert(
        '일부 사진 업로드 실패',
        `${successResponses.length}장 성공 / ${failedCount}장 실패 — 실패한 사진은 다시 시도 버튼을 눌러주세요.`,
      );
    }
  }, [batchToken, onUploaded, photos, slipNo, statuses]);

  const overallSummary = (() => {
    if (photos.length === 0) return null;
    const done = statuses.filter((s) => s?.uploaded).length;
    const failed = statuses.filter((s) => s?.error).length;
    return { total: photos.length, done, failed };
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>현장 사진 첨부</Text>
        <Text style={styles.subtitle}>
          정차 도착 시 화물 / 인수 / 검수 현장 사진을 첨부합니다 (옵션).
        </Text>
        {stopLabel && (
          <View style={styles.labelCard}>
            <Text style={styles.labelHead}>전표 / 정차 정보</Text>
            <Text style={styles.labelBody}>{slipNo} — {stopLabel}</Text>
          </View>
        )}

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>사진 첨부 활성</Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            testID="attachment-enable-toggle"
          />
        </View>

        {enabled && (
          <>
            <View style={styles.typeRow}>
              <TypeButton
                label="배송사진"
                active={type === 'DELIVERY'}
                onPress={() => setType('DELIVERY')}
                testID="attachment-type-delivery"
              />
              <TypeButton
                label="검수사진"
                active={type === 'INSPECTION'}
                onPress={() => setType('INSPECTION')}
                testID="attachment-type-inspection"
              />
            </View>
            <Text style={styles.typeHint}>
              {type === 'DELIVERY'
                ? '인수증 / 도착 사진 — 분쟁 시 영업 / 회계 증빙으로 사용됩니다.'
                : '입고 검수 사진 — 화물 상태 / 수량 차이 증빙으로 사용됩니다.'}
            </Text>

            <PhotoAttachmentCapture
              value={photos}
              onChange={handleChange}
              title={type === 'DELIVERY' ? '배송 사진 (DELIVERY)' : '검수 사진 (INSPECTION)'}
              itemStatus={statuses}
              maxItems={type === 'DELIVERY' ? 3 : 5}
            />

            {overallSummary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryHead}>업로드 현황</Text>
                <View style={styles.summaryRow}>
                  <Text style={badgeStyle('info')}>전체 {overallSummary.total}</Text>
                  <Text style={badgeStyle('sliceSuccess')}>완료 {overallSummary.done}</Text>
                  {overallSummary.failed > 0 && (
                    <Text style={badgeStyle('warn')}>실패 {overallSummary.failed}</Text>
                  )}
                </View>
              </View>
            )}

            {!batchToken && (
              <View style={styles.warnCard}>
                <Text style={badgeStyle('warn')}>토큰 없음</Text>
                <Text style={styles.warnText}>
                  배송 토큰이 전달되지 않았습니다. 본 화면은 사진 미리보기만 가능하며 업로드는 비활성됩니다.
                  영업 / 배차 담당에게 새 링크를 요청해주세요.
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.btn, styles.btnPrimary,
                  (busy || !batchToken || photos.length === 0) && styles.btnDisabled,
                ]}
                onPress={uploadAll}
                disabled={busy || !batchToken || photos.length === 0}
                testID="attachment-upload-button"
              >
                <Text style={styles.btnPrimaryText}>
                  {busy ? '업로드 중…' : `사진 ${photos.length}장 업로드`}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!enabled && (
          <View style={styles.disabledCard}>
            <Text style={styles.disabledText}>
              사진 첨부 toggle 이 꺼져 있습니다. 서명만 받으려면 그대로 진행하세요.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface TypeButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

function TypeButton({ label, active, onPress, testID }: TypeButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.typeBtn, active && styles.typeBtnActive]}
      testID={testID}
    >
      <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{label}</Text>
    </TouchableOpacity>
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
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  labelCard: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  toggleLabel: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line.default,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: colors.action.brandSubtle,
    borderColor: colors.action.brand,
  },
  typeLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  typeLabelActive: {
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
  },
  typeHint: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[2],
  },
  summaryCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    gap: spacing[2],
  },
  summaryHead: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  warnCard: {
    backgroundColor: colors.state.warningBg,
    padding: spacing[3],
    borderRadius: radii.card,
    gap: spacing[1],
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
  },
  warnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  disabledCard: {
    backgroundColor: colors.surface.subtle,
    padding: spacing[3],
    borderRadius: radii.card,
  },
  disabledText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
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
    fontSize: typography.fontSize.base,
  },
  btnDisabled: { opacity: 0.5 },
});
