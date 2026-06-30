package com.samhanair.logis.slip.revision.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse.FieldRedline;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse.Layer;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse.FieldChange;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * S2d-1 저장 revision 기반 셀 인라인 레드라인 계산 서비스.
 *
 * <p>임계 전이 시점에 고정한 {@code redline_anchor_revision_no} 이후의
 * {@code slip_revisions} 인접 스냅샷을 S2b fieldChanges 로 비교하고, 필드별 layer 를
 * 오래된 값부터 최신 값까지 누적한다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SlipRedlineService {

    private final SlipRepository slipRepository;
    private final SlipRevisionRepository revisionRepository;
    private final SlipRevisionService revisionService;

    /**
     * 전표의 anchor 이후 누적 레드라인을 계산한다.
     *
     * @param slipId 대상 전표 UUID
     * @return anchor 미존재 시 {@code anchored=false}, 존재 시 변경 필드 layer 목록
     */
    public SlipRedlineResponse computeRedline(UUID slipId) {
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        Integer anchor = slip.getRedlineAnchorRevisionNo();
        if (anchor == null) {
            return new SlipRedlineResponse(false, List.of());
        }

        List<SlipRevision> revisions = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).stream()
                .filter(revision -> revision.getRevisionNo() != null && revision.getRevisionNo() >= anchor)
                .sorted(Comparator.comparingInt(SlipRevision::getRevisionNo))
                .toList();
        if (revisions.size() <= 1) {
            return new SlipRedlineResponse(true, List.of());
        }

        Map<String, FieldBuilder> fields = new LinkedHashMap<>();
        for (int i = 1; i < revisions.size(); i++) {
            SlipRevision prev = revisions.get(i - 1);
            SlipRevision cur = revisions.get(i);
            String actorName = revisionService.safeActorName(cur.getActorName());
            String actorColor = revisionService.resolveActorColor(cur);
            List<FieldChange> changes = revisionService.fieldChanges(
                    prev.getSnapshot(), cur.getSnapshot(), actorName, actorColor, cur.getCreatedAt());
            for (FieldChange change : changes) {
                // S2d-1: 헤더 필드 한정(안정 fieldPath). 라인 셀(lines[i].*)은 행 인덱스 누적 misattribution
                // (anchor 後 라인 삽입/삭제/재정렬 시 productId 혼입·이력손실) + 단가/합계 snapshot VAT 제외
                // 불일치로 본 슬라이스 redline 비대상. 라인 셀 redline(productId 안정키+VAT 정합)은 S2d-1b 후속.
                if (change.fieldPath().startsWith("lines")) {
                    continue;
                }
                FieldBuilder builder = fields.computeIfAbsent(change.fieldPath(),
                        ignored -> new FieldBuilder(change.fieldPath(), change.label()));
                if (builder.layers.isEmpty()) {
                    builder.layers.add(new Layer(change.beforeValue(), null, null, null));
                }
                builder.layers.add(new Layer(change.afterValue(), change.actorName(),
                        change.actorColor(), change.changedAt()));
            }
        }

        List<FieldRedline> result = fields.values().stream()
                .filter(builder -> builder.layers.size() >= 2)
                .map(FieldBuilder::toResponse)
                .toList();
        return new SlipRedlineResponse(true, result);
    }

    private static final class FieldBuilder {
        private final String fieldPath;
        private final String label;
        private final List<Layer> layers = new ArrayList<>();

        private FieldBuilder(String fieldPath, String label) {
            this.fieldPath = fieldPath;
            this.label = label;
        }

        private FieldRedline toResponse() {
            return new FieldRedline(fieldPath, label, List.copyOf(layers));
        }
    }
}
