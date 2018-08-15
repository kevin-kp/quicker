import { Client } from "./quicker/client";
import { HttpHelper } from "./http/http0.9/http.helper";
import { QuicStream } from "./quicker/quic.stream";
import { QuickerEvent } from "./quicker/quicker.event";



let host = process.argv[2] || "127.0.0.1";
let port = process.argv[3] || 4433;
let resource = process.argv[4] || "index.html";

if (isNaN(Number(port))) {
    console.log("port must be a number: node ./mainclient.js 127.0.0.1 4433 index.html");
    process.exit(-1);
}

console.log("QUICker client connecting to " + host + ":" + port);

var httpHelper = new HttpHelper();
var client = Client.connect(host, Number(port));
client.on(QuickerEvent.CLIENT_CONNECTED, () => {
    var quicStream: QuicStream = client.request(httpHelper.createRequest(resource));
    var bufferedData = Buffer.alloc(0);

    quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
        //bufferedData = Buffer.concat([bufferedData, data]);
    });

    quicStream.on(QuickerEvent.STREAM_END, () => {
        //console.log(bufferedData.toString('utf8'));
        client.close();
    });
});

client.on(QuickerEvent.ERROR, (error: Error) => {
    console.log("error");
    console.log(error.message);
    console.log(error.stack);
});

client.once(QuickerEvent.CONNECTION_CLOSE, () => {
    /**
     * Request resource with 0-RTT in a second connection
     */
    var client2 = Client.connect(host, Number(port), {
        session: client.getSession(),
        transportparameters: client.getTransportParameters()
    }, httpHelper.createRequest(resource));
    client2.on(QuickerEvent.CLIENT_CONNECTED, () => {
        //
    });
    client2.on(QuickerEvent.CONNECTION_CLOSE, () => {
        process.exit(0);
    });
});