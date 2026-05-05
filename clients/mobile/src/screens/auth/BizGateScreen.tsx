/**
 * BizGateScreen v2 — 사업자번호 입력 게이트.
 *
 * DECISIONS Phase 6 정정 #16 — partner-order Apps Script index.html 모바일 viewport 분기 1:1 모방.
 *
 * legacy 출처: migration/source/scripts/partner-order/index.html
 *   - line 12  : `.page-gate { background: #020617; z-index: 200000; }`
 *   - line 14  : `.biz-box { background: #0b1120; border-radius: 16px; padding: 24px 20px 20px; width: min(420px, calc(100% - 40px)); color: #e5e7eb; }`
 *   - line 369 : 모바일 `.biz-box { width: calc(100% - 32px); padding: 24px 16px 20px }`
 *   - line 375 : 모바일 `.biz-title { font-size: 28px }`
 *   - line 376 : 모바일 `.biz-field-row input { height: 60px; font-size: 24px }`
 *   - line 382 : 모바일 `.page-gate .btn { height: 60px; font-size: 22px }`
 *   - line 566~648 : `<div id="pageBizGate"><div class="biz-box">` HTML 구조
 *     - `삼한공조시스템 주문서` 로고 (font-size:26px; font-weight:900; color:#60a5fa)
 *     - `<div class="biz-title">사업자등록번호</div>`
 *     - `<input id="bizGateInput" placeholder="000-00-00000" maxlength="12">`
 *     - `<button id="btnBizQuery" class="btn">조회</button>`
 *     - 안내문 2 블록 (① 사업자 등록·승인 안내 / ② 이용 환경 안내)
 *
 * 정정 #12 — 인증 OK 시 PartnerDcConfig fetch + dcConfigStore 저장.
 *
 * UUID 미노출 — bizNo (10자리) + 거래처명 만 노출.
 *
 * status 분기 (v1 보존):
 *   - OK → BottomTab 진입 + DC config fetch
 *   - REQUIRES_PASSWORD → TempPassword screen
 *   - REQUIRES_REGISTRATION → Register screen
 *   - LOCKED → 잠금 메시지
 *   - UNKNOWN → 미등록 안내
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkBizGate } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { legacyGateStyles, legacyVars } from '@/styles/legacyMobile';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'BizGate'>;

/** 사업자번호 자동 포맷 — `0000000000` → `000-00-00000` */
function formatBizNo(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function BizGateScreen({ navigation }: Props): JSX.Element {
  const [bizNo, setBizNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const loadDcConfig = useDcConfigStore((s) => s.loadForPartner);
  const rootNav = useNavigation();

  const digitsOnly = bizNo.replace(/[^0-9]/g, '');
  const isValid = digitsOnly.length === 10;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) {
      setError('사업자번호 10자리를 입력해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await checkBizGate(digitsOnly);
      switch (res.status) {
        case 'OK':
          if (res.token && res.partnerCode && res.partnerName) {
            await login(res.partnerCode, res.partnerName, res.token);
            // 정정 #12 — 인증 OK 시 DC 설정 fetch (실패해도 진입 차단 X, 정상가로 표시)
            void loadDcConfig(res.partnerCode);
            rootNav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
          }
          break;
        case 'REQUIRES_PASSWORD':
          navigation.navigate('TempPassword', {
            partnerCode: res.partnerCode ?? digitsOnly,
            partnerName: res.partnerName ?? '',
          });
          break;
        case 'REQUIRES_REGISTRATION':
          navigation.navigate('Register', { partnerCode: digitsOnly });
          break;
        case 'LOCKED':
          Alert.alert('잠금', res.lockReason ?? '연속 3회 실패로 잠금되었습니다. 관리자에게 문의해 주세요.');
          break;
        case 'UNKNOWN':
        default:
          setError('등록되지 않은 사업자번호 입니다.');
      }
    } catch (e) {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={legacyGateStyles.pageGate} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={legacyGateStyles.bizBox} testID="biz-box">
            {/* 로고 영역 (legacy line 569~580) */}
            <View style={legacyGateStyles.logoBox}>
              <Text style={legacyGateStyles.logoText}>삼한공조시스템 주문서</Text>
            </View>

            {/* stepBizInput (legacy line 582~604) */}
            <Text style={legacyGateStyles.bizTitle}>사업자등록번호</Text>

            <View style={legacyGateStyles.bizFieldRow}>
              <TextInput
                style={legacyGateStyles.bizInput}
                placeholder="000-00-00000"
                placeholderTextColor={legacyVars.bizMuted}
                keyboardType="number-pad"
                maxLength={12}
                value={bizNo}
                onChangeText={(v) => setBizNo(formatBizNo(v))}
                autoFocus
                testID="biz-no-input"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? <Text style={legacyGateStyles.errorText}>{error}</Text> : null}

            <View style={styles.buttonRow}>
              <Pressable
                style={[
                  legacyGateStyles.bizButton,
                  styles.fullWidthButton,
                  (!isValid || loading) && legacyGateStyles.bizButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!isValid || loading}
                testID="biz-submit"
              >
                <Text style={legacyGateStyles.bizButtonLabel}>{loading ? '확인 중...' : '조회'}</Text>
              </Pressable>
            </View>

            {/* 안내문 영역 (legacy line 591~603) */}
            <View style={legacyGateStyles.helpBlock}>
              <View style={styles.helpItem}>
                <Text style={legacyGateStyles.helpTitle}>① 사업자 등록·승인 안내</Text>
                <Text style={legacyGateStyles.helpText}>
                  본 시스템은 최초 1회 사업자 등록 및 승인 절차 완료 후 이용 가능합니다.{'\n'}
                  사업자 번호를 기입하시고 승인 요청을 보내주시면 처리 도와드리겠습니다.{'\n'}
                  승인 관련 문의: (주)삼한공조시스템 ☎ 02-3465-1331
                </Text>
              </View>
              <View style={styles.helpItem}>
                <Text style={legacyGateStyles.helpTitle}>② 이용 환경 안내</Text>
                <Text style={legacyGateStyles.helpText}>
                  본 링크는 PC와 모바일 환경을 지원합니다.{'\n'}
                  PC 또는 모바일로 접속하여 사용하시기 바랍니다.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  fullWidthButton: {
    flex: 1,
  },
  helpItem: {
    marginBottom: 0,
  },
});
