package com.samhanair.logis.slip.audit.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 슬립 audit overlay 라이프사이클 — PR-H2 (Phase 12 Step 2).
 *
 * <p>책임 경계:
 * <ul>
 *   <li>{@link #recordOverlayPatch} — 단일 필드 변경 audit 1행 + SSE broadcast
 *       ({@code slip:edit}). diff 계산은 호출자가 수행 (service 가 entity old 값 snapshot).</li>
 *   <li>{@link #recordBatch} — 다중 필드 같은 revision_no 로 일괄 기록 (editHeader 등).
 *       slip.incrementRevision 1회 호출 후 모든 changes 에 동일 revisionNo 적용.</li>
 *   <li>{@link #listBySlip} — FE timeline 표시 (최신 revision 우선).</li>
 * </ul>
 *
 * <p><b>SSE event 형식</b> ({@code "slip:edit"}):
 * <pre>
 * {
 *   "revisionNo": 5,
 *   "actorId": "uuid",       // FE 색상 hash 용 (UUID 직접 노출 X — clientside 만)
 *   "actorName": "홍길동",    // 사용자 화면 노출
 *   "actorColor": "#3B82F6", // optional
 *   "changes": [
 *     {"fieldName":"memo","oldValue":"old","newValue":"new"},
 *     ...
 *   ]
 * }
 * </pre>
 *
 * <p><b>UUID 비공개</b>: payload 에 actorId 포함은 FE 색상 hash 의 결정성을 위해 (한 사용자 =
 * 항상 같은 색). 사용자 화면 표시는 actorName 만 사용. UUID 자체는 화면에 출력 금지.
 */
@Service
@RequiredArgsConstructor
public class SlipAuditLogService {

    /** SSE event name — 슬립 본문 수정. */
    public static final String EVENT_SLIP_EDIT = "slip:edit";

    private final SlipAuditLogRepository auditLogRepository;
    private final SlipRepository slipRepository;
    private final SlipRealtimeBroker broker;

    /**
     * 단일 필드 변경 audit 기록 + SSE broadcast.
     *
     * <p>호출 순서: service 레이어에서 (1) slip.readOverlayField(name) 으로 oldValue snapshot,
     * (2) slip.applyOverlayPatch(name, newValue) 로 mutation, (3) 본 메서드 호출.
     *
     * @param slipId 대상 슬립
     * @param actorId 수정자 UUID (audit/감사용)
     * @param actorName 수정자 표시명 (UUID 비공개 가드)
     * @param actorColor FE 색상 hex (선택)
     * @param fieldName 변경된 필드 식별자
     * @param oldValue 이전 값 (선택)
     * @param newValue 새 값 (선택)
     * @return 영속화된 SlipAuditLog
     * @throws BusinessException(NOT_FOUND) 슬립 미존재
     */
    @Transactional
    public SlipAuditLog recordOverlayPatch(UUID slipId, UUID actorId, String actorName,
                                           String actorColor, String fieldName,
                                           String oldValue, String newValue) {
        Objects.requireNonNull(slipId, "slipId 는 필수입니다");
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipId));
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = slip.incrementRevision();
        SlipAuditLog saved = auditLogRepository.save(SlipAuditLog.record(
                slipId, revisionNo, actorId, safeActorName, actorColor,
                fieldName, oldValue, newValue));
        broker.publish(slipId, EVENT_SLIP_EDIT, buildEventPayload(
                revisionNo, actorId, safeActorName, actorColor,
                List.of(new ChangeEntry(fieldName, oldValue, newValue))));
        return saved;
    }

    /**
     * 다중 필드 변경 일괄 audit 기록 + 단일 SSE broadcast.
     *
     * <p>같은 mutation (예: editHeader 한 번) 의 다중 필드 변경은 같은 revision_no 를 공유한다.
     * service 레이어가 changes 리스트를 빌드하여 본 메서드 호출 — slip 의 revisionCount 는
     * 단 1회만 +1.
     *
     * @param slipId 대상 슬립
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @param actorColor FE 색상 hex (선택)
     * @param changes 변경된 필드 리스트 (1건 이상)
     * @return 영속화된 audit log 리스트 (입력 순서 유지)
     * @throws BusinessException(NOT_FOUND) 슬립 미존재
     * @throws BusinessException(INVALID_INPUT) changes 가 비어있을 때
     */
    @Transactional
    public List<SlipAuditLog> recordBatch(UUID slipId, UUID actorId, String actorName,
                                          String actorColor, List<ChangeEntry> changes) {
        Objects.requireNonNull(slipId, "slipId 는 필수입니다");
        if (changes == null || changes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changes 가 비어있습니다 — audit 기록할 변경이 없습니다");
        }
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipId));
        String safeActorName = ActorDisplayName.resolve(actorId == null ? null : actorId.toString(), actorName);
        int revisionNo = slip.incrementRevision();
        List<SlipAuditLog> saved = new ArrayList<>(changes.size());
        for (ChangeEntry change : changes) {
            saved.add(auditLogRepository.save(SlipAuditLog.record(
                    slipId, revisionNo, actorId, safeActorName, actorColor,
                    change.fieldName(), change.oldValue(), change.newValue())));
        }
        broker.publish(slipId, EVENT_SLIP_EDIT, buildEventPayload(
                revisionNo, actorId, safeActorName, actorColor, changes));
        return saved;
    }

    /**
     * 슬립별 audit log 전체 — FE timeline 표시. 최신 revision 우선.
     *
     * @param slipId 대상 슬립
     * @return 최신순 audit log (soft-deleted 자동 제외)
     */
    @Transactional(readOnly = true)
    public List<SlipAuditLog> listBySlip(UUID slipId) {
        Objects.requireNonNull(slipId, "slipId 는 필수입니다");
        return auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId);
    }

    /**
     * SSE event payload 빌더 — TM 보완 #2 (ArgumentCaptor payload 검증) 가 본 메서드의 출력을
     * 검증한다. 일관 schema 보장.
     */
    private Map<String, Object> buildEventPayload(int revisionNo, UUID actorId, String actorName,
                                                  String actorColor, List<ChangeEntry> changes) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("revisionNo", revisionNo);
        payload.put("actorId", actorId == null ? null : actorId.toString());
        payload.put("actorName", actorName);
        payload.put("actorColor", actorColor);
        List<Map<String, Object>> changeMaps = new ArrayList<>(changes.size());
        for (ChangeEntry c : changes) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("fieldName", c.fieldName());
            m.put("oldValue", c.oldValue());
            m.put("newValue", c.newValue());
            changeMaps.add(m);
        }
        payload.put("changes", changeMaps);
        return payload;
    }

    /**
     * 변경 1건의 record 컨테이너 — 다중 필드 batch 입력 + SSE payload 일관 schema 의 단위.
     *
     * @param fieldName 필드 식별자 (≤50자)
     * @param oldValue 이전 값 (null 가능)
     * @param newValue 새 값 (null 가능, 둘 다 null 은 audit factory 가 거부)
     */
    public record ChangeEntry(String fieldName, String oldValue, String newValue) {
    }
}
