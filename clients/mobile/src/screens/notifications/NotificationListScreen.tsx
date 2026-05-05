/**
 * NotificationListScreen — 알림 목록.
 *
 * F4 (b) FCM push 후속 — 본 화면은 ActionLog (PartnerOrderActionLog, §2.4.4) 기반
 * polling 표시 만 (push 미통합).
 */

import { FlatList, StyleSheet, Text, View } from 'react-native';
import { RNBadge } from '@/components/RNBadge';
import { RNCard } from '@/components/RNCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
}

// MVP — 시드 데이터 (M2 ActionLog endpoint 연결 후 react-query 로 교체)
const SEED: NotificationItem[] = [
  {
    id: 'notif-1',
    title: '주문 PO-20260505-0003 접수',
    body: '주문이 접수되었습니다. 확정 후 SMS 로 알려드립니다.',
    createdAt: '2026-05-05 14:23',
    unread: true,
  },
  {
    id: 'notif-2',
    title: '주문 PO-20260504-0007 발송완료',
    body: '주문이 발송되었습니다. 송장번호는 출고전표에서 확인 가능합니다.',
    createdAt: '2026-05-04 17:08',
    unread: false,
  },
  {
    id: 'notif-3',
    title: '비밀번호 변경',
    body: '임시 비밀번호가 변경되었습니다.',
    createdAt: '2026-05-03 09:15',
    unread: false,
  },
];

export function NotificationListScreen(): JSX.Element {
  return (
    <ScreenContainer scroll={false}>
      <FlatList
        data={SEED}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>알림</Text>
            <RNBadge label={`${SEED.filter((n) => n.unread).length} 읽지 않음`} tone="info" />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>알림이 없습니다.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <RNCard style={item.unread ? styles.unreadCard : undefined}>
            <View style={styles.rowHead}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.unread ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.time}>{item.createdAt}</Text>
          </RNCard>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing['2xl'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.base },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  empty: { alignItems: 'center', padding: spacing['2xl'] },
  emptyText: { color: colors.textSubtle, fontSize: fontSize.base },
  separator: { height: spacing.sm },
  unreadCard: { borderColor: colors.brand400 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginLeft: spacing.sm },
  body: { marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: fontSize.sm * 1.5 },
  time: { marginTop: spacing.sm, fontSize: fontSize.xs, color: colors.textSubtle },
});
