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
 * S1 은 presence 와 같은 노드-로컬 in-memory 제약을 갖는다.
 */
@Service
public class SlipCoeditService {

    public static final String EVENT_UPDATE = "coedit:update";
    public static final String EVENT_AWARENESS = "coedit:awareness";

    private static final int MAX_UPDATES_PER_SLIP = 5_000;

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
        updates.add(normalized);
        if (updates.size() > MAX_UPDATES_PER_SLIP) {
            // TODO(live-coediting-S2): BE 가 Yjs 를 실행하지 않는 S1 에서는 안전 압축 불가.
            // persist/merge 슬라이스에서 update compaction 을 도입한다.
            updates.remove(0);
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
        try {
            Base64.getDecoder().decode(normalized);
            return normalized;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "base64 payload 형식이 올바르지 않습니다");
        }
    }
}
