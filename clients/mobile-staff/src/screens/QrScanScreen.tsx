import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radii, spacing, typography } from '../theme/tokens';

type Direction = 'INBOUND' | 'OUTBOUND';
type Item = { serialKey: string; productCode: string };

const rejectionMessages: Record<string, string> = {
  PRODUCT_MISMATCH: '품목이 전표와 일치하지 않습니다.',
  DUPLICATE_SCAN: '이미 스캔한 시리얼키입니다.',
  SERIAL_NOT_FOUND: '시리얼키를 찾을 수 없습니다.',
  ALREADY_SHIPPED: '이미 출고된 개체입니다.',
  NON_SERIAL_MANAGED: '시리얼 관리 대상이 아닙니다. 대상 품목은 실외기·실내기·판넬뿐입니다.',
  SLIP_NOT_FOUND: '전표를 찾을 수 없습니다.',
};

function parsePayload(value: string): Item | null {
  const [serialKey, productCode] = value.trim().split(/[|,\s]+/, 2);
  return serialKey && productCode && /^SI-[A-Z0-9]+$/i.test(serialKey) ? { serialKey, productCode } : null;
}

export default function QrScanScreen({ apiBaseUrl = 'http://localhost:8080' }: { apiBaseUrl?: string }): JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const [direction, setDirection] = useState<Direction>('OUTBOUND');
  const [slipNo, setSlipNo] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [scanning, setScanning] = useState(true);
  const disabled = useMemo(() => !slipNo || confirmed, [slipNo, confirmed]);

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (disabled || !scanning) return;
    const item = parsePayload(data);
    if (!item) { setError('QR에는 시리얼키와 품목코드가 필요합니다.'); setScanning(false); return; }
    if (items.some((existing) => existing.serialKey === item.serialKey)) { setError(rejectionMessages.DUPLICATE_SCAN); setScanning(false); return; }
    setItems((current) => [...current, item]);
    setError('');
    setScanning(false);
  };

  const confirm = async () => {
    if (!slipNo || items.length === 0) return;
    try {
      const response = await fetch(`${apiBaseUrl}/inventory/instances/scan/${direction.toLowerCase()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ slipNo, items }) });
      const payload = await response.json().catch(() => null) as { message?: string; data?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.data?.message ?? payload?.message ?? '서버가 반환한 거부 사유를 확인할 수 없습니다.');
      setConfirmed(true); setScanning(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '서버가 반환한 거부 사유를 확인할 수 없습니다.'); }
  };

  if (!permission?.granted) return <View style={styles.center}><Text style={styles.title}>카메라 권한이 필요합니다</Text><Text style={styles.body}>모바일 QR 스캔을 위해 카메라 접근을 허용하세요.</Text><Pressable style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>카메라 허용</Text></Pressable></View>;

  return <ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>QR 스캔 입출고</Text><Text style={styles.body}>전부 되거나 전부 취소됩니다. 확정 전에는 재고에 반영되지 않습니다.</Text><View style={styles.row}><Pressable style={[styles.toggle, direction === 'OUTBOUND' && styles.selected]} onPress={() => setDirection('OUTBOUND')}><Text>출고</Text></Pressable><Pressable style={[styles.toggle, direction === 'INBOUND' && styles.selected]} onPress={() => setDirection('INBOUND')}><Text>입고</Text></Pressable></View><TextInput accessibilityLabel="전표번호" placeholder="전표번호 예: 2026/08/14-3" value={slipNo} onChangeText={setSlipNo} style={styles.input} /><View style={styles.camera}><CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanning && !disabled ? onBarcodeScanned : undefined} style={StyleSheet.absoluteFillObject} /><View style={styles.scanFrame} /></View><Text style={styles.body}>카메라 QR 인식 · 다음 QR을 계속 찍으려면 아래 버튼을 누르세요.</Text>{error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}<View style={styles.list}>{items.map((item) => <View key={item.serialKey} style={styles.item}><Text style={styles.mono}>{item.serialKey}</Text><Text style={styles.body}>{item.productCode}</Text><Text style={styles.ok}>✓ 목록에 추가됨</Text></View>)}</View>{!confirmed && items.length > 0 ? <Pressable style={styles.primary} onPress={confirm}><Text style={styles.primaryText}>전체 확정</Text></Pressable> : null}{!confirmed ? <Pressable style={styles.secondary} onPress={() => { setScanning(true); setError(''); }}><Text style={styles.secondaryText}>다음 QR 스캔</Text></Pressable> : <Text style={styles.ok}>확정 완료 — {slipNo} 전표 전체가 처리되었습니다.</Text>}{confirmed ? <Pressable style={styles.secondary} onPress={() => { setItems([]); setConfirmed(false); setSlipNo(''); setScanning(true); }}><Text style={styles.secondaryText}>새 작업</Text></Pressable> : null}</ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: spacing[4], gap: spacing[3], backgroundColor: colors.surface.app, flexGrow: 1 },
  center: { flex: 1, padding: spacing[5], gap: spacing[3], justifyContent: 'center', backgroundColor: colors.surface.app },
  title: { color: colors.ink.primary, fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold },
  body: { color: colors.ink.secondary, fontSize: typography.fontSize.base, lineHeight: 22 },
  row: { flexDirection: 'row', gap: spacing[2] },
  toggle: { flex: 1, padding: spacing[3], alignItems: 'center', borderWidth: 1, borderColor: colors.line.default, borderRadius: radii.md, backgroundColor: colors.surface.card },
  selected: { borderColor: colors.line.selected, backgroundColor: colors.surface.selected },
  input: { minHeight: 48, paddingHorizontal: spacing[3], borderWidth: 1, borderColor: colors.line.default, borderRadius: radii.md, backgroundColor: colors.surface.card, color: colors.ink.primary, fontSize: typography.fontSize.base },
  camera: { height: 260, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.ink.primary },
  scanFrame: { position: 'absolute', top: '25%', left: '15%', right: '15%', bottom: '25%', borderWidth: 2, borderColor: colors.state.success, borderRadius: radii.md },
  error: { padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.state.dangerBg },
  errorText: { color: colors.state.danger, fontWeight: typography.fontWeight.semibold },
  list: { gap: spacing[2] },
  item: { padding: spacing[3], gap: spacing[1], borderRadius: radii.md, backgroundColor: colors.surface.card, borderWidth: 1, borderColor: colors.line.default },
  mono: { color: colors.ink.primary, fontFamily: typography.fontFamily.mono, fontWeight: typography.fontWeight.semibold },
  ok: { color: colors.state.success, fontWeight: typography.fontWeight.semibold },
  primary: { minHeight: 48, padding: spacing[3], alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.action.brand },
  primaryText: { color: colors.ink.onPrimary, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold },
  secondary: { minHeight: 48, padding: spacing[3], alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.line.default, backgroundColor: colors.surface.card },
  secondaryText: { color: colors.action.brand, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold },
});
