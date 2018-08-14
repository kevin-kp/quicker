import { Bignum } from '../../types/bignum';


export class BaseProperty {

    private property: Bignum;

    public constructor(bn: Bignum);
    public constructor(number: number, byteSize?: number);
    public constructor(buffer: Buffer, byteSize?: number);
    public constructor(obj: any, byteSize: number = 4) {
        if (obj instanceof Bignum) {
            this.property = obj;
        } else {
            this.property = new Bignum(obj, byteSize);
        }
    }

    protected getProperty(): Bignum {
        return this.property;
    }

    protected setProperty(bignum: Bignum) {
        this.property = bignum;
    }

    public toBuffer(): Buffer {
        return this.property.toBuffer();
    }

    public toString(): string {
        return this.property.toString("hex");
    }
}

export class ConnectionID extends BaseProperty {

    private length: number;

    public constructor(buffer: Buffer, length: number) {
        super(buffer, length);
        this.length = length;
    }

    public getValue(): Bignum {
        return this.getProperty();
    }

    public setValue(bignum: Bignum) {
        this.setProperty(bignum);
        this.length = bignum.getByteLength();
    }

    public getLength(): number {
        return this.length;
    }

    // REFACTOR TODO: override the toBuffer() method and only include the connectionID length in there, instead of in the randomConnectionID function, see below
    // in the current setup, if you create a new ConnectionID yourself, the serialization into Short header won't be correct!!! 
    // although, take care here: that is actually what you want if you use this to just hold the other party's connectionID, which might use a different logic!!!
    // -> so check the logic when SENDING packets and how we fill the ConnectionID there before manhandling this  

    public static randomConnectionID(): ConnectionID {
        var len = Math.round(Math.random() * 14) + 3;
        var highHex = "";
        for (var i = 0; i < len; i++) {
            highHex += "ff";
        }
        var randomBignum = Bignum.random(highHex, len);
        var randomBuffer = randomBignum.toBuffer();
        var length = randomBuffer.byteLength + 1;
        var buf = Buffer.alloc(length);
        buf.writeUInt8(length, 0);
        randomBuffer.copy(buf, 1);
        return new ConnectionID(buf, length);
    }
}

export class PacketNumber extends BaseProperty {

    public constructor(number: number);
    public constructor(buffer: Buffer);
    public constructor(buffer: any) {
        super(buffer, 8);
    }

    public getValue(): Bignum {
        return this.getProperty();
    }

    public setValue(bignum: Bignum) {
        bignum.setByteLength(8);
        this.setProperty(bignum);
    }

    public getMostSignificantBytes(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 0, size);
        return buf;
    }

    public getLeastSignificantBytes(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 8 - size, 8);
        return buf;
    }
    /**
     *  DecodePacketNumber(largest_pn, truncated_pn, pn_nbits):
        expected_pn  = largest_pn + 1
        pn_win       = 1 << pn_nbits
        pn_hwin      = pn_win / 2
        pn_mask      = pn_win - 1
        // The incoming packet number should be greater than
        // expected_pn - pn_hwin and less than or equal to
        // expected_pn + pn_hwin
        //
        // This means we can't just strip the trailing bits from
        // expected_pn and add the truncated_pn because that might
        // yield a value outside the window.
        //
        // The following code calculates a candidate value and
        // makes sure it's within the packet number window.
        candidate_pn = (expected_pn & ~pn_mask) | truncated_pn
        if candidate_pn <= expected_pn - pn_hwin:
            return candidate_pn + pn_win
        // Note the extra check for underflow when candidate_pn
        // is near zero.
        if candidate_pn > expected_pn + pn_hwin and
            candidate_pn > pn_win:
            return candidate_pn - pn_win
        return candidate_pn
     * @param packetNumber 
     * @param size 
     */
    public adjustNumber(packetNumber: PacketNumber, size: number) {
        var pnMask = new Bignum(1);
        for (var i = 0; i < 63; i++) {
            pnMask = pnMask.shiftLeft(1);
            if (63 - i > (size * 8)) {
                pnMask = pnMask.add(1);
            }
        }
        var expectedPn = this.getValue().add(1);
        var pnWin = new Bignum(1).shiftLeft(this.getBitSize(size));
        var pnHWin = pnWin.divide(2);
        var maskedResult = expectedPn.and(pnMask);
        var candidatePn = packetNumber.getValue().mask(size);
        candidatePn = candidatePn.add(maskedResult);
        if (candidatePn.lessThanOrEqual(expectedPn.subtract(pnHWin))) {
            return candidatePn.add(pnWin);
        }
        if (candidatePn.greaterThan(expectedPn.add(pnHWin)) && candidatePn.greaterThan(pnWin)) {
            return candidatePn.subtract(pnWin);
        }
        return candidatePn;
    }

    private getBitSize(size: number) 
    {
        if (size == 1)
            return 7;
        if (size == 2)
            return 14;
        return 30;
    }
}


export class Version extends BaseProperty {

    public constructor(buffer: Buffer) {
        super(buffer);
    }

    public getValue(): Bignum {
        return this.getProperty();
    }

    public setValue(bignum: Bignum) {
        this.setProperty(bignum);
    }
}