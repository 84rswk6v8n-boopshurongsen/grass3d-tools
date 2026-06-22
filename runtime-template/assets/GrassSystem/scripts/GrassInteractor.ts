import {
    _decorator,
    BoxCollider,
    CapsuleCollider,
    Component,
    Enum,
    SphereCollider,
    Vec3,
} from 'cc';
import { GrassInteractionManager } from './GrassInteractionManager';
import { GrassInfluence, GrassInteractorShape } from './GrassTypes';

const { ccclass, property, menu } = _decorator;

const TMP_CENTER = new Vec3();
const TMP_AXIS_X = new Vec3();
const TMP_AXIS_Y = new Vec3();
const TMP_AXIS_Z = new Vec3();
const TMP_START = new Vec3();
const TMP_END = new Vec3();

@ccclass('GrassInteractor')
@menu('GrassSystem/Grass Interactor')
export class GrassInteractor extends Component {
    @property({ type: Enum(GrassInteractorShape) })
    public shape = GrassInteractorShape.Sphere;

    @property
    public autoReadCollider = true;

    @property
    public radius = 0.5;

    @property
    public capsuleHeight = 1.6;

    @property({ type: Vec3 })
    public boxSize = new Vec3(1, 1, 1);

    @property
    public strengthMultiplier = 1;

    @property
    public autoRecovery = true;

    @property
    public recoverySpeed = 5;

    lateUpdate() {
        const manager = GrassInteractionManager.active;
        if (!manager) {
            return;
        }

        const recovery = this.autoRecovery ? this.computeAutoRecovery() : Math.max(0.01, this.recoverySpeed);
        const influences: GrassInfluence[] = [];
        if (this.shape === GrassInteractorShape.Box) {
            influences.push(this.makeBox(recovery));
        } else if (this.shape === GrassInteractorShape.Capsule) {
            influences.push(this.makeCapsule(recovery));
        } else {
            influences.push(this.makeSphere(recovery));
        }
        manager.setInfluences(this.uuid, influences);
    }

    onDisable() {
        GrassInteractionManager.active?.clearInfluences(this.uuid);
    }

    private makeSphere(recovery: number): GrassInfluence {
        this.node.getWorldPosition(TMP_CENTER);
        const collider = this.autoReadCollider ? this.getComponent(SphereCollider) : null;
        const radius = collider ? collider.radius * this.maxWorldScaleXZ() : this.radius * this.maxWorldScaleXZ();
        return {
            type: GrassInteractorShape.Sphere,
            center: TMP_CENTER.clone(),
            radius: Math.max(0.001, radius),
            strength: this.strengthMultiplier,
            recovery,
        };
    }

    private makeCapsule(recovery: number): GrassInfluence {
        this.node.getWorldPosition(TMP_CENTER);
        TMP_AXIS_Y.set(this.node.up);
        const collider = this.autoReadCollider ? this.getComponent(CapsuleCollider) : null;
        const radius = (collider ? collider.radius : this.radius) * this.maxWorldScaleXZ();
        const cylinderHeight = (collider ? collider.cylinderHeight : Math.max(0, this.capsuleHeight - radius * 2)) * Math.abs(this.node.worldScale.y);
        const halfLine = Math.max(0, cylinderHeight * 0.5);
        Vec3.scaleAndAdd(TMP_START, TMP_CENTER, TMP_AXIS_Y, -halfLine);
        Vec3.scaleAndAdd(TMP_END, TMP_CENTER, TMP_AXIS_Y, halfLine);
        return {
            type: GrassInteractorShape.Capsule,
            start: TMP_START.clone(),
            end: TMP_END.clone(),
            radius: Math.max(0.001, radius),
            strength: this.strengthMultiplier,
            recovery,
        };
    }

    private makeBox(recovery: number): GrassInfluence {
        this.node.getWorldPosition(TMP_CENTER);
        TMP_AXIS_X.set(this.node.right);
        TMP_AXIS_Y.set(this.node.up);
        TMP_AXIS_Z.set(this.node.forward);
        const collider = this.autoReadCollider ? this.getComponent(BoxCollider) : null;
        const size = collider ? collider.size : this.boxSize;
        const scale = this.node.worldScale;
        return {
            type: GrassInteractorShape.Box,
            center: TMP_CENTER.clone(),
            axisX: TMP_AXIS_X.clone().normalize(),
            axisY: TMP_AXIS_Y.clone().normalize(),
            axisZ: TMP_AXIS_Z.clone().normalize(),
            halfExtents: new Vec3(
                Math.max(0.001, Math.abs(size.x * scale.x) * 0.5),
                Math.max(0.001, Math.abs(size.y * scale.y) * 0.5),
                Math.max(0.001, Math.abs(size.z * scale.z) * 0.5),
            ),
            strength: this.strengthMultiplier,
            recovery,
        };
    }

    private computeAutoRecovery() {
        const scale = this.node.worldScale;
        const size = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 0.001);
        return Math.max(1.2, Math.min(10, 5 / size));
    }

    private maxWorldScaleXZ() {
        const scale = this.node.worldScale;
        return Math.max(Math.abs(scale.x), Math.abs(scale.z), 0.001);
    }
}
