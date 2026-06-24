package com.samhanair.logis.slip.domain.schedule;

import com.samhanair.logis.slip.domain.DeliveryTag;
import java.time.DayOfWeek;
import java.time.LocalDate;

/**
 * 출고전표 배송일정 규칙 유틸리티 (상차 M = 출고일, 하차 N = 자동 계산).
 *
 * <p>지방(REGION) / 야적(STACK) 태그만 적용. 그 외 태그는 null 반환.
 *
 * <p>하차일 N 기본 계산 규칙 (estimate-app index.ejs:15264-15273 레퍼런스 1:1):
 * <ul>
 *   <li>N = M + 1일</li>
 *   <li>N 이 일요일이면 월요일로 skip</li>
 *   <li>단, (야적 &amp;&amp; M = 토요일) 이면 N = 일요일 유지 (예외 규칙)</li>
 * </ul>
 *
 * <p>KST(Asia/Seoul) 표준 — 날짜·요일 판정은 KST 기준 {@link LocalDate} 를 사용한다
 * ({@code project_kst_timezone_standard} 메모리 참조).
 *
 * <p>인스턴스화 불가 (순수 정적 유틸). 모든 메서드는 스레드 안전.
 */
public final class DeliverySchedule {

    /** 인스턴스화 금지 — 순수 정적 유틸. */
    private DeliverySchedule() {
    }

    /**
     * 하차일 N 기본 계산.
     *
     * <p>배송일정 비적용 태그({@link #isScheduled} = false) 또는 {@code slipDate} 가 null 이면 null 반환.
     *
     * @param slipDate 상차(출고) 일자 M. null 이면 null 반환.
     * @param tag 배송 태그. null 또는 비적용 태그면 null 반환.
     * @return 하차일 N. 비적용 시 null.
     */
    public static LocalDate computeUnloadDate(LocalDate slipDate, DeliveryTag tag) {
        if (slipDate == null || !isScheduled(tag)) {
            return null;
        }
        LocalDate n = slipDate.plusDays(1);
        // N 이 일요일이면 월요일로 skip — 단 야적 && M = 토요일인 경우는 일요일 유지
        if (n.getDayOfWeek() == DayOfWeek.SUNDAY
                && !(tag == DeliveryTag.STACK && slipDate.getDayOfWeek() == DayOfWeek.SATURDAY)) {
            n = n.plusDays(1); // 일요일 → 월요일
        }
        return n;
    }

    /**
     * 특이사항 파생 라벨 계산.
     *
     * <p>규칙:
     * <ul>
     *   <li>비적용 태그 또는 {@code unloadDate} null → null</li>
     *   <li>지방(REGION) &amp;&amp; N == M(당착) → {@code "당착"}</li>
     *   <li>그 외 적용 태그 → {@code "{M일}상{N일}하"} (예: {@code "25상26하"}, leading zero 없음)</li>
     * </ul>
     *
     * <p>메모에 저장하지 않고 ({@code slipDate, unloadDate, deliveryTag}) 에서 매번 파생한다 —
     * 구조화 태그이므로 재계산·이어받기가 용이하다 (D1 설계 결정).
     *
     * @param slipDate 상차(출고) 일자 M
     * @param unloadDate 하차일 N. null 이면 null 반환.
     * @param tag 배송 태그. 비적용 태그 또는 null 이면 null 반환.
     * @return 특이사항 파생 라벨 ({@code "25상26하"} / {@code "당착"} / null)
     */
    public static String scheduleLabel(LocalDate slipDate, LocalDate unloadDate, DeliveryTag tag) {
        if (slipDate == null || unloadDate == null || !isScheduled(tag)) {
            return null;
        }
        // 지방 && N == M → 당착
        if (tag == DeliveryTag.REGION && unloadDate.isEqual(slipDate)) {
            return "당착";
        }
        // {M일}상{N일}하 (leading zero 없음)
        return slipDate.getDayOfMonth() + "상" + unloadDate.getDayOfMonth() + "하";
    }

    /**
     * 배송일정 적용 태그 여부 확인.
     *
     * <p>지방({@link DeliveryTag#REGION}) / 야적({@link DeliveryTag#STACK}) 만 true.
     *
     * @param tag 배송 태그 (null 허용)
     * @return 적용 대상이면 true
     */
    public static boolean isScheduled(DeliveryTag tag) {
        return tag == DeliveryTag.REGION || tag == DeliveryTag.STACK;
    }
}
