import { _decorator, BoxCollider, Component, Enum, MeshRenderer, primitives, SphereCollider, utils, Vec3 } from 'cc';

const { ccclass, property, requireComponent, executeInEditMode, menu } = _decorator;

export enum GrassDemoPrimitiveType {
    Plane = 0,
    Box = 1,
    Sphere = 2,
}

Enum(GrassDemoPrimitiveType);

@ccclass('GrassDemoPrimitive')
@menu('GrassSystem/Demo Primitive')
@executeInEditMode
@requireComponent(MeshRenderer)
export class GrassDemoPrimitive extends Component {
    @property({ type: GrassDemoPrimitiveType })
    public primitiveType = GrassDemoPrimitiveType.Plane;

    @property
    public useColliderSize = true;

    @property
    public width = 8;

    @property
    public length = 6;

    @property
    public widthSegments = 28;

    @property
    public lengthSegments = 22;

    @property
    public radius = 0.45;

    @property
    public sphereSegments = 24;

    @property(Vec3)
    public boxSize = new Vec3(0.9, 0.55, 0.9);

    onLoad() {
        this.rebuild();
    }

    start() {
        this.rebuild();
    }

    public rebuild() {
        const renderer = this.getComponent(MeshRenderer);
        if (!renderer) {
            return;
        }

        if (this.primitiveType === GrassDemoPrimitiveType.Box) {
            const collider = this.useColliderSize ? this.getComponent(BoxCollider) : null;
            const size = collider ? collider.size : this.boxSize;
            renderer.mesh = utils.createMesh(primitives.box({
                width: Math.max(0.001, size.x),
                height: Math.max(0.001, size.y),
                length: Math.max(0.001, size.z),
            }));
            return;
        }

        if (this.primitiveType === GrassDemoPrimitiveType.Sphere) {
            const collider = this.useColliderSize ? this.getComponent(SphereCollider) : null;
            const radius = collider ? collider.radius : this.radius;
            renderer.mesh = utils.createMesh(primitives.sphere(Math.max(0.001, radius), {
                segments: Math.max(8, Math.floor(this.sphereSegments)),
            }));
            return;
        }

        renderer.mesh = utils.createMesh(primitives.plane({
            width: Math.max(0.001, this.width),
            length: Math.max(0.001, this.length),
            widthSegments: Math.max(1, Math.floor(this.widthSegments)),
            lengthSegments: Math.max(1, Math.floor(this.lengthSegments)),
        }));
    }
}
