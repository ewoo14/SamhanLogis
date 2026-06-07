package com.samhanair.logis.slip.estimate.service;

import com.samhanair.logis.slip.estimate.domain.EstimateNumberSequence;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적번호 채번 — {@code yyyy/MM/dd-N} 형식.
 *
 * <p>{@link com.samhanair.logis.slip.service.SlipNumberService} 와 같은 공개 업무번호 표준을 사용한다.
 * 견적서 메뉴 자체가 업무 타입 구분자이므로 별도 prefix/zero padding 은 붙이지 않는다.
 * 동시 충돌은 날짜별 sequence row 의 {@code PESSIMISTIC_WRITE} 잠금으로 직렬화하고,
 * {@code estimates(estimate_no) WHERE is_deleted=false} partial unique 인덱스가 최종 백업이다.
 */
@Service
@RequiredArgsConstructor
public class EstimateNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final EstimateNumberSequenceRepository sequenceRepository;

    /**
     * 다음 견적번호를 채번한다 — 시퀀스 조회 → 없으면 새로 생성 → next() → {@code yyyy/MM/dd-N} 포맷.
     *
     * @param estimateDate 채번 기준 날짜
     * @return {@code yyyy/MM/dd-N} 형식 견적번호
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate estimateDate) {
        EstimateNumberSequence seq = loadOrCreateLockedSequence(estimateDate);
        int seqNo = seq.next();
        return estimateDate.format(DATE_FMT) + "-" + seqNo;
    }

    /**
     * 일자별 견적 채번 row 를 배타 잠금으로 확보한다.
     *
     * <p>기존 구현은 row 조회 후 {@code lastSeq} 를 증가시켜, 같은 날짜 견적 생성이 동시에 들어오면
     * 동일 번호를 반환할 수 있었다. 최초 row 생성은 {@code INSERT ... ON CONFLICT DO NOTHING} 으로
     * 예외 없이 수렴시키고, 이후 잠금 조회한 row 에서만 {@link EstimateNumberSequence#next()} 를
     * 호출한다.
     *
     * @param estimateDate 채번 기준 날짜
     * @return 잠금이 확보된 견적번호 시퀀스 row
     */
    private EstimateNumberSequence loadOrCreateLockedSequence(LocalDate estimateDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), estimateDate);
        return sequenceRepository.findLockedByEstimateDate(estimateDate)
                .orElseThrow(() -> new IllegalStateException("견적번호 시퀀스 생성 실패"));
    }

    /** 견적번호 문자열에서 순번 부분만 분리. */
    public int extractSeqNo(String estimateNo) {
        int dashIdx = estimateNo.lastIndexOf('-');
        return Integer.parseInt(estimateNo.substring(dashIdx + 1));
    }
}
