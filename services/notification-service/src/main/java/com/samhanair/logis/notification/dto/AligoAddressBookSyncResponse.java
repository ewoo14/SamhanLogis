package com.samhanair.logis.notification.dto;

import java.util.List;

/**
 * Phase 10 PR-F1 BE-1 — 알리고 주소록 sync 응답 DTO.
 *
 * <p>4 카테고리 누적 결과와 외부 전달 상태:
 * <ul>
 *   <li>{@code added} — 실제 외부 전달 후 알리고가 신규 추가한 contact 수</li>
 *   <li>{@code updated} — 실제 외부 전달 후 알리고가 갱신한 contact 수</li>
 *   <li>{@code skipped} — 알리고 측에서 중복 / 잘못된 형식 등으로 skip 된 수</li>
 *   <li>{@code failed} — chunk 단위 실패 메시지 리스트
 *       (예: "chunk#3 [first=[P-2026-0050]] HTTP 500")</li>
 *   <li>{@code deliveryStatus} — 실제 알리고 외부 전달 여부</li>
 * </ul>
 *
 * @param added 신규 추가 contact 수
 * @param updated 기존 갱신 contact 수
 * @param skipped 알리고 skip contact 수
 * @param failed 실패 chunk 메시지 리스트 (sample memo + HTTP status 포함)
 * @param deliveryStatus 실제 외부 전달 상태
 */
public record AligoAddressBookSyncResponse(int added, int updated, int skipped, List<String> failed,
                                           AligoAddressBookDeliveryStatus deliveryStatus) {

    /** 기존 4개 필드 생성 호출과의 소스 호환 — 양수 건수는 전달 완료로 해석한다. */
    public AligoAddressBookSyncResponse(int added, int updated, int skipped, List<String> failed) {
        this(added, updated, skipped, failed,
                added > 0 || updated > 0
                        ? AligoAddressBookDeliveryStatus.DELIVERED
                        : AligoAddressBookDeliveryStatus.NOT_DELIVERED);
    }
}
