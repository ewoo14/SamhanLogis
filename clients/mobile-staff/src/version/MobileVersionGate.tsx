import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { ActivityIndicator, Button, Linking, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkForOtaUpdate } from './otaUpdates';
import {
  fetchMobileVersionStatus,
  getMajorSessionDismissKey,
  getMinorDismissStorageKey,
  isBlockingForceLevel,
  VERSION_POLICY_FAILURE_MESSAGE,
  type VersionStatus,
} from './versionCheck';

interface MobileVersionGateProps {
  children: React.ReactNode;
}

type GateState =
  | { status: 'checking' }
  | { status: 'pass' }
  | { status: 'minor'; version: VersionStatus }
  | { status: 'major'; version: VersionStatus; dismissKey: string }
  | { status: 'blocked'; version: VersionStatus };

const STORE_UPDATE_TARGET = {
  iosBundleId: 'com.samhan.estimate',
  androidPackageName: 'com.samhan.estimate',
  iosStoreUrl: 'https://apps.apple.com/kr/search?term=%EC%82%BC%ED%95%9C%EA%B3%B5%EC%A1%B0%20%EA%B2%AC%EC%A0%81',
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.samhan.estimate',
} as const;

const sessionDismissedMajorVersions = new Set<string>();

export function MobileVersionGate({ children }: MobileVersionGateProps): React.ReactElement {
  const [gateState, setGateState] = React.useState<GateState>({ status: 'checking' });
  const [failureMessage, setFailureMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function runBootChecks() {
      async function observeOtaUpdate() {
        const result = await checkForOtaUpdate();
        if (result !== 'failed' || !mounted) return;
        console.warn('[mobile-staff-version] OTA 업데이트 확인 실패');
        setFailureMessage('앱 업데이트를 확인하지 못했습니다. 네트워크 연결 후 다시 확인해 주세요.');
      }

      try {
        const version = await fetchMobileVersionStatus();
        if (!mounted) return;
        if (isBlockingForceLevel(version.forceLevel)) {
          setGateState({ status: 'blocked', version });
          return;
        }

        void observeOtaUpdate();

        if (version.forceLevel === 'MAJOR') {
          const dismissKey = getMajorSessionDismissKey(version.latestVersion || 'unknown');
          setGateState(sessionDismissedMajorVersions.has(dismissKey) ? { status: 'pass' } : { status: 'major', version, dismissKey });
          return;
        }
        if (version.forceLevel === 'MINOR') {
          const dismissed = await AsyncStorage.getItem(getMinorDismissStorageKey(version.latestVersion));
          if (!mounted) return;
          setGateState(dismissed === 'true' ? { status: 'pass' } : { status: 'minor', version });
          return;
        }
        setGateState({ status: 'pass' });
      } catch {
        console.warn('[mobile-staff-version] 버전 정책 조회 실패');
        void observeOtaUpdate();
        if (mounted) {
          setFailureMessage(VERSION_POLICY_FAILURE_MESSAGE);
          setGateState({ status: 'pass' });
        }
      }
    }

    void runBootChecks();
    return () => {
      mounted = false;
    };
  }, []);

  if (gateState.status === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color="#1E40AF" />
      </View>
    );
  }

  if (gateState.status === 'blocked') {
    return <BlockingVersionScreen version={gateState.version} />;
  }

  return (
    <View style={styles.root}>
      {failureMessage ? (
        <View accessibilityRole="alert" style={styles.failureBanner}>
          <Text style={styles.failureText}>{failureMessage}</Text>
        </View>
      ) : null}
      {gateState.status === 'major' ? (
        <MajorVersionModal
          version={gateState.version}
          onDismiss={() => {
            sessionDismissedMajorVersions.add(gateState.dismissKey);
            setGateState({ status: 'pass' });
          }}
        />
      ) : null}
      {gateState.status === 'minor' ? (
        <MinorVersionBanner
          version={gateState.version}
          onDismiss={async () => {
            await AsyncStorage.setItem(getMinorDismissStorageKey(gateState.version.latestVersion), 'true');
            setGateState({ status: 'pass' });
          }}
        />
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function BlockingVersionScreen({ version }: { version: VersionStatus }): React.ReactElement {
  return (
    <SafeAreaView style={styles.safeRoot} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.blockingScreen}>
        <Text style={styles.eyebrow}>업데이트 필요</Text>
        <Text style={styles.title}>현재 버전은 더 이상 사용할 수 없습니다.</Text>
        <Text style={styles.body}>
          서버 정책상 최신 버전 {version.latestVersion || '확인 필요'} 설치 후 다시 실행해 주세요.
        </Text>
        <UpdateButton />
        {version.releaseNotes.length > 0 ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>릴리스 노트</Text>
            <Text style={styles.notes}>{version.releaseNotes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MajorVersionModal({
  version,
  onDismiss,
}: {
  version: VersionStatus;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.eyebrow}>업데이트 권장</Text>
          <Text style={styles.modalTitle}>새 버전 {version.latestVersion || '확인 필요'}을 사용할 수 있습니다.</Text>
          <Text style={styles.body}>
            현재 세션은 계속 사용할 수 있지만 안정적인 이용을 위해 업데이트를 권장합니다.
          </Text>
          {version.releaseNotes.length > 0 ? <Text style={styles.modalNotes}>{version.releaseNotes}</Text> : null}
          <View style={styles.actions}>
            <Button title="나중에" onPress={onDismiss} color="#64748B" />
            <UpdateButton />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MinorVersionBanner({
  version,
  onDismiss,
}: {
  version: VersionStatus;
  onDismiss: () => Promise<void>;
}): React.ReactElement {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>새 버전 {version.latestVersion || '확인 필요'} 사용 가능</Text>
        <Text style={styles.bannerBody} numberOfLines={2}>
          {version.releaseNotes || '안정적인 사용을 위해 업데이트를 권장합니다.'}
        </Text>
      </View>
      <View style={styles.bannerActions}>
        <UpdateButton />
        <Button title="다시 보지 않기" onPress={() => void onDismiss()} color="#1E40AF" />
      </View>
    </View>
  );
}

function UpdateButton(): React.ReactElement {
  return <Button title="스토어에서 업데이트" onPress={() => void openStoreUpdateUrl()} color="#1E40AF" />;
}

async function openStoreUpdateUrl(): Promise<void> {
  const url = Platform.OS === 'ios' ? STORE_UPDATE_TARGET.iosStoreUrl : STORE_UPDATE_TARGET.androidStoreUrl;
  try {
    await Linking.openURL(url);
  } catch {
    // Store links are best-effort. The version gate state should remain unchanged.
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  safeRoot: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  blockingScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FAFBFC',
  },
  eyebrow: {
    marginBottom: 8,
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#1A1F2E',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  body: {
    marginTop: 12,
    marginBottom: 16,
    color: '#5C6773',
    fontSize: 15,
    lineHeight: 22,
  },
  notesBox: {
    marginTop: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1E5EA',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  notesTitle: {
    marginBottom: 8,
    color: '#1A1F2E',
    fontSize: 15,
    fontWeight: '700',
  },
  notes: {
    color: '#5C6773',
    fontSize: 14,
    lineHeight: 21,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  modalCard: {
    padding: 20,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    color: '#1A1F2E',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  modalNotes: {
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E5EA',
    backgroundColor: '#EFF6FF',
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#1A1F2E',
    fontSize: 13,
    fontWeight: '700',
  },
  bannerBody: {
    marginTop: 2,
    color: '#5C6773',
    fontSize: 12,
    lineHeight: 17,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  failureBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  failureText: {
    color: '#991B1B',
    fontSize: 12,
    lineHeight: 18,
  },
});
