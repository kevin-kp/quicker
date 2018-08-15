import { EventEmitter } from "events";
import { clearTimeout } from "timers";


export class Alarm extends EventEmitter {

    private timer!: NodeJS.Timer;
    private running: boolean;

    public constructor() {
        super();
        this.running = false;
    }

    public reset() {
        if (!this.isRunning()) {
            return;
        }
        this.running = false;
        clearTimeout(this.timer);
    }

    public start(timeInMs: number) {
        if (this.isRunning()) {
            return;
        }
        this.running = true;
        this.timer = global.setTimeout(() => {
            this.onTimeout();
        }, timeInMs);
    }

    private onTimeout() {
        if (this.isRunning()) {
            this.running = false;
            this.emit(AlarmEvent.TIMEOUT);
        }
    }

    public isRunning(): boolean {
        return this.running;
    }
}

export enum AlarmEvent {
    TIMEOUT = "alarm-timeout"
}