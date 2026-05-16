/**
 * 내일자 전표 이미지 API 클라이언트 — PR-E1 FE-4 (Samhan Public native).
 *
 * <p>BE-1 (slip-service commit 281415f) 의
 * {@code GET /slips/next-day-image-data?date=YYYY-MM-DD} endpoint wrapper.
 *
 * <h2>호출 흐름</h2>
 * <ol>
 *   <li>{@link getNextDayImageData} — 기준 date 입력 → BE 가 date+1 활성 슬립 + chat-room/block/region
 *       5 way 정보를 묶어 응답.</li>
 *   <li>FE 단계에서 응답을 단톡방(chatRoomName) 기준으로 재그룹핑 — legacy GAS 6번 "내일자 전표 이미지"
 *       단톡방별 PNG 출력 컨셉을 화면 섹션으로 재현.</li>
 *   <li>BE 응답의 {@code blocked=true} 슬립은 자동 제외 (legacy 동작 일치). 제외 건수는 footer 안내.</li>
 * </ol>
 *
 * <h2>BE 응답 형식 (NextDaySlipImageResponse)</h2>
 * <p>BE 는 지역 그룹(regionGroups) 으로 묶어 응답하며, 슬립 entry 내부에
 * {@code chatRoomNames: string[]} 와 {@code blocked: boolean} 을 포함한다.
 * 본 클라이언트는 BE raw 응답을 그대로 노출하고, 페이지 컴포넌트가 단톡방 그룹핑을
 * 수행한다 (BE 응답 그대로 인쇄 view 로 전달 가능 — UI 자유도 유지).
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>endpoint 자체가 SALES / MANAGER / MASTER role 만 허용 (BE {@code @PreAuthorize}).</li>
 *   <li>FE 사이드바 entry / 페이지 진입 모두 동일 role 가드 적용.</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>응답 전 entry 의 사용자 노출 식별자는 {@code slipNo} / {@code partnerCode} /
 * {@code partnerName} / {@code chatRoomName} / {@code driverPhone} 만. partner_id 는
 * BE 가 응답에서 제거 (V15 partner_code snapshot 직접 사용).
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * BE {@code NextDaySlipImageResponse.SlipImageEntry} record 와 1:1.
 *
 * <p>슬립 1건의 이미지 데이터 — 단톡방 매핑 + 발송금지 flag 포함.
 */
export interface NextDaySlipEntry {
  /** 사용자 노출 전표번호 (예: 2026/05/10-1). */
  slipNo: string
  /** 출고 예정일 (YYYY-MM-DD, 응답 targetDate 와 동일). */
  slipDate: string
  /** 거래처 코드 (사용자 노출 식별자 — V15 snapshot, UUID 비공개 가드). */
  partnerCode: string | null
  /** 거래처명 (snapshot — 인쇄 양식 표시용). */
  partnerName: string | null
  /** 기사명 (배차 매핑 — 미배차 시 null). */
  driverName: string | null
  /** 기사 연락처 (사용자 노출 — SMS 발송 추적). */
  driverPhone: string | null
  /** arologis RegionClassifier 산출 그룹명 (V15 snapshot, 미분류 시 "미분류"). */
  classifiedRegionGroup: string | null
  /** 자유 메모 (출고전표 헤더 memo). */
  memo: string | null
  /** 거래처에 매핑된 단톡방명 목록 (notification-service Feign 결과). 미매핑 시 빈 배열. */
  chatRoomNames: string[]
  /** 발송금지 여부 (partner-service BLOCK 매핑). true 면 FE 가 자동 제외 + 안내. */
  blocked: boolean
}

/**
 * BE {@code NextDaySlipImageResponse.RegionGroup} record 와 1:1.
 *
 * <p>지역 그룹 1개 — region_group 별 슬립 묶음. legacy GAS 의 "내일자 전표 이미지" 의
 * 지역별 페이지에 대응. FE 는 본 응답을 단톡방 기준으로 재그룹핑하여 화면 표시.
 */
export interface NextDaySlipRegionGroup {
  regionGroup: string
  slipCount: number
  slips: NextDaySlipEntry[]
}

/**
 * BE {@code NextDaySlipImageResponse} record 와 1:1.
 *
 * @see com.samhanair.logis.slip.web.dto.NextDaySlipImageResponse
 */
