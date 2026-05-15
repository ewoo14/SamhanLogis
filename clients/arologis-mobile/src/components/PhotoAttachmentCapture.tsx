import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { badgeStyle, colors, radii, spacing, typography } from '../theme/tokens';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const COMPRESS_MAX_WIDTH = 1920;
const COMPRESS_MAX_HEIGHT = 1080;
const COMPRESS_QUALITY = 0.8;

export interface PhotoItem {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  exifGpsLat?: number | null;
  exifGpsLng?: number | null;
  capturedAt?: string | null;
}

interface Props {
  value: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
  title?: string;
  maxItems?: number;
  itemStatus?: Array<{ uploading: boolean; uploaded: boolean; error?: string | null } | undefined>;
}

type LibStatus = 'unknown' | 'available' | 'missing';

export default function PhotoAttachmentCapture({
  value,
  onChange,
  title,
  maxItems = 5,
  itemStatus,
}: Props): React.ReactElement {
  const [pickerStatus, setPickerStatus] = React.useState<LibStatus>('unknown');
  const [manipulatorStatus, setManipulatorStatus] = React.useState<LibStatus>('unknown');

  React.useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('expo-image-picker');
      setPickerStatus('available');
    } catch {
      setPickerStatus('missing');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('expo-image-manipulator');
      setManipulatorStatus('available');
    } catch {
      setManipulatorStatus('missing');
    }
  }, []);

  const addPhoto = React.useCallback((photo: PhotoItem) => {
    if (value.length >= maxItems) {
      Alert.alert('첨부 한도 초과', `최대 ${maxItems}장까지 첨부 가능합니다.`);
      return;
    }
    if (photo.sizeBytes > MAX_FILE_BYTES) {
      Alert.alert('파일 크기 초과', '5MB 이하 사진만 업로드할 수 있습니다. 다시 촬영하거나 다른 사진을 선택해 주세요.');
      return;
    }
    onChange([...value, photo]);
  }, [maxItems, onChange, value]);

  const handleCamera = React.useCallback(async () => {
    if (pickerStatus !== 'available') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('카메라 권한 필요', '현장 사진 촬영을 위해 카메라 권한이 필요합니다.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const compressed = await compressImage(asset.uri, manipulatorStatus);
      addPhoto(toPhotoItem(asset, compressed));
    } catch (error) {
      Alert.alert('촬영 실패', error instanceof Error ? error.message : String(error));
    }
  }, [addPhoto, manipulatorStatus, pickerStatus]);

  const handleGallery = React.useCallback(async () => {
    if (pickerStatus !== 'available') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('갤러리 권한 필요', '갤러리 사진 접근 권한이 필요합니다.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
        allowsMultipleSelection: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const compressed = await compressImage(asset.uri, manipulatorStatus);
      addPhoto(toPhotoItem(asset, compressed));
    } catch (error) {
      Alert.alert('갤러리 선택 실패', error instanceof Error ? error.message : String(error));
    }
  }, [addPhoto, manipulatorStatus, pickerStatus]);

  const handleDelete = React.useCallback((index: number) => {
    onChange(value.filter((_, i) => i !== index));
  }, [onChange, value]);

  const pickerMissing = pickerStatus === 'missing';

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {pickerMissing ? (
        <View style={styles.warnCard}>
          <Text style={badgeStyle('warn')}>사진 모듈 미설치</Text>
          <Text style={styles.warnText}>앱 의존성을 설치한 뒤 다시 실행해 주세요.</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton, pickerMissing && styles.disabled]}
          onPress={handleCamera}
          disabled={pickerMissing}
          testID="attachment-camera-button"
        >
          <Text style={styles.primaryText}>촬영</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton, pickerMissing && styles.disabled]}
          onPress={handleGallery}
          disabled={pickerMissing}
          testID="attachment-gallery-button"
        >
          <Text style={styles.secondaryText}>갤러리</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>최대 {maxItems}장 / 5MB 이하 / 1920x1080 자동 압축</Text>

      {value.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>첨부된 사진이 없습니다</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
          {value.map((photo, index) => {
            const status = itemStatus?.[index];
            return (
              <View key={`${photo.uri}-${index}`} style={styles.previewCard} testID={`attachment-preview-${index}`}>
                <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" />
                <View style={styles.previewMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>{photo.fileName}</Text>
                  <Text style={styles.fileSize}>{photo.sizeBytes ? `${Math.round(photo.sizeBytes / 1024)}KB` : '-'}</Text>
                  {status?.uploading ? <Text style={badgeStyle('slicePending')}>업로드 중</Text> : null}
                  {status?.uploaded ? <Text style={badgeStyle('sliceSuccess')}>업로드 완료</Text> : null}
                  {status?.error ? <Text style={[badgeStyle('warn'), styles.errorBadge]} numberOfLines={2}>{status.error}</Text> : null}
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(index)}
                  testID={`attachment-delete-${index}`}
                >
                  <Text style={styles.deleteText}>삭제</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

async function compressImage(uri: string, status: LibStatus): Promise<{ uri: string; sizeBytes: number }> {
  if (status !== 'available') {
    return { uri, sizeBytes: 0 };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Manipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const result = await Manipulator.manipulateAsync(
      uri,
      [{ resize: { width: COMPRESS_MAX_WIDTH, height: COMPRESS_MAX_HEIGHT } }],
      { compress: COMPRESS_QUALITY, format: Manipulator.SaveFormat.JPEG },
    );
    const sizeBytes = await estimateFileSize(result.uri);
    return { uri: result.uri, sizeBytes };
  } catch {
    return { uri, sizeBytes: 0 };
  }
}

async function estimateFileSize(uri: string): Promise<number> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.size ?? 0;
  } catch {
    return 0;
  }
}

function toPhotoItem(
  asset: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    exif?: Record<string, unknown> | null;
  },
  compressed: { uri: string; sizeBytes: number },
): PhotoItem {
  const fileName = asset.fileName ?? `arologis-photo-${Date.now()}.jpg`;
  return {
    uri: compressed.uri,
    fileName,
    mimeType: inferMimeType(asset.mimeType, fileName),
    sizeBytes: compressed.sizeBytes || asset.fileSize || 0,
    exifGpsLat: extractExifGps(asset.exif, 'lat'),
    exifGpsLng: extractExifGps(asset.exif, 'lng'),
    capturedAt: extractExifDate(asset.exif) ?? new Date().toISOString(),
  };
}

function inferMimeType(provided: string | null | undefined, fileName: string): string {
  if (provided?.startsWith('image/')) return provided;
  return fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

function extractExifGps(exif: Record<string, unknown> | null | undefined, axis: 'lat' | 'lng'): number | null {
  if (!exif) return null;
  const flat = axis === 'lat' ? exif.GPSLatitude : exif.GPSLongitude;
  const nested = exif.GPS && typeof exif.GPS === 'object'
    ? (exif.GPS as Record<string, unknown>)[axis === 'lat' ? 'Latitude' : 'Longitude']
    : null;
  const value = typeof flat === 'number' ? flat : typeof nested === 'number' ? nested : null;
  return Number.isFinite(value) ? value : null;
}

function extractExifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  warnCard: {
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  warnText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    paddingHorizontal: spacing[3],
  },
  primaryButton: { backgroundColor: colors.action.brand },
  secondaryButton: {
    backgroundColor: colors.action.brandSubtle,
    borderWidth: 1,
    borderColor: colors.action.brand,
  },
  disabled: { opacity: 0.5 },
  primaryText: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  secondaryText: {
    color: colors.action.brandActive,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  emptyCard: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  previewRow: { marginTop: spacing[2] },
  previewCard: {
    width: 124,
    marginRight: spacing[2],
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    overflow: 'hidden',
    backgroundColor: colors.surface.subtle,
  },
  previewImage: {
    width: 124,
    height: 92,
    backgroundColor: colors.line.default,
  },
  previewMeta: {
    padding: spacing[2],
    gap: spacing[1],
  },
  fileName: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  fileSize: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.mono,
  },
  errorBadge: { marginTop: spacing[1] },
  deleteButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.state.dangerBg,
  },
  deleteText: {
    color: colors.state.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
