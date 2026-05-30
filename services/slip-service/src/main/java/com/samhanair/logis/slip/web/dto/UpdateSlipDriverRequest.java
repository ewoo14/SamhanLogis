package com.samhanair.logis.slip.web.dto;

import jakarta.validation.constraints.Size;

/**
 * 전표 기사 정보 부분 수정 — DRAFT/SAVED 단계만 허용 (link-dispatch-slice).
 *
 * <p>FE {@code updateSlipDriver()} 가 호출하는 {@code PATCH /slips/{id}/driver} 의 body.
 * 출고 슬립의 배송 기사명/연락처만 부분 갱신한다. 두 필드 모두 선택 — null 이면 기존 값 보존
 * ({@link com.samhanair.logis.slip.domain.Slip#editHeader} null-보존 시맨틱과 동일).
 * driverPhone 은 한국 휴대폰 패턴 권장 (FE PhoneInput).
 *
 * @param driverName  배송 기사명 (null 이면 보존)
 * @param driverPhone 배송 기사 연락처 (null 이면 보존)
 */
public record UpdateSlipDriverRequest(
        @Size(max = 50) String driverName,
        @Size(max = 20) String driverPhone) {
}
