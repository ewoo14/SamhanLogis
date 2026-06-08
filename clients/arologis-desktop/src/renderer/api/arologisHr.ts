/**
 * 아로로지스 HR admin API (`/admin/arologis/hr/**`).
 *
 * UUID 비공개 가드: 직원은 loginId, 부서는 departmentCode 만 식별자로 사용한다.
 * 임시 비밀번호는 직원 생성 응답에서만 1회 수신하며 재조회 endpoint 는 없다.
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 아로로지스 6-롤(2026-06-08 확장). BE AdminUserRole enum 정확 일치.
 * 마스터/매니저/개발자/영업사원/회계사원/배송기사.
 */
export type ArologisRole =
  | 'AROLOGIS_MASTER'
  | 'AROLOGIS_MANAGER'
  | 'AROLOGIS_DEVELOPER'
  | 'AROLOGIS_SALES'
  | 'AROLOGIS_ACCOUNTANT'
  | 'AROLOGIS_DRIVER'

export interface EmployeeRow {
  loginId: string
  fullName: string
  position: string | null
  departmentCode: string
  departmentName: string
  hireDate: string
  terminationDate: string | null
  email: string | null
  phone: string | null
  role: ArologisRole
  active: boolean
}

export interface DepartmentRow {
  code: string
  name: string
  displayOrder: number
}

export interface RoleHistoryRow {
  previousRole: ArologisRole
  newRole: ArologisRole
  reason: string | null
  changedAt: string
  changedBy: string
}

export interface ProvisionedEmployee {
  employee: EmployeeRow
  temporaryPassword: string
}

export interface CreateEmployeeRequest {
  loginId: string
  fullName: string
  position: string | null
  departmentCode: string
  hireDate: string
  email: string | null
  phone: string | null
  role: ArologisRole
}

export interface UpdateEmployeeRequest {
  fullName: string
  position: string | null
  departmentCode: string
  email: string | null
  phone: string | null
}

export interface ChangeRoleRequest {
  role: ArologisRole
  reason: string | null
}

export interface TerminateEmployeeRequest {
  terminationDate: string
}

export interface CreateDepartmentRequest {
  code: string
  name: string
  displayOrder: number
}

export interface UpdateDepartmentRequest {
  name: string
  displayOrder: number
}

const HR_BASE = '/admin/arologis/hr'

export async function listEmployees(departmentCode?: string): Promise<EmployeeRow[]> {
  const res = await apiClient.get<ApiEnvelope<EmployeeRow[]>>(`${HR_BASE}/employees`, {
    params: departmentCode ? { departmentCode } : undefined,
  })
  return res.data.data
}

export async function createEmployee(body: CreateEmployeeRequest): Promise<ProvisionedEmployee> {
  const res = await apiClient.post<ApiEnvelope<ProvisionedEmployee>>(
    `${HR_BASE}/employees`,
    body,
  )
  return res.data.data
}

export async function updateEmployee(
  loginId: string,
  body: UpdateEmployeeRequest,
): Promise<EmployeeRow> {
  const res = await apiClient.put<ApiEnvelope<EmployeeRow>>(
    `${HR_BASE}/employees/${encodeURIComponent(loginId)}`,
    body,
  )
  return res.data.data
}

export async function changeEmployeeRole(
  loginId: string,
  body: ChangeRoleRequest,
): Promise<EmployeeRow> {
  const res = await apiClient.put<ApiEnvelope<EmployeeRow>>(
    `${HR_BASE}/employees/${encodeURIComponent(loginId)}/role`,
    body,
  )
  return res.data.data
}

export async function terminateEmployee(
  loginId: string,
  body: TerminateEmployeeRequest,
): Promise<EmployeeRow> {
  const res = await apiClient.put<ApiEnvelope<EmployeeRow>>(
    `${HR_BASE}/employees/${encodeURIComponent(loginId)}/terminate`,
    body,
  )
  return res.data.data
}

export async function listRoleHistories(loginId: string): Promise<RoleHistoryRow[]> {
  const res = await apiClient.get<ApiEnvelope<RoleHistoryRow[]>>(
    `${HR_BASE}/employees/${encodeURIComponent(loginId)}/role-histories`,
  )
  return res.data.data
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  const res = await apiClient.get<ApiEnvelope<DepartmentRow[]>>(`${HR_BASE}/departments`)
  return res.data.data
}

export async function createDepartment(body: CreateDepartmentRequest): Promise<DepartmentRow> {
  const res = await apiClient.post<ApiEnvelope<DepartmentRow>>(
    `${HR_BASE}/departments`,
    body,
  )
  return res.data.data
}

export async function updateDepartment(
  code: string,
  body: UpdateDepartmentRequest,
): Promise<DepartmentRow> {
  const res = await apiClient.put<ApiEnvelope<DepartmentRow>>(
    `${HR_BASE}/departments/${encodeURIComponent(code)}`,
    body,
  )
  return res.data.data
}

export async function deleteDepartment(code: string): Promise<void> {
  await apiClient.put<ApiEnvelope<null>>(
    `${HR_BASE}/departments/${encodeURIComponent(code)}/delete`,
  )
}
