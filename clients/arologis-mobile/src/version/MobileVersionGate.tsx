import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { checkForOtaUpdate } from './otaUpdates';
import {
  fetchMobileVersionStatus,
  getMinorDismissStorageKey,
  isBlockingForceLevel,
  type VersionStatus,
} from './versionCheck';

interface MobileVersionGateProps {
  children: React.ReactNode;
}

type GateState =
  | { status: 'checking' }
  | { status: 'pass' }
  | { status: 'minor'; version: VersionStatus }
  | { status: 'blocked'; version: VersionStatus };

export function MobileVersionGate({ children }: MobileVersionGateProps): React.ReactElement {
  const [gateState, setGateState] = React.useState<GateState>({ status: 'checking' });

  React.useEffect(() => {
    let mounted = true;

    async function runBootChecks() {
      void checkForOtaUpdate();
      try {
        const version = await fetchMobileVersionStatus();
        if (!mounted) return;
        if (isBlockingForceLevel(version.forceLevel)) {
          setGateState({ status: 'blocked', version });
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
        if (mounted) setGateState({ status: 'pass' });
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
    <ScrollView contentContainerStyle={styles.blockingScreen}>
      <Text style={styles.eyebrow}>업데이트 필요</Text>
      <Text style={styles.title}>새 버전 설치 후 이용할 수 있습니다.</Text>
      <Text style={styles.body}>
        현재 앱은 서버 정책상 더 이상 사용할 수 없습니다. 최신 버전 {version.latestVersion || '확인 필요'} 설치 후
        다시 실행해 주세요.
      </Text>
      {version.releaseNotes.length > 0 ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>릴리스 노트</Text>
          <Text style={styles.notes}>{version.releaseNotes}</Text>
        </View>
      ) : null}
    </ScrollView>
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
        <Text style={styles.bannerTitle}>새 버전 {version.latestVersion} 사용 가능</Text>
        <Text style={styles.bannerBody} numberOfLines={2}>
          {version.releaseNotes || '안정적인 사용을 위해 업데이트를 권장합니다.'}
        </Text>
      </View>
      <Button title="다시 보지 않기" onPress={() => void onDismiss()} color="#1E40AF" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
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
});
