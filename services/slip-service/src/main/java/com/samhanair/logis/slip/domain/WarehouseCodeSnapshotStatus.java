package com.samhanair.logis.slip.domain;

/** 원천 창고 업무 code snapshot 보강의 영속 상태. */
public enum WarehouseCodeSnapshotStatus {
    /** V102 이전 행 또는 code 보강 대상이 아닌 행. */
    NOT_REQUESTED,
    /** inventory 조회를 기다리거나 일시 장애 후 재시도 대기 중. */
    PENDING,
    /** 한 worker가 lease를 소유하고 inventory 조회 중. */
    PROCESSING,
    /** inventory code 저장 완료. */
    COMPLETED,
    /** 복구 불가능한 응답으로 격리됨. 운영 조회·수동 조치 대상. */
    ABANDONED
}
