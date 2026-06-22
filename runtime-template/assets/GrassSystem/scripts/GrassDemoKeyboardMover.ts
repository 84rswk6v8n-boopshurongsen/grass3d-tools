import { _decorator, Component, EventKeyboard, input, Input, KeyCode, RigidBody, Vec3 } from 'cc';

const { ccclass, property, menu } = _decorator;

@ccclass('GrassDemoKeyboardMover')
@menu('GrassSystem/Demo Keyboard Mover')
export class GrassDemoKeyboardMover extends Component {
    @property
    public xSpeed = 2;

    @property
    public zSpeed = 2;

    private readonly _keys: Set<KeyCode> = new Set();
    private readonly _position = new Vec3();
    private readonly _velocity = new Vec3();
    private _rigidBody: RigidBody | null = null;

    start() {
        this._rigidBody = this.getComponent(RigidBody);
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        this._keys.clear();
    }

    update(dt: number) {
        const x = (this._keys.has(KeyCode.KEY_L) ? 1 : 0) - (this._keys.has(KeyCode.KEY_J) ? 1 : 0);
        const z = (this._keys.has(KeyCode.KEY_K) ? 1 : 0) - (this._keys.has(KeyCode.KEY_I) ? 1 : 0);
        this._velocity.set(x * this.xSpeed, 0, z * this.zSpeed);

        if (x === 0 && z === 0) {
            if (this._rigidBody) {
                this._rigidBody.setLinearVelocity(this._velocity);
            }
            return;
        }

        if (this._rigidBody) {
            this._rigidBody.setLinearVelocity(this._velocity);
        }

        this.node.getWorldPosition(this._position);
        this._position.x += this._velocity.x * dt;
        this._position.z += this._velocity.z * dt;
        this.node.setWorldPosition(this._position);
    }

    private onKeyDown(event: EventKeyboard) {
        this._keys.add(event.keyCode);
    }

    private onKeyUp(event: EventKeyboard) {
        this._keys.delete(event.keyCode);
    }
}
