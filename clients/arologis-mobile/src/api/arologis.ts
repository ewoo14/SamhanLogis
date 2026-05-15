/**
 * arologis-service driver-app API client.
 *
 * D-AX-15 범위는 dashboard + GPS 이식만 포함한다.
 * Base URL / Authorization / refresh rotation 은 `apiFetch` 가 담당한다.
 */
import { apiFetch } from './client';

export interface DispatchVehicleSummary {
  vehicleSequence: number;
  tonnage: 'TONNAGE_1' | 'TONNAGE_1_4' | 'TONNAGE_2_5' | 'TONNAGE_5' | 'TONNAGE_BIG';
  status: 'PENDING' | 'MATCHING' | 'ASSIGNED' | 'DEPARTED' | 'DELIVERED' | 'CANCELLED';
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  code?: string;
  message?: string;
}

export async function fetchTodayDispatches(token: string | null): Promise<DispatchVehicleSummary[]> {
  const response = await apiFetch<ApiResponse<DispatchVehicleSummary[]>>(
    '/driver-app/arologis/dispatches/today',
    {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  assertApiResponseSuccess(response, '오늘의 배차');
  return response.data ?? [];
}

export interface ReportLocationPayload {
  latitude: number;
  longitude: number;
  capturedAt: string;
  source?: 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND';
}

export async function reportLocation(
  token: string | null,
  payload: ReportLocationPayload,
): Promise<{ locationId: string; capturedAt: string }> {
  const response = await apiFetch<ApiResponse<{ locationId: string; capturedAt: string }>>(
    '/driver-app/arologis/locations',
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify({
        latitude: String(payload.latitude),
        longitude: String(payload.longitude),
        capturedAt: payload.capturedAt,
        source: payload.source ?? 'APP_GPS_ACTIVE',
      }),
    },
  );
  assertApiResponseSuccess(response, 'GPS 위치 보고');
  return response.data ?? { locationId: '', capturedAt: payload.capturedAt };
}

function assertApiResponseSuccess<T>(
  response: ApiResponse<T>,
  label: string,
): asserts response is ApiResponse<T> & { success: true } {
  if (!response || typeof response !== 'object') {
    throw new ArologisApiError(0, `${label} 응답 형식 오류`);
  }
  if (response.success !== true) {
    const code = response.code ?? 'UNKNOWN';
    const message = response.message ?? `${label} 실패`;
    throw new ArologisApiError(0, `${message} (code=${code})`);
  }
}

export class ArologisApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ArologisApiError';
    this.status = status;
  }
}
