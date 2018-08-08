import { EventEmitter } from "events";
import { Constants } from "../utilities/constants";
import { Bignum } from "../types/bignum";
import { BasePacket } from "../packet/base.packet";
import { Connection, ConnectionEvent } from "../quicker/connection";
import { LossDetection, LossDetectionEvents } from "../loss-detection/loss.detection";
import { Socket } from "dgram";
import { PacketLogging } from "../utilities/logging/packet.logging";
import { randomBytes } from "crypto";
import { FrameFactory } from "../utilities/factories/frame.factory";
import { PacketFactory } from "../utilities/factories/packet.factory";
import { PacketNumber } from "../packet/header/header.properties";
import { HandshakeState } from "../crypto/qtls";


export class CongestionControl extends EventEmitter {

    private connection: Connection;
    private packetsQueue: BasePacket[];

    ///////////////////////////
    // Constants of interest
    ///////////////////////////

    // The default max packet size used for calculating default and minimum congestion windows.
    private static DEFAULT_MSS: number = 1460;
    // Default limit on the amount of outstanding data in bytes.
    private static INITIAL_WINDOW: number = CongestionControl.DEFAULT_MSS * 10;
    // Default minimum congestion window.
    private static MINIMUM_WINDOW: number = CongestionControl.DEFAULT_MSS * 2;
    // Reduction in congestion window when a new loss event is detected.
    private static LOSS_REDUCTION_FACTOR: number = 0.5;

    ///////////////////////////
    // Variables of interest
    ///////////////////////////

    // The sum of the size in bytes of all sent packets
    // that contain at least one retransmittable or PADDING frame, and
    // have not been acked or declared lost.  The size does not include
    // IP or UDP overhead.  Packets only containing ACK frames do not
    // count towards byte_in_flight to ensure congestion control does not
    // impede congestion feedback.
    private bytesInFlight: Bignum;
    // Maximum number of bytes in flight that may be sent.
    private congestionWindow: Bignum;
    // The largest packet number sent when QUIC detects a loss.
    // When a larger packet is acknowledged, QUIC exits recovery.
    private endOfRecovery: Bignum;
    // Slow start threshold in bytes.  When the congestion window
    // is below ssthresh, the mode is slow start and the window grows by
    // the number of bytes acknowledged.
    private sshtresh: Bignum;

    public constructor(connection: Connection, lossDetection: LossDetection) {
        super();
        this.connection = connection;
        this.congestionWindow = new Bignum(CongestionControl.INITIAL_WINDOW);
        this.bytesInFlight = new Bignum(0);
        this.endOfRecovery = new Bignum(0);
        this.sshtresh = Bignum.infinity();
        this.packetsQueue = [];
        this.hookCongestionControlEvents(lossDetection);
    }

    private hookCongestionControlEvents(lossDetection: LossDetection) {
        lossDetection.on(LossDetectionEvents.PACKET_ACKED, (ackedPacket: BasePacket) => {
            this.onPacketAcked(ackedPacket);
        });
        lossDetection.on(LossDetectionEvents.PACKETS_LOST, (lostPackets: BasePacket[]) => {
            this.onPacketsLost(lostPackets);
        });
        lossDetection.on(LossDetectionEvents.RETRANSMISSION_TIMEOUT_VERIFIED, () => {
            this.onRetransmissionTimeoutVerified();
        });
        this.connection.on(ConnectionEvent.PACKET_SENT, (sentPacket: BasePacket) => {
            this.onPacketSent(sentPacket);
        });
    }


    public inRecovery(packetNumber: Bignum): boolean {
        return packetNumber.lessThanOrEqual(this.endOfRecovery);
    }

    private onPacketSent(packetSent: BasePacket) {
        if (!packetSent.isAckOnly()) {
            var bytesSent = packetSent.toBuffer(this.connection).byteLength;
            // Add bytes sent to bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.add(bytesSent);
        }
    }


