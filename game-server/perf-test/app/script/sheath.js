/////////////////////////////////////////////////////////////
var cwd = process.cwd();
var pomelo = require(cwd + "/app/script/pomelo-client");
var envConfig = require(cwd + '/app/config/env.json');
var config = require(cwd + '/app/config/' + envConfig.env + '/config');
var _ = require("underscore");

var ActFlagType = {
    ENTRY: {
        desc: "登陆服务器",
        reqId: 0,
        name: "entry",
        route: "connector.entryHandler.enter"
    },
    ENTER_PARTITION: {
        desc: "登陆后选服",
        reqId: 1,
        name: "enterPart",
        route: "connector.entryHandler.enterPartition"
    },
    CLAIM_DAILY_REWARD: {
        desc: "领取每日奖励",
        reqId: 2,
        name: "claimDaily",
        route: "game.roleHandler.claimDailyReward"
    },
    CLAIM_QHOURLY_REWARD: {
        desc: "每15分钟领取奖励",
        reqId: 3,
        name: "claimQuarterHourlyReward",
        route: "game.roleHandler.claimQuarterHourlyReward"
    },
    SET_TEAM: {
        desc: "编队",
        reqId: 4,
        name: "setTeam",
        route: "game.roleHandler.setTeam"
    },
    LIST_ITEM: {
        desc: "获得角色道具",
        reqId: 5,
        name: "listItems",
        route: "game.itemHandler.list"
    },
    UPGRADE_EQUIPMENT: {
        desc: "强化道具",
        reqId: 6,
        name: "upgrade_weapon",
        route: "game.equipmentHandler.upgrade"
    },
    COMPOSITE_EQUIPMENT: {
        desc: "合成道具",
        reqId: 7,
        name: "composite_weapon",
        route: "game.equipmentHandler.composite"
    },
    REFINE_EQUIPMENT: {
        desc: "",
        reqId: 8,
        name: "refine_weapon",
        route: "game.equipmentHandler.refine"
    },
    REFINE_GEM: {
        desc: "精炼武器",
        reqId: 9,
        name: "refine_gem",
        route: "game.equipmentHandler.refineGem"
    },
    SET_GEM: {
        desc: "镶嵌宝石",
        reqId: 10,
        name: "set_gem",
        route: "game.equipmentHandler.setGem"
    },
    REMOVE_GEM: {
        desc: "卸载宝石",
        reqId: 11,
        name: "remove_gem",
        route: "game.equipmentHandler.removeGem"
    },
    DESTRUCT_CHECK: {
        desc: "获得武器分解结果",
        reqId: 12,
        name: "check_destruct",
        route: "game.equipmentHandler.destructCheck"
    },
    DESTRUCT: {
        desc: "武器分解",
        reqId: 13,
        name: "destruct",
        route: "game.equipmentHandler.destruct"
    },
    LIST_HERO_DEF: {
        desc: "获得武将设定数据",
        reqId: 14,
        name: "list_herodef",
        route: "game.heroHandler.listDef"
    },
    LIST_ITEM_DEF: {
        desc: "获得道具设定数据",
        reqId: 15,
        name: "list_itemdef",
        route: "game.itemHandler.listDef"
    },
    EQUIP: {
        desc: "装备",
        reqId: 16,
        name: "equip",
        route: "game.heroHandler.equip"
    },
    UNEQUIP: {
        desc: "卸下装备",
        reqId: 17,
        name: "unequip",
        route: "game.heroHandler.unEquip"
    },
    LIST_HERO: {
        desc: "获得角色武将",
        reqId: 18,
        name: "listHeroes",
        route: "game.heroHandler.list"
    },


    ACT_END: null
};

var monitor = function (type, name, reqId) {
    if (typeof actor !== 'undefined') {
        actor.emit(type, name, reqId);
    } else {
        console.error(Array.prototype.slice.call(arguments, 0));
    }
};

var timePomeloRequest = function (conf, msg, cb) {
    monitor('start', conf.name, conf.reqId);
    pomelo.request(conf.route, msg, function (data) {
        monitor('end', conf.name, conf.reqId);

        if (data.error) {
            console.log(conf.name + ' failed!' + (data.error.message || data.error.code));
        }
        else {
            console.log(data);
        }
        cb(data);
    });
};

var connected = false;
var offset = (typeof actor !== 'undefined') ? actor.id : 1;

if (typeof actor !== 'undefined') {
    console.log(offset + ' ' + actor.id);
}

