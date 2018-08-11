import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export class HttpHelper {

    public createRequest(req: string): Buffer {
        var requestString = "GET ";
        if (req.indexOf('/') !== 0) {
            requestString += '/';
        }
        requestString += req;
        if (!req.endsWith('\n')) {
            requestString += "\n";
        }
        return Buffer.from(requestString);
    }

    public handleRequest(data: Buffer): Buffer {
        var request = this.parse(data);
        var file = resolve(__dirname) + "/www" + request;
        if (!existsSync(file)) {
            file = resolve(__dirname) + "/www/notfound.html";
        }
        return readFileSync(file);
    }

    private parse(data: Buffer) {
        var request = data.toString('utf8');
        request = request.split('\n').join('').split('\r').join('');
        if (request.endsWith('/')) {
            request += "index.html";
        }
        return request.toLowerCase().replace('get ','');
    }
}