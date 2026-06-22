import {
    _decorator,
    BoxCollider,
    CapsuleCollider,
    Component,
    Node,
    RigidBody,
    SphereCollider,
    Vec3,
} from 'cc';
import { GrassSurface } from './GrassSurface';

const { ccclass, property, menu } = _decorator;

const TMP_POSITION = new Vec3();
const TMP_VELOCITY = new Vec3();
const TMP_FORCE = new Vec3();
const TMP_UP = new Vec3(0, 1, 0);

@ccclass('GrassRigidbodyReaction')
@menu('GrassSystem/Grass Rigidbody Reaction')
export class GrassRigidbodyReaction extends Component {
    @property(Node)
    public grassRoot: Node | null = null;

    @property(RigidBody)
    public targetBody: RigidBody | null = null;

    @property
    public autoReadCollider = true;

    @property
    public fallbackRadius = 0.45;

    @property
    public supportScale = 1;

    @property
    public dragScale = 1;

    @property
    public recoveryScale = 1;

    @property
    public useRigidBodyMass = true;

    @property
    public weightOverride = 1;

    @property
    public weightMultiplier = 1;

    @property
    public maxSupportGravityRatio = 0.45;

    @property
    public gravityMagnitude = 9.8;

    @property
    public maxImpulse = 0.22;

    private _body: RigidBody | null = null;

    start() {
        this._body = this.targetBody || this.getComponent(RigidBody);
    }

    update(dt: number) {
        const body = this.targetBody || this._body || this.getComponent(RigidBody);
        if (!body || !body.enabled || !(body as any).isDynamic || dt <= 0) {
            return;
        }

        const radius = this.computeRadius();
        this.node.getWorldPosition(TMP_POSITION);
        body.getLinearVelocity(TMP_VELOCITY);
        const density = GrassSurface.sampleReactionFromSurfaces(
            this.grassRoot,
            TMP_POSITION,
            TMP_VELOCITY,
            radius,
            TMP_FORCE,
            {
                supportScale: this.supportScale,
                dragScale: this.dragScale,
                recoveryScale: this.recoveryScale,
            },
        );
        if (density <= 0 || TMP_FORCE.lengthSqr() <= 0.000001) {
            return;
        }

        const bodyWeight = this.computeBodyWeight(body);
        TMP_FORCE.multiplyScalar(dt);
        this.clampSupportImpulse(TMP_FORCE, bodyWeight, dt);

        const impulseLength = TMP_FORCE.length();
        if (this.maxImpulse > 0 && impulseLength > this.maxImpulse) {
            TMP_FORCE.multiplyScalar(this.maxImpulse / impulseLength);
        }

        body.wakeUp();
        body.applyImpulse(TMP_FORCE);
    }

    private computeRadius() {
        if (!this.autoReadCollider) {
            return Math.max(0.01, this.fallbackRadius);
        }

        const sphere = this.getComponent(SphereCollider);
        if (sphere) {
            const scale = this.node.worldScale;
            return Math.max(0.01, sphere.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
        }

        const capsule = this.getComponent(CapsuleCollider);
        if (capsule) {
            const scale = this.node.worldScale;
            return Math.max(0.01, capsule.radius * Math.max(Math.abs(scale.x), Math.abs(scale.z)));
        }

        const box = this.getComponent(BoxCollider);
        if (box) {
            const scale = this.node.worldScale;
            return Math.max(
                0.01,
                Math.max(
                    Math.abs(box.size.x * scale.x),
                    Math.abs(box.size.y * scale.y),
                    Math.abs(box.size.z * scale.z),
                ) * 0.5,
            );
        }

        return Math.max(0.01, this.fallbackRadius);
    }

    private computeBodyWeight(body: RigidBody) {
        const mass = this.useRigidBodyMass ? ((body as unknown as { mass?: number }).mass ?? 1) : this.weightOverride;
        return Math.max(0.001, mass * Math.max(0, this.weightMultiplier));
    }

    private clampSupportImpulse(impulse: Vec3, bodyWeight: number, dt: number) {
        const upImpulse = Vec3.dot(impulse, TMP_UP);
        if (upImpulse <= 0) {
            return;
        }

        const maxSupport = bodyWeight * Math.max(0, this.gravityMagnitude) * Math.max(0, this.maxSupportGravityRatio) * dt;
        if (upImpulse <= maxSupport) {
            return;
        }

        Vec3.scaleAndAdd(impulse, impulse, TMP_UP, maxSupport - upImpulse);
    }
}
