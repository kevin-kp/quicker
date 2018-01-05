import {BaseFrame} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {PacketType} from '../base.packet';
import {Connection} from '../../types/connection';
import {Constants} from '../../utilities/constants';
import {PaddingFrame} from '../../frame/general/padding';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class ClientInitialPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Initial,header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().clearTextEncrypt(connection, header, dataBuffer, connection.getEndpointType());
    }
}