/**
 * DraftListScreen v3 — 저장내역 (정정 #17 `btnDraftList`).
 *
 * legacy 출처 (`migration/source/scripts/partner-order/index.html`):
 *   - `#btnDraftList` mobile (HomeScreen 추가 메뉴) — 저장된 PartnerOrderDraft 목록
 *   - line 4506 `enterMobile` 이후 사용자가 작성하다 닫고 다시 들어오는 흐름
 *
 * 본 screen 은 `useOrderDraftStore.snapshots` (메모리 보관) 을 표시.
 * legacy `saveOrderSnapshot` (Notion SNAPSHOT_009) 의 모바일 변형.
 *
 * UUID 미노출 — snapshot id 는 list key 로만 사용, 노출 X.
 * 사용자 노출은 저장 시각 + 라인 수 + 합계 + 거래처 정보.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrderDraftStore, type DraftSnapshot } from '@/stores/orderDraftStore';
import { legacyVars } from '@/styles/legacyMobile';
import type { OrderStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'DraftList'>;

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}/${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function totalKRW(snap: DraftSnapshot): number {
  return snap.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

export function DraftListScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const snapshots = useOrderDraftStore((s) => s.snapshots);
  const loadSnapshot = useOrderDraftStore((s) => s.loadSnapshot);
  const removeSnapshot = useOrderDraftStore((s) => s.removeSnapshot);

  const handleLoad = (id: string): void => {
    const ok = loadSnapshot(id);
    if (!ok) {
      Alert.alert('불러오기 실패', '저장 내역을 찾을 수 없습니다.');
      return;
    }
    nav.navigate('OrderForm', undefined);
  };

  const handleRemove = (id: string): void => {
    Alert.alert('저장 삭제', '이 저장 내역을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeSnapshot(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.titleBar}>
        <Text style={styles.titleText}>저장내역</Text>
        <Text style={styles.titleHint}>{snapshots.length}건</Text>
      </View>

      {snapshots.length === 0 ? (
        <View style={styles.emptyBox} testID="draft-empty">
          <Text style={styles.emptyText}>저장된 주문이 없습니다.</Text>
          <Text style={styles.emptyHint}>홈 화면의 [주문저장] 버튼으로 작성중인 주문을 보관할 수 있습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={snapshots}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`draft-row-${item.id}`}>
              <View style={styles.rowHead}>
                <Text style={styles.savedAt}>{formatDateTime(item.savedAt)}</Text>
                <Text style={styles.lineCount}>{item.lines.length}건</Text>
              </View>
              <Text style={styles.firstLine} numberOfLines={2}>
                {item.lines.length > 0 ? `${item.lines[0]!.modelName}${item.lines.length > 1 ? ` 외 ${item.lines.length - 1}건` : ''}` : '라인 없음'}
              </Text>
              {item.shippingAddress ? (
                <Text style={styles.address} numberOfLines={1}>{item.shippingAddress}</Text>
              ) : null}
              <View style={styles.rowFoot}>
                <Text style={styles.amount}>₩{totalKRW(item).toLocaleString('ko-KR')}</Text>
                <View style={styles.rowActions}>
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, styles.actionLoad, pressed && styles.pressed]}
                    onPress={() => handleLoad(item.id)}
                    testID={`draft-load-${item.id}`}
                  >
                    <Text style={styles.actionLoadText}>불러오기</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, styles.actionRemove, pressed && styles.pressed]}
                    onPress={() => handleRemove(item.id)}
                    testID={`draft-remove-${item.id}`}
                  >
                    <Text style={styles.actionRemoveText}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: legacyVars.cBg },
  titleBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  titleHint: {
    fontSize: 13,
    color: legacyVars.cMuted,
    fontWeight: '600',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    color: legacyVars.cMuted,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 12,
    color: legacyVars.cMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: 12,
    gap: 8,
    paddingBottom: 60,
  },
  separator: { height: 8 },
  row: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedAt: {
    fontSize: 14,
    fontWeight: '700',
    color: legacyVars.cStrong,
  },
  lineCount: {
    fontSize: 12,
    color: legacyVars.cMuted,
    fontWeight: '600',
  },
  firstLine: {
    fontSize: 13,
    color: legacyVars.cStrong,
  },
  address: {
    fontSize: 12,
    color: legacyVars.cMuted,
  },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: legacyVars.cAccent,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionLoad: {
    backgroundColor: legacyVars.bizButton,
    borderColor: legacyVars.bizButton,
  },
  actionLoadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionRemove: {
    backgroundColor: '#FFFFFF',
    borderColor: legacyVars.bizDanger,
  },
  actionRemoveText: {
    color: legacyVars.bizDanger,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: { opacity: 0.85 },
});