function entry(host, port, accType, username, password) {
    var entryFunc = function () {
        var request = {
            accType: accType,
            username: username,
            password: password,
            distro: "test",
            device: {
                os: "mac",
                device: "imac",
                res: {
                    width: 2560,
                    height: 1440
                },
                osVersion: "10.9",
                mac: "000000000000",
                deviceID: ""
            }
        };

        timePomeloRequest(ActFlagType.ENTRY, request, function (data) {
            pomelo.user = data.user;

            timePomeloRequest(ActFlagType.ENTER_PARTITION, {partId: data.partitions[0].id}, function (data) {
                timePomeloRequest(ActFlagType.LIST_ITEM_DEF, {}, function (data) {
                    pomelo.itemDefs = data.defs;
                    timePomeloRequest(ActFlagType.LIST_HERO_DEF, {}, function (data) {
                        pomelo.heroDefs = data.defs;
                        timePomeloRequest(ActFlagType.LIST_HERO, {}, function (data) {
                            pomelo.heroes = data.heroes;
                            afterLogin(pomelo, data);
                        });
                    });
                });
            });
        });
    };

    if (!connected) {
        // 初始化socketClient
        pomelo.init({host: host, port: port, log: true}, entryFunc);
    } else {
        entryFunc();
    }
}

var afterLogin = function (pomelo, data) {
    pomelo.role = data.role;

    pomelo.on('onKick', function () {
        console.log('You have been kicked offline for the same account login in other place.');
    });

    pomelo.on('disconnect', function (reason) {
        console.log('disconnect invoke!' + reason);
    });

    timePomeloRequest(ActFlagType.CLAIM_DAILY_REWARD, {}, function (data) {
        timePomeloRequest(ActFlagType.CLAIM_QHOURLY_REWARD, {}, function (data) {
            upgradeWeapon(pomelo, data);
        });
    });
};

var upgradeWeapon = function (pomelo, data) {
    timePomeloRequest(ActFlagType.LIST_ITEM, {}, function (data) {
        var weaponId = _.findWhere(data.items, {defId: 101}).id;
        pomelo.items = toKeyedObject(data.items);

        timePomeloRequest(ActFlagType.UPGRADE_EQUIPMENT, {equipmentId: weaponId}, function (data) {
            delete pomelo.items[data.destroyed];
            pomelo.items[data.equipment.id] = data.equipment;
            compositeEquipment(pomelo);
        });
    });
};

var compositeEquipment = function (pomelo) {
    timePomeloRequest(ActFlagType.COMPOSITE_EQUIPMENT, {matType: 111}, function (data) {
        delete pomelo.items[data.destroyed[0]];
        delete pomelo.items[data.destroyed[1]];
        pomelo.items[data.newItem.id] = data.newItem;

        refineWeapon(pomelo);
    });
};

var refineWeapon = function (pomelo) {
    var weaponId = _.findWhere(_.values(pomelo.items), {defId: 101}).id;
    timePomeloRequest(ActFlagType.REFINE_EQUIPMENT, {equipmentId: weaponId}, function (data) {
        timePomeloRequest(ActFlagType.REFINE_EQUIPMENT, {equipmentId: weaponId}, function (data) {
            refineGem(pomelo);
        });
    });
};

var refineGem = function (pomelo) {
    timePomeloRequest(ActFlagType.REFINE_GEM, {gemType: 122, gemLevel: 0}, function (data) {
        pomelo.items[data.gem.id] = data.gem;
        var weaponId = _.findWhere(pomelo.items, {defId: 101}).id;
        timePomeloRequest(ActFlagType.SET_GEM, {gemId: data.gem.id, equipmentId: weaponId}, function (data) {
            timePomeloRequest(ActFlagType.REMOVE_GEM, {gemId: data.gem.id}, function (data) {
                equip(pomelo);
            });
        });
    });
};

var equip = function (pomelo) {
    var weaponId = _.findWhere(pomelo.items, {defId: 101}).id;
    timePomeloRequest(ActFlagType.EQUIP, {equipmentId: weaponId, heroId: pomelo.heroes[0].id}, function (data) {
        // should fail
        timePomeloRequest(ActFlagType.DESTRUCT, {equipmentId: weaponId}, function (data) {
            timePomeloRequest(ActFlagType.UNEQUIP, {equipmentId: weaponId}, function (data) {
                destroyEquipment(pomelo);
            });
        });
    });
};

var destroyEquipment = function (pomelo) {
    var weaponId = _.findWhere(pomelo.items, {defId: 101}).id;
    timePomeloRequest(ActFlagType.DESTRUCT_CHECK, {equipmentId: weaponId}, function (data) {
        timePomeloRequest(ActFlagType.DESTRUCT, {equipmentId: weaponId}, function (data) {
            process.exit(0);
        });
    });
};

var setTeam = function (pomelo) {
    timePomeloRequest(ActFlagType.SET_TEAM, {heroes: ["", "", ""]}, function (data) {
        process.exit(0);
    });
};

var toKeyedObject = function (list) {
    var ret = {};
    for (var i=0;i<list.length;i++) {
        var item = list[i];
        ret[item.id] = item;
    }
    return ret;
};

setTimeout(function () {
    entry("127.0.0.1", 3010, "main", "uname", "c8fed00eb2e87f1cee8e90ebbe870c190ac3848c");
}, Math.random() * 2000);
