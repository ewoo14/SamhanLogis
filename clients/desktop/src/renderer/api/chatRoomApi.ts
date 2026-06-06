/**
 * 단톡방 매핑 admin API 클라이언트 (PR-D Phase B FE-D — Samhan Public native).
 *
 * <p>BE-D ({@code notification-service} commit 9c38506) 의
 * {@code /api/v1/notification/admin/chat-rooms} 4 endpoint wrapper.
 *
 * <h2>호출 흐름</h2>
 * <ol>
 *   <li>{@link listChatRooms} — 전체 매핑 목록 조회 (chatRoomName 으로 그룹핑하기 위함).</li>
 *   <li>{@link createChatRoom} — admin 단건 등록 (source=MANUAL, partner_code 직접 입력).</li>
 *   <li>{@link importChatRoomsCsv} — 기존 "단톡방리스트" CSV multipart 업로드.</li>
 *   <li>{@link deleteChatRoom} — id 단건 soft-delete.</li>
 * </ol>
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>endpoint 자체가 MASTER / MANAGER role 만 허용 (BE {@code @PreAuthorize}).</li>
 *   <li>FE 도 호출자 화면에서 동일 가드를 적용해 메뉴/버튼 노출 자체를 제한한다.</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — 응답의 {@code id}
 * 는 mutation path key 전용이며, 사용자 노출 식별자는 {@code partnerCode} +
 * {@code partnerBusinessName} (snapshot) + {@code chatRoomName} 만 사용한다.
 *
 * <p>사용자 명시: partner_code 가 source-of-truth, business_name 은 import 시점
 * snapshot only (drift 무시) — 화면 정렬/검색은 partner_code 우선.
 */
import type { UploadResult } from '@samhan/design-system'
import { apiClient, type ApiEnvelope } from './client'

/** BE {@code MappingSource} enum 과 1:1. */
export type ChatRoomMappingSource = 'NOTION_IMPORT' | 'MANUAL'

/** 출처 → 한국어 표시 라벨 (운영자 시점 — 감사/마이그레이션 추적). */
export const CHAT_ROOM_SOURCE_LABEL: Record<ChatRoomMappingSource, string> = {
  NOTION_IMPORT: 'DB 이관 시드',
  MANUAL: '수동 등록',
}

/**
 * BE {@code ChatRoomMappingResponse} record 와 1:1.
 *
 * <p>{@code id} 는 mutation path 전용 (UUID 비공개) — 화면 표시는 비즈니스 식별자만.
 */
export interface ChatRoomMapping {
  /** UUID — DELETE path key 전용. 화면 노출 금지. */
  id: string
  partnerCode: string
  partnerBusinessName: string
  chatRoomName: string
  source: ChatRoomMappingSource
  /** 원본 생성 시각 (ISO-8601, NOTION_IMPORT 만 비-null). */
  notionCreatedAt: string | null
  /** 우리 시스템 생성 시각 (ISO-8601). */
  createdAt: string
}

/** BE {@code ChatRoomMappingCreateRequest} 와 1:1. */
export interface ChatRoomMappingCreateRequest {
  partnerCode: string
  partnerBusinessName: string
  chatRoomName: string
}

/**
 * BE {@code ChatRoomImportResult.RejectedRow} 와 1:1.
 */
export interface ChatRoomRejectedRow {
  rowNumber: number
  businessName: string
  chatRoomName: string
  reason: string
}

/**
 * BE {@code ChatRoomImportResult} record 와 1:1.
 */
export interface ChatRoomImportResult {
  inserted: number
  updated: number
  rejected: ChatRoomRejectedRow[]
}

/** 목록 조회 옵션 — partnerCode / chatRoomName 부분 필터. */
export interface ListChatRoomsOptions {
  partnerCode?: string
  chatRoomName?: string
}

/**
 * 단톡방 매핑 전체 목록 — {@code GET /api/v1/notification/admin/chat-rooms}.
 *
 * @param options partnerCode / chatRoomName 옵션 필터 (둘 다 지정 시 partnerCode 우선)
 */
export async function listChatRooms(
  options: ListChatRoomsOptions = {},
): Promise<ChatRoomMapping[]> {
  const params: Record<string, string> = {}
  if (options.partnerCode && options.partnerCode.trim()) {
    params['partnerCode'] = options.partnerCode.trim()
  } else if (options.chatRoomName && options.chatRoomName.trim()) {
    params['chatRoomName'] = options.chatRoomName.trim()
  }
  const res = await apiClient.get<ApiEnvelope<ChatRoomMapping[]>>(
    '/api/v1/notification/admin/chat-rooms',
    { params },
  )
  return res.data.data
}

/**
 * 단건 매핑 등록 — {@code POST /api/v1/notification/admin/chat-rooms}.
 *
 * <p>사용자 명시: partner_code 직접 입력 (사업자명 lookup 우회). business_name 은
 * 화면 표시용 snapshot. 활성 (partner_code, chat_room_name) 중복 시 BE 가 409.
 */
export async function createChatRoom(
  req: ChatRoomMappingCreateRequest,
): Promise<ChatRoomMapping> {
  const res = await apiClient.post<ApiEnvelope<ChatRoomMapping>>(
    '/api/v1/notification/admin/chat-rooms',
    req,
  )
  return res.data.data
}

/**
 * 기존 CSV 일괄 import — {@code POST /api/v1/notification/admin/chat-rooms/import}.
 *
 * <p>{@code CsvUploadDialog} 의 {@code onUpload} 시그니처에 맞춰 {@link UploadResult}
 * 형태로 reject 보고서를 변환한다 ({@code 사업자명} / {@code 단톡방이름} 컬럼).
 *
 * @param file 사용자가 선택한 CSV 파일 (UTF-8, BOM 허용, 5MB 이하 권장)
 */
export async function importChatRoomsCsv(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<ApiEnvelope<ChatRoomImportResult>>(
    '/api/v1/notification/admin/chat-rooms/import',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 대용량 CSV 대비 — apiClient 기본 10s 보다 여유.
      timeout: 60_000,
    },
  )
  const data = res.data.data
  return {
    inserted: data.inserted,
    updated: data.updated,
    rejected: data.rejected.map((r) => ({
      rowNumber: r.rowNumber,
      inputData: {
        사업자명: r.businessName,
        단톡방이름: r.chatRoomName,
      },
      reason: r.reason,
    })),
  }
}

/**
 * 단톡방 매핑 soft-delete — {@code DELETE /api/v1/notification/admin/chat-rooms/{id}}.
 *
 * <p>{@code id} 는 admin 화면 내부 한정 (UUID 비공개 — 화면 표시 금지, mutation 전용).
 *
 * @param id 매핑 UUID (목록 응답의 {@code id} 필드)
 */
export async function deleteChatRoom(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/api/v1/notification/admin/chat-rooms/${id}`,
  )
}
