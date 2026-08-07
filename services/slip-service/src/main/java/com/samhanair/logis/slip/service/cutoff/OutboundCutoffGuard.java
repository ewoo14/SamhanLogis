package com.samhanair.logis.slip.service.cutoff;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import com.samhanair.logis.slip.repository.cutoff.SlipOutboundCutoffRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 출고전표 배송태그별 마감 시각(컷오프) 게이트.
 *
 * <p>당일 출고전표 생성 및 배송태그 확정(editHeader) 시점에 호출된다.
 * 다음 조건 중 하나라도 해당하면 통과(게이트 미적용)한다:
 * <ul>
 *   <li>{@code tag} 또는 {@code slipDate} 가 {@code null}</li>
 *   <li>{@code slipDate} 가 오늘(KST)이 아닌 경우(미래/과거 출고 허용)</li>
 *   <li>해당 태그에 활성 마감시각이 등록되지 않은 경우(opt-in)</li>
 * </ul>
 *
 * <p>통과 조건을 모두 만족하지 않고 현재 시각(KST)이 마감 시각을 초과하면
 * {@link BusinessException}({@link ErrorCode#CONFLICT}) 을 던진다.
 *
 * <p>{@link Clock} 빈 주입으로 테스트에서 고정 시각을 제어할 수 있다
 * ({@link com.samhanair.logis.slip.config.TimeConfig} 참조).
 */
@Component
@RequiredArgsConstructor
public class OutboundCutoffGuard {

    private static final DateTimeFormatter TIME_DISPLAY = DateTimeFormatter.ofPattern("HH:mm");

    private final Clock clock;
    private final SlipOutboundCutoffRepository cutoffRepository;

    /**
     * 신규 출고전표의 날짜와 배송태그별 당일 마감을 검증한다.
     * 과거 출고일 신규 생성은 허용하지 않으며, 미래 출고일은 미리 생성할 수 있다.
     * 기존 전표 수정 경로는 {@link #assertWithinCutoff(DeliveryTag, LocalDate)}를 사용한다.
     *
     * @param tag 배송 태그
     * @param slipDate 출고일
     * @throws BusinessException(CONFLICT) 과거 출고일 신규 생성 또는 당일 마감 초과
     */
    public void assertWithinCutoffForCreation(DeliveryTag tag, LocalDate slipDate) {
        if (slipDate != null && slipDate.isBefore(LocalDate.now(clock.getZone()))) {
            throw new BusinessException(ErrorCode.CONFLICT, "과거 출고일 신규 전표는 생성할 수 없습니다");
        }
        assertWithinCutoff(tag, slipDate);
    }

    /**
     * 배송태그 + 전표날짜 기준으로 마감 시각 초과 여부를 검증한다.
     *
     * <p>다음 경우에 즉시 반환(통과)한다:
     * <ol>
     *   <li>{@code tag} 가 {@code null} — 태그 미확정 출고전표(견적변환·발행 경로)는 태그 확정 시점에 게이트</li>
     *   <li>{@code slipDate} 가 {@code null}</li>
     *   <li>{@code slipDate} 가 오늘(KST) 이 아닌 경우 — 미래/과거 날짜 전표는 차단하지 않음</li>
     *   <li>해당 태그의 활성 마감시각이 존재하지 않는 경우 — opt-in 구조</li>
     * </ol>
     *
     * <p>경계 조건: 현재 시각이 마감 시각과 <b>정확히 동일</b>한 경우는 통과한다
     * ({@code isAfter} 엄격 비교 — "초과"만 차단, 마감 정각 등록 허용).
     *
     * @param tag      배송 태그 (null 이면 즉시 통과)
     * @param slipDate 전표 날짜 (null 이면 즉시 통과)
     * @throws BusinessException(CONFLICT) 당일 출고전표이고 현재 시각이 마감 시각을 초과했을 때
     */
    public void assertWithinCutoff(DeliveryTag tag, LocalDate slipDate) {
        // opt-in: 태그 또는 날짜 미확정 경로는 통과
        if (tag == null || slipDate == null) {
            return;
        }
        // 오늘(KST) 전표가 아니면 통과 (미래 출고 미리 생성 허용)
        if (!slipDate.equals(LocalDate.now(clock.getZone()))) {
            return;
        }
        // 해당 태그의 활성 마감시각이 없으면 통과 (opt-in)
        Optional<SlipOutboundCutoff> cutoffOpt = cutoffRepository.findByDeliveryTagAndActiveTrue(tag);
        if (cutoffOpt.isEmpty()) {
            return;
        }
        SlipOutboundCutoff cutoff = cutoffOpt.get();
        LocalTime now = LocalTime.now(clock);
        if (now.isAfter(cutoff.getCutoffTime())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    tag.getKoreanLabel() + " 당일 마감("
                    + cutoff.getCutoffTime().format(TIME_DISPLAY)
                    + ") 초과 — 익일 출고로 생성하세요");
        }
    }
}
