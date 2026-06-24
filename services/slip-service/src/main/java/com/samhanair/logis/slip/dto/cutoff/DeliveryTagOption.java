package com.samhanair.logis.slip.dto.cutoff;

import com.samhanair.logis.slip.domain.DeliveryTag;

/**
 * 배송 태그 선택 옵션 DTO — FE 드롭다운 바인딩용.
 *
 * @param tag   {@link DeliveryTag} enum 이름
 * @param label 한국어 표시 라벨
 */
public record DeliveryTagOption(DeliveryTag tag, String label) {

    /** {@link DeliveryTag} 로부터 옵션을 생성한다. */
    public static DeliveryTagOption from(DeliveryTag tag) {
        return new DeliveryTagOption(tag, tag.getKoreanLabel());
    }
}
