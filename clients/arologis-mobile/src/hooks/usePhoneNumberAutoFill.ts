/**
 * usePhoneNumberAutoFill — D-AX-14 (2026-05-14 사용자 결정).
 *
 * 기사 어플 첫 실행 시 본인 휴대번호 자동 인식 흐름:
 *
 * 1) **SecureStore 우선** — 이전 로그인 성공 시 저장된 번호 (`arologis.driver.phoneNumber`)
 *    가 있으면 그것을 사용. 즉시 `autoFilled = true` 로 1-tap 로그인 가능.
 *
 * 2) **Android `READ_PHONE_NUMBERS` 권한 요청** (SecureStore 미존재 시):
 *    `PermissionsAndroid.request` 로 권한 요청 → 승인 시
 *    `react-native-device-info` 의 `getPhoneNumber()` 호출 → 자동 채움.
 *    (EAS Build dev client 의무 — Expo Go 에서는 native module 미가용 → 수동 입력 fallback)
 *
 * 3) **iOS 또는 권한 거부**: native 폰번호 read 불가 (Apple 정책 / 사용자 거부)
 *    → 수동 입력 fallback (`autoFilled = false`).
 *
 * 4) 로그인 성공 시 호출자가 `saveAutoFillNumber(value)` 로 SecureStore 에 저장.
 *    다음 실행부터는 (1) 흐름으로 즉시 1-tap.
 *
 * UX 정책:
 * - 자동 인식 = 010-XXXX-XXXX 형식 정규화 (앞 공백/하이픈 제거, +82 prefix 처리)
 * - 권한 요청 dialog 한국어 (rationale)
 * - 권한 거부 = 어플 사용 불가 X (수동 입력 fallback 가능, GPS 와 다름)
 *
 * 참고: D-AX-09 (passwordless) 그대로 유지 — 본 hook 은 phoneNumber 의 *입력 방법* 만 자동화.
 * BE 검증 (사전 등록 기사 매칭 / 미등록 401) 로직 변경 X.
 */
import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'arologis.driver.phoneNumber';

/**
 * 한국 휴대번호 정규화 — `+82-10-1234-5678` 또는 `01012345678` 입력을
 * `010-1234-5678` 형식으로 통일.
 */
export function normalizeKorean(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (digits.startsWith('82')) {
    local = '0' + digits.substring(2);
  }
  if (local.length === 10 && local.startsWith('010')) {
    return `${local.substring(0, 3)}-${local.substring(3, 6)}-${local.substring(6)}`;
  }
  if (local.length === 11 && local.startsWith('010')) {
    return `${local.substring(0, 3)}-${local.substring(3, 7)}-${local.substring(7)}`;
  }
  return local; // 010 외 / 길이 부적합 = 원본 반환 (수동 입력 검증 위임)
}

export interface PhoneAutoFillResult {
  phoneNumber: string;
  autoFilled: boolean;
  source: 'secure-store' | 'android-native' | 'manual-fallback';
  permissionAsked: boolean;
}

/**
 * 첫 마운트 시 SecureStore → Android native → fallback 순으로 시도.
 */
export function usePhoneNumberAutoFill(): {
  result: PhoneAutoFillResult;
  loading: boolean;
  override: (value: string) => void;
} {
  const [result, setResult] = useState<PhoneAutoFillResult>({
    phoneNumber: '',
    autoFilled: false,
    source: 'manual-fallback',
    permissionAsked: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) SecureStore
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored && !cancelled) {
          setResult({
            phoneNumber: stored,
            autoFilled: true,
            source: 'secure-store',
            permissionAsked: false,
          });
          setLoading(false);
          return;
        }
      } catch {
        // SecureStore 실패 = 다음 단계
      }

      // 2) Android native (`READ_PHONE_NUMBERS` + react-native-device-info)
      if (Platform.OS === 'android') {
        try {
          const readPhoneNumbersPermission =
            PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS ?? 'android.permission.READ_PHONE_NUMBERS';
          const granted = await PermissionsAndroid.request(
            readPhoneNumbersPermission,
            {
              title: '본인 휴대전화 번호 자동 인식',
              message:
                '아로로지스 기사 어플은 본인 번호를 자동으로 입력하기 위해 휴대전화 번호 권한이 필요합니다.\n\n거부하시면 수동 입력 화면이 표시됩니다.',
              buttonPositive: '허용',
              buttonNegative: '거부 (수동 입력)',
            },
          );
          if (cancelled) return;
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            try {
              // EAS Build dev client 의무 — Expo Go 에서는 require 실패 → catch
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const DeviceInfo = require('react-native-device-info').default;
              const raw = await DeviceInfo.getPhoneNumber();
              const normalized = normalizeKorean(raw);
              if (normalized) {
                setResult({
                  phoneNumber: normalized,
                  autoFilled: true,
                  source: 'android-native',
                  permissionAsked: true,
                });
                setLoading(false);
                return;
              }
            } catch {
              // native module 미가용 (Expo Go) → fallback
            }
          }
          // 거부 또는 native 미가용 → fallback
          setResult({
            phoneNumber: '',
            autoFilled: false,
            source: 'manual-fallback',
            permissionAsked: true,
          });
          setLoading(false);
          return;
        } catch {
          // 권한 요청 자체 실패 → fallback
        }
      }

      // 3) iOS or 그 외 — 수동 입력 fallback
      if (!cancelled) {
        setResult({
          phoneNumber: '',
          autoFilled: false,
          source: 'manual-fallback',
          permissionAsked: false,
        });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const override = (value: string): void => {
    setResult((prev) => ({
      ...prev,
      phoneNumber: value,
      autoFilled: false,
      source: 'manual-fallback',
    }));
  };

  return { result, loading, override };
}

/**
 * 로그인 성공 시 호출 — 다음 실행부터 1-tap 로그인 가능.
 */
export async function saveAutoFillNumber(value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, value);
  } catch {
    // SecureStore 실패 시 silent — 다음 실행은 권한 요청부터 다시
  }
}

/**
 * 로그아웃 시 호출 (선택) — secure store 의 phoneNumber 제거.
 */
export async function clearAutoFillNumber(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // silent
  }
}