export interface NextDaySlipImageResponse {
  /** 다음날 일자 (입력 date+1, YYYY-MM-DD). */
  targetDate: string
  /** 다음날자 전체 슬립 수 (legacy 카운트, blocked 포함). */
  totalSlips: number
  /** 지역 그룹별 묶음. */
  regionGroups: NextDaySlipRegionGroup[]
}

/**
 * 다음날자 전표 이미지 데이터 조회 — {@code GET /slips/next-day-image-data?date=YYYY-MM-DD}.
 *
 * <p>입력 date 의 다음날 (date+1) 활성 슬립을 단톡방 / 발송금지 / 지역 5 way join 결과로 응답.
 *
 * @param date 기준 날짜 (YYYY-MM-DD, 미지정 시 BE 가 today 적용 → 응답 = today+1)
 */
export async function getNextDayImageData(
  date?: string,
): Promise<NextDaySlipImageResponse> {
  const params: Record<string, string> = {}
  if (date && date.trim()) {
    params['date'] = date.trim()
  }
  const res = await apiClient.get<ApiEnvelope<NextDaySlipImageResponse>>(
    '/slips/next-day-image-data',
    { params },
  )
  return res.data.data
}

/**
 * 단톡방 기준 그룹핑 결과 — 페이지 / 인쇄 view 공통.
 *
 * <p>BE 응답 (지역 그룹) 을 chatRoomName 기준으로 재그룹핑한다. 한 거래처가 여러
 * 단톡방에 매핑된 경우 각 단톡방 섹션에 중복 표시 (legacy GAS 동작 일치).
 *
 * <p>단톡방 미매핑 슬립은 {@link UNASSIGNED_CHAT_ROOM} key 로 묶어 별도 안내한다.
 */
export interface NextDaySlipChatRoomGroup {
  chatRoomName: string
  partners: NextDaySlipEntry[]
}

/** 단톡방 미매핑 슬립 묶음 key — 사용자 노출 라벨. */
export const UNASSIGNED_CHAT_ROOM = '단톡방 미매핑'

/**
 * BE 응답 → 단톡방별 그룹 변환 + 발송금지 자동 제외.
 *
 * <p>legacy GAS 6번 "내일자 전표 이미지" 의 단톡방별 PNG 출력 컨셉을 client-side
 * 그룹핑으로 재현한다. 발송금지 (blocked=true) 슬립은 그룹핑에서 제외하며,
 * 제외 건수는 별도 반환하여 footer 안내에 사용한다.
 *
 * @return [chatRoomGroups, blockedExcludedCount]
 */
export function groupByChatRoom(
  response: NextDaySlipImageResponse,
): { groups: NextDaySlipChatRoomGroup[]; blockedExcludedCount: number } {
  const map = new Map<string, NextDaySlipEntry[]>()
  let blockedExcludedCount = 0

  for (const region of response.regionGroups) {
    for (const slip of region.slips) {
      if (slip.blocked) {
        blockedExcludedCount += 1
        continue
      }
      const rooms = slip.chatRoomNames.length > 0
        ? slip.chatRoomNames
        : [UNASSIGNED_CHAT_ROOM]
      for (const room of rooms) {
        const list = map.get(room) ?? []
        list.push(slip)
        map.set(room, list)
      }
    }
  }

  // 단톡방명 사전순 정렬 (UNASSIGNED 는 항상 마지막)
  const groups: NextDaySlipChatRoomGroup[] = []
  const sortedKeys = [...map.keys()]
    .filter((k) => k !== UNASSIGNED_CHAT_ROOM)
    .sort((a, b) => a.localeCompare(b, 'ko-KR'))
  for (const k of sortedKeys) {
    groups.push({ chatRoomName: k, partners: map.get(k) ?? [] })
  }
  if (map.has(UNASSIGNED_CHAT_ROOM)) {
    groups.push({
      chatRoomName: UNASSIGNED_CHAT_ROOM,
      partners: map.get(UNASSIGNED_CHAT_ROOM) ?? [],
    })
  }
  return { groups, blockedExcludedCount }
}

/**
 * 내일자 전표 이미지 페이지 / 사이드바 entry 접근 가능 여부.
 *
 * <p>BE {@code @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")} 와 1:1.
 * 사용자 명세 — DISPATCH 추가 가드는 backlog DISPATCH role 부재로 본 단계 제외.
 */
export const NEXT_DAY_SLIP_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

export function canAccessNextDaySlip(
  role: string | undefined | null,
): boolean {
  return !!role && (NEXT_DAY_SLIP_ROLES as readonly string[]).includes(role)
}
