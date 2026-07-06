package com.samhanair.logis.partner.realtime;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * 거래처 목록 레벨 실시간 동기화 채널 상수 (E2).
 *
 * <p>개별 Partner UUID 가 아닌 목록 전체 invalidate 용 well-known 합성 채널이다.
 */
public final class PartnerListRealtime {

    private PartnerListRealtime() {
    }

    /** 거래처 목록 브로드캐스트 채널 (결정적 합성 UUID). */
    public static final UUID CHANNEL_ID = UUID.nameUUIDFromBytes(
            "partner:list:changed".getBytes(StandardCharsets.UTF_8));

    /** 거래처 목록 변경 이벤트명. */
    public static final String EVENT_CHANGED = "partner:list:changed";
}
