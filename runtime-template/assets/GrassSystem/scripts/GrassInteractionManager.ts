import { _decorator, Component } from 'cc';
import { GrassInfluence } from './GrassTypes';

const { ccclass, menu } = _decorator;

@ccclass('GrassInteractionManager')
@menu('GrassSystem/Grass Interaction Manager')
export class GrassInteractionManager extends Component {
    private static _active: GrassInteractionManager | null = null;

    private readonly _sources = new Map<string, GrassInfluence[]>();
    private readonly _influences: GrassInfluence[] = [];

    public static get active() {
        return GrassInteractionManager._active;
    }

    onEnable() {
        GrassInteractionManager._active = this;
    }

    onDisable() {
        if (GrassInteractionManager._active === this) {
            GrassInteractionManager._active = null;
        }
    }

    public addInfluence(influence: GrassInfluence) {
        this._influences.push(influence);
    }

    public setInfluences(ownerId: string, influences: GrassInfluence[]) {
        this._sources.set(ownerId, influences);
    }

    public clearInfluences(ownerId: string) {
        this._sources.delete(ownerId);
    }

    public getInfluences() {
        this._influences.length = 0;
        this._sources.forEach((items) => {
            for (const item of items) {
                this._influences.push(item);
            }
        });
        return this._influences;
    }
}
