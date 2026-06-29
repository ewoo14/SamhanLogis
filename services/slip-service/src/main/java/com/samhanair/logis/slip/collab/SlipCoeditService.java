package com.samhanair.logis.slip.collab;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;

/**
 * 전표 협업 텍스트 CRDT update relay.
 *
 * <p>서버는 Yjs update 를 해석하지 않고 opaque base64 byte 로만 저장·중계한다.
 * <p><b>운영 제약(S1)</b>: 노드-로컬 in-memory 라 서비스 재시작 시 누적 update 가 소실되고,
 * 슬립 삭제 시에도 entry 가 자동 회수되지 않는다(TTL/eviction·persist 는 live-coediting-S2 도입). 다중 노드는
 * sticky-session 또는 registry 외부화 필요(presence 동일). payload 는 {@link #MAX_PAYLOAD_LENGTH}
 * 로 제한해 메모리/대역폭 폭증(DoS)을 방지한다.
 */
@Service
public class SlipCoeditService {

    public static final String EVENT_UPDATE = "coedit:update";
    public static final String EVENT_AWARENESS = "coedit:awareness";

    private static final int MAX_UPDATES_PER_SLIP = 5_000;
    /** base64 payload 1건 최대 길이(문자, 약 128KB) — 초과 시 거부해 메모리/대역폭 DoS 방지(리뷰 BE B-1). */
    private static final int MAX_PAYLOAD_LENGTH = 128 * 1024;
    private static final int MAX_TOTAL_PAYLOAD_LENGTH_PER_SLIP = 1024 * 1024;

    private final RealtimeBroker broker;
    private final Map<UUID, CopyOnWriteArrayList<String>> updatesBySlip = new ConcurrentHashMap<>();

    public SlipCoeditService(RealtimeBroker broker) {
        this.broker = broker;
    }

    /** base64 Yjs update 를 누적하고 같은 slip collab SSE 채널로 중계한다. */
    public void appendUpdate(UUID slipId, String update) {
        String normalized = requireBase64(update, "coedit update 는 필수입니다");
        CopyOnWriteArrayList<String> updates = updatesBySlip.computeIfAbsent(
                slipId, ignored -> new CopyOnWriteArrayList<>());
        // 서버가 Yjs update 를 병합하지 않는 S1 에서는 prefix update 삭제 시 신규 접속자 snapshot 계약이 깨진다.
        // cap 초과는 기존 누적 snapshot 을 보존한 채 거부하고, compaction/persist 는 S2 에서 도입한다.
        synchronized (updates) {
            if (updates.size() >= MAX_UPDATES_PER_SLIP
                    || totalPayloadLength(updates) + normalized.length() > MAX_TOTAL_PAYLOAD_LENGTH_PER_SLIP) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "coedit snapshot 누적 한도를 초과했습니다");
            }
            updates.add(normalized);
        }
        broker.publish(slipId, EVENT_UPDATE, Map.of("update", normalized));
    }

    /** 신규 접속자의 Y.Doc 재구성을 위한 누적 update snapshot. */
    public List<String> listUpdates(UUID slipId) {
        return new ArrayList<>(updatesBySlip.getOrDefault(slipId, new CopyOnWriteArrayList<>()));
    }

    /** cursor/selection awareness 는 저장하지 않고 동일 SSE 채널로만 중계한다. */
    public void publishAwareness(UUID slipId, String awareness) {
        String normalized = requireBase64(awareness, "coedit awareness 는 필수입니다");
        broker.publish(slipId, EVENT_AWARENESS, Map.of("awareness", normalized));
    }

    private String requireBase64(String value, String blankMessage) {
        String normalized = value == null ? null : value.trim();
        if (normalized == null || normalized.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, blankMessage);
        }
        if (normalized.length() > MAX_PAYLOAD_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "coedit payload 가 허용 크기를 초과했습니다");
        }
        try {
            Base64.getDecoder().decode(normalized);
            return normalized;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "base64 payload 형식이 올바르지 않습니다");
        }
    }

    private static int totalPayloadLength(List<String> updates) {
        int total = 0;
        for (String update : updates) {
            total += update.length();
        }
        return total;
    }
}
