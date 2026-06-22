import { _decorator, Component, Node, Vec3 } from 'cc';
import { GrassInteractionManager } from './GrassInteractionManager';
import { GrassInfluence, GrassInteractorShape } from './GrassTypes';

const { ccclass, property, menu } = _decorator;

type RopeLike = Component & {
    ropeRadius?: number;
    getRopeRadius?: () => number;
    getPositionsSnapshot?: (out?: Vec3[]) => Vec3[];
    getCurrentPathSnapshot?: () => { x: number; y: number; z: number }[];
};

@ccclass('GrassRopeInteractor')
@menu('GrassSystem/Grass Rope Interactor')
export class GrassRopeInteractor extends Component {
    @property(Node)
    public ropeNode: Node | null = null;

    @property
    public fallbackRadius = 0.08;

    @property
    public minimumInfluenceRadius = 0.18;

    @property
    public influenceRadiusMultiplier = 1;

    @property
    public strengthMultiplier = 1;

    @property
    public recoverySpeed = 3;

    private readonly _points: Vec3[] = [];

    lateUpdate() {
        const manager = GrassInteractionManager.active;
        if (!manager || !this.ropeNode) {
            return;
        }

        const rope = this.findRopeLike();
        if (!rope) {
            return;
        }

        this.collectPoints(rope);
        if (this._points.length < 2) {
            manager.clearInfluences(this.uuid);
            return;
        }

        const ropeRadius = rope.getRopeRadius ? rope.getRopeRadius() : (rope.ropeRadius ?? this.fallbackRadius);
        const radius = Math.max(0.001, Math.max(ropeRadius, this.minimumInfluenceRadius) * this.influenceRadiusMultiplier);
        const influences: GrassInfluence[] = [];
        for (let i = 0; i < this._points.length - 1; i++) {
            influences.push({
                type: GrassInteractorShape.Capsule,
                start: this._points[i].clone(),
                end: this._points[i + 1].clone(),
                radius,
                strength: this.strengthMultiplier,
                recovery: this.recoverySpeed,
            });
        }
        manager.setInfluences(this.uuid, influences);
    }

    onDisable() {
        GrassInteractionManager.active?.clearInfluences(this.uuid);
    }

    private findRopeLike(): RopeLike | null {
        const components = this.ropeNode!.getComponents(Component) as RopeLike[];
        for (const component of components) {
            if (typeof component.getPositionsSnapshot === 'function' || typeof component.getCurrentPathSnapshot === 'function') {
                return component;
            }
        }
        return null;
    }

    private collectPoints(rope: RopeLike) {
        this._points.length = 0;
        if (typeof rope.getPositionsSnapshot === 'function') {
            rope.getPositionsSnapshot(this._points);
            return;
        }

        const path = rope.getCurrentPathSnapshot ? rope.getCurrentPathSnapshot() : [];
        for (const point of path) {
            this._points.push(new Vec3(point.x, point.y, point.z));
        }
    }
}
