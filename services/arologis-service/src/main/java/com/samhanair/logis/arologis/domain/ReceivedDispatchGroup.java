package com.samhanair.logis.arologis.domain;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
@Entity @Getter @Table(name="received_dispatch_groups") @NoArgsConstructor(access=AccessLevel.PROTECTED) @SQLRestriction("is_deleted = false")
public class ReceivedDispatchGroup extends BaseEntity {
    @Id @UuidGenerator @Column(nullable=false,updatable=false) private UUID id;
    @Column(name="group_no",nullable=false,length=50) private String groupNo;
    @Column(name="dispatch_date",nullable=false) private LocalDate dispatchDate;
    @Column(name="vehicle_label",nullable=false,length=100) private String vehicleLabel;
    @Column(name="carrier_code",nullable=false,length=50) private String carrierCode;
    @Column(name="carrier_name",nullable=false,length=100) private String carrierName;
    @Column(name="slip_snapshot",nullable=false,columnDefinition="TEXT") private String slipSnapshot;
    public static ReceivedDispatchGroup receive(String no,LocalDate date,String vehicle,String code,String name,String snapshot){ReceivedDispatchGroup g=new ReceivedDispatchGroup();g.groupNo=no;g.dispatchDate=date;g.vehicleLabel=vehicle;g.carrierCode=code;g.carrierName=name;g.slipSnapshot=snapshot;return g;}
    public void replaceSnapshot(LocalDate date, String vehicle, String code, String name, String snapshot) { this.dispatchDate=date; this.vehicleLabel=vehicle; this.carrierCode=code; this.carrierName=name; this.slipSnapshot=snapshot; }
}
