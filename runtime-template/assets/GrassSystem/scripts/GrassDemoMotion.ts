import { _decorator, Component } from 'cc';

const { ccclass, property, menu } = _decorator;

@ccclass('GrassDemoMotion')
@menu('GrassSystem/Demo Motion')
export class GrassDemoMotion extends Component {
    @property
    public mode = 0;

    @property
    public speed = 1;

    @property
    public amplitudeX = 1;

    @property
    public amplitudeZ = 1;

    @property
    public rotationSpeed = 0;

    @property
    public baseX = 0;

    @property
    public baseY = 0;

    @property
    public baseZ = 0;

    private _time = 0;

    start() {
        const pos = this.node.worldPosition;
        this.baseX = this.baseX || pos.x;
        this.baseY = this.baseY || pos.y;
        this.baseZ = this.baseZ || pos.z;
    }

    update(dt: number) {
        this._time += dt * this.speed;
        if (this.mode === 0) {
            this.node.setPosition(
                this.baseX + Math.sin(this._time * 0.9) * this.amplitudeX,
                this.baseY,
                this.baseZ + Math.cos(this._time * 0.65) * this.amplitudeZ,
            );
            return;
        }

        this.node.setPosition(
            this.baseX + Math.sin(this._time * 0.7) * this.amplitudeX,
            this.baseY,
            this.baseZ + Math.cos(this._time * 0.85) * this.amplitudeZ,
        );
        if (this.rotationSpeed !== 0) {
            this.node.setRotationFromEuler(0, this._time * this.rotationSpeed, 0);
        }
    }
}
