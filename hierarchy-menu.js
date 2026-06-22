'use strict';

const PACKAGE_NAME = 'grass3d-tools';
const GRASS_MENU_LABEL = '3d草地';

function resolveNodeUuid(nodeInfo) {
    if (!nodeInfo) {
        return '';
    }
    if (typeof nodeInfo === 'string') {
        return nodeInfo;
    }
    if (nodeInfo.uuid) {
        return nodeInfo.uuid;
    }
    if (nodeInfo.value && typeof nodeInfo.value === 'string') {
        return nodeInfo.value;
    }
    if (nodeInfo.value && nodeInfo.value.uuid) {
        return nodeInfo.value.uuid;
    }
    if (nodeInfo.node && typeof nodeInfo.node === 'string') {
        return nodeInfo.node;
    }
    return '';
}

async function createGrass3DNode(parentUuid = '') {
    try {
        await Editor.Message.request(PACKAGE_NAME, 'create-grass3d-node', parentUuid);
    } catch (error) {
        console.error('[grass3d-tools] create grass node from hierarchy menu failed:', error);
    }
}

function getGrassMenuItem(parentUuid = '') {
    return {
        label: GRASS_MENU_LABEL,
        click() {
            createGrass3DNode(parentUuid);
        },
    };
}

function getGrassCreateMenuItem() {
    return {
        path: '3D 对象',
        label: GRASS_MENU_LABEL,
        click() {
            createGrass3DNode();
        },
    };
}

function getGrassMenu(parentUuid = '') {
    return [
        { type: 'separator' },
        getGrassMenuItem(parentUuid),
    ];
}

exports.getCreateMenu = function getCreateMenu() {
    return [getGrassCreateMenuItem()];
};

exports.getNodeMenu = function getNodeMenu(nodeInfo) {
    return getGrassMenu(resolveNodeUuid(nodeInfo));
};

exports.getRootMenu = function getRootMenu() {
    return getGrassMenu();
};
