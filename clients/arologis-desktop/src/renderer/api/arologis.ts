/**
 * 아로로지스 admin 도메인 API 호출 (`/admin/arologis/**`).
 *
 * 현재 노출 endpoint (F4 — Driver CRUD):
 * - GET    /admin/arologis/drivers         → DriverDto[]
 * - POST   /admin/arologis/drivers         { driverCode, phoneNumber, vehicleType, name } → DriverDto
 * - PATCH  /admin/arologis/drivers/{code}  { phoneNumber?, vehicleType?, name? } → DriverDto
 * - DELETE /admin/arologis/drivers/{code}  → 204 (soft delete)
 *
 * UUID 비공개 — DriverDto 의 `id` (UUID) 는 BE 내부 식별. 화면에는 `driverCode` 만 사용.
 */
import { apiClient } from './client'

/** BE arologis-service `DriverDto` 와 1:1 — UUID `id` 는 store 만, 화면 표시 X. */
export interface DriverDto {
  /** 내부 UUID — 사용자 노출 X. PATCH/DELETE 경로에는 driverCode 사용. */
  id: string
  /** 사용자 노출 식별자 (예: "D-001"). */
  driverCode: string
  /** 활성 unique. passwordless 로그인 식별자. */
  phoneNumber: string
  vehicleType: string
  /** 표시명 (성함). */
  name: string
  /** 어플 설치 여부 — BE 가 마지막 로그인 시점에 갱신. */
  appInstalled: boolean
  /** Soft Delete 여부. */
  deleted: boolean
}

export interface CreateDriverRequest {
  driverCode: string
  phoneNumber: string
  vehicleType: string
  name: string
}

export interface UpdateDriverRequest {
  phoneNumber?: string
  vehicleType?: string
  name?: string
}

export async function listDrivers(): Promise<DriverDto[]> {
  const res = await apiClient.get<DriverDto[]>('/admin/arologis/drivers')
  return res.data
}

export async function createDriver(body: CreateDriverRequest): Promise<DriverDto> {
  const res = await apiClient.post<DriverDto>('/admin/arologis/drivers', body)
  return res.data
}

export async function updateDriver(
  driverCode: string,
  body: UpdateDriverRequest,
): Promise<DriverDto> {
  const res = await apiClient.patch<DriverDto>(
    `/admin/arologis/drivers/${encodeURIComponent(driverCode)}`,
    body,
  )
  return res.data
}

export async function deleteDriver(driverCode: string): Promise<void> {
  await apiClient.delete(
    `/admin/arologis/drivers/${encodeURIComponent(driverCode)}`,
  )
}
