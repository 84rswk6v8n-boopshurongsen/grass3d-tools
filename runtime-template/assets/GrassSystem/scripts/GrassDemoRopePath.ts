import { _decorator, Component, Line, Vec3 } from 'cc';

const { ccclass, property, menu } = _decorator;

@ccclass('GrassDemoRopePath')
@menu('GrassSystem/Demo Rope Path')
export class GrassDemoRopePath extends Component {
    @property(Line)
    public line: Line | null = null;

    @property
    public ropeRadius = 0.08;

    @property
    public amplitude = 1.15;

    @property
    public speed = 0.9;

    private readonly _points: Vec3[] = [
        new Vec3(-3.2, 0.32, -1.3),
        new Vec3(-1.1, 0.32, 0.9),
        new Vec3(1.1, 0.32, -0.6),
        new Vec3(3.0, 0.32, 1.2),
    ];
    private _time = 0;

    onLoad() {
        this.line = this.line || this.getComponent(Line);
    }

    update(dt: number) {
        this._time += dt;
        this._points[1].z = Math.sin(this._time * this.speed) * this.amplitude;
        this._points[2].x = 1.1 + Math.cos(this._time * this.speed * 0.7) * 0.7;
        this._points[2].z = -0.6 + Math.sin(this._time * this.speed * 1.4) * 0.8;
        if (this.line) {
            this.line.worldSpace = true;
            this.line.positions = this._points.map((point) => point.clone());
        }
    }

    public getCurrentPathSnapshot() {
        return this._points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    }

    public getRopeRadius() {
        return this.ropeRadius;
    }
}