    private onPacketAcked(ackedPacket: BasePacket) {
        if (ackedPacket.isAckOnly())
            return;

        var packetByteSize = ackedPacket.toBuffer(this.connection).byteLength;
        // Remove from bytesInFlight.
        this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
        if (this.inRecovery(ackedPacket.getHeader().getPacketNumber().getValue())) {
            // Do not increase congestion window in recovery period.
            return;
        }
        if (this.congestionWindow.lessThan(this.sshtresh)) {
            // Slow start
            this.congestionWindow = this.congestionWindow.add(packetByteSize);
        } else {
            // Congestion avoidance
            this.congestionWindow = this.congestionWindow.add(new Bignum(CongestionControl.DEFAULT_MSS * packetByteSize).divide(this.congestionWindow));
        }
        this.sendPackets();
    }

    private onPacketsLost(lostPackets: BasePacket[]) {
        var largestLost = new Bignum(0);
        lostPackets.forEach((lostPacket: BasePacket) => {
            if (lostPacket.isAckOnly())
                return;
            var packetByteSize = lostPacket.toBuffer(this.connection).byteLength;
            // Remove lost packets from bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
            if (lostPacket.getHeader().getPacketNumber().getValue().greaterThan(largestLost)) {
                largestLost = lostPacket.getHeader().getPacketNumber().getValue();
            }
        });
        // Start a new recovery epoch if the lost packet is larger
        // than the end of the previous recovery epoch.
        if (!this.inRecovery(largestLost)) {
            this.endOfRecovery = largestLost;
            this.congestionWindow = this.congestionWindow.multiply(CongestionControl.LOSS_REDUCTION_FACTOR);
            this.congestionWindow = Bignum.max(this.congestionWindow, CongestionControl.MINIMUM_WINDOW);
            this.sshtresh = this.congestionWindow;
        }
        this.sendPackets();
    }

    private onRetransmissionTimeoutVerified() {
        this.congestionWindow = new Bignum(CongestionControl.MINIMUM_WINDOW);
    }


    public queuePackets(packets: BasePacket[]) {
        this.packetsQueue = this.packetsQueue.concat(packets);
        this.sendPackets();
    }

    private sendPackets() {
        // TODO: allow coalescing of certain packets:
        // https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.6
        while (this.bytesInFlight.lessThan(this.congestionWindow) && this.packetsQueue.length > 0) {
            var packet: BasePacket | undefined = this.packetsQueue.shift();
            if (packet !== undefined) {
                packet.getHeader().setPacketNumber(this.connection.getNextPacketNumber());
                this.connection.getSocket().send(randomBytes(packet.getSize()), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
                this.emit(CongestionControlEvents.PACKET_SENT, packet);
            }
        }
    }


    private createCoalescedLargeDatagram() {
        var max_udp_size = 1280;
        var current_size = 0;
        var packets: BasePacket[] = [];
        var frame = FrameFactory.createPaddingFrame(1);
        var hsPacket = PacketFactory.createHandshakePacket(this.connection, [frame]);
        var next_size = hsPacket.getSize();
        while (next_size < max_udp_size) {
            hsPacket.getHeader().setPacketNumber(new PacketNumber(this.connection.getNextPacketNumber().toBuffer()));
            current_size += hsPacket.toBuffer(this.connection).byteLength;
            next_size = current_size;
            packets.push(hsPacket);
            this.emit(CongestionControlEvents.PACKET_SENT, hsPacket);
            var hsPacket = PacketFactory.createHandshakePacket(this.connection, [frame]);
            next_size += hsPacket.getSize();
        }

        return this.coalescedPacketsToBuffer(current_size, packets);
    }

    private coalescedPacketsToBuffer(size: number, packets: BasePacket[]) {
        var buf = Buffer.alloc(size);
        var offset = 0;
        packets.forEach((packet: BasePacket) => {
            var packetBuffer = packet.toBuffer(this.connection);
            packetBuffer.copy(buf, offset);
            offset += packetBuffer.byteLength;
        });
        return buf;
    }
}

export enum CongestionControlEvents {
    PACKET_SENT = 'cc-packet-sent'
}