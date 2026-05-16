package com.samhanair.logis.slip.estimate.service;

import com.samhanair.logis.slip.estimate.domain.EstimateNumberSequence;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적번호 채번 — {@code yyyy/MM/dd-N} 형식.
 *
 * <p>{@link com.samhanair.logis.slip.service.SlipNumberService} 와 같은 공개 업무번호 표준을 사용한다.
 * 견적서 메뉴 자체가 업무 타입 구분자이므로 별도 prefix/zero padding 은 붙이지 않는다.
 * 동시 충돌은 {@code estimates(estimate_no) WHERE is_deleted=false} partial unique 인덱스가 백업.
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
        EstimateNumberSequence seq = sequenceRepository.findByEstimateDate(estimateDate)
                .orElseGet(() -> sequenceRepository.save(EstimateNumberSequence.create(estimateDate)));
        int seqNo = seq.next();
        return estimateDate.format(DATE_FMT) + "-" + seqNo;
    }

    /** 견적번호 문자열에서 순번 부분만 분리. */
    public int extractSeqNo(String estimateNo) {
        int dashIdx = estimateNo.lastIndexOf('-');
        return Integer.parseInt(estimateNo.substring(dashIdx + 1));
    }
}
