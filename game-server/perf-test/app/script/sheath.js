/////////////////////////////////////////////////////////////
var cwd = process.cwd();
var envConfig = require(cwd + '/app/config/env.json');
var config = require(cwd + '/app/config/' + envConfig.env + '/config');
var Constants = require("../../../../shared/constants");
var async = require("async");
var Promise = require("bluebird");
var _ = require("lodash");

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
        route: "game.itemHandler.refineGem"
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
    LIST_MAIL: {
        desc: "获取所有邮件",
        reqId: 19,
        name: "listMail",
        route: "chat.mailHandler.list"
    },
    CLAIM_MAIL: {
        desc: "获取邮件奖励",
        reqId: 20,
        name: "claimMail",
        route: "chat.mailHandler.claimTreasure"
    },
    CHAT: {
        desc: "发送",
        reqId: 21,
        name: "sendChat",
        route: "chat.chatHandler.send"
    },
    LIST_TASK: {
        desc: "获取任务",
        reqId: 22,
        name: "listTask",
        route: "game.taskHandler.list"
    },
    CLAIM_TASK: {
        desc: "获取任务奖励",
        reqId: 23,
        name: "claimTask",
        route: "game.taskHandler.claim"
    },
    UPGRADE_FORMATION: {
        desc: "升级编队",
        reqId: 24,
        name: "upgradeFormation",
        route: "game.roleHandler.upgradeFormation"
    },
    LIST_LEVEL: {
        desc: "获取关卡",
        reqId: 42,
        name: "listLevel",
        route: "game.levelHandler.list"
    },
    START: {
        desc: "开始关卡",
        reqId: 25,
        name: "startLevel",
        route: "game.levelHandler.start"
    },
    END: {
        desc: "结束关卡",
        reqId: 26,
        name: "endLevel",
        route: "game.levelHandler.end"
    },
    LIST_STORE: {
        desc: "获取集市",
        reqId: 27,
        name: "listStore",
        route: "game.itemHandler.listStore"
    },
    REFRESH_STORE: {
        desc: "手工刷新集市",
        reqId: 28,
        name: "refreshStore",
        route: "game.itemHandler.manualRefresh"
    },
    STORE_BUY: {
        desc: "购买道具",
        reqId: 29,
        name: "storeBuy",
        route: "game.itemHandler.buy"
    },
    COIN_DRAW: {
        desc: "铜钱抽",
        reqId: 30,
        name: "coinDraw",
        route: "game.heroHandler.coinDraw"
    },
    GOLD_DRAW: {
        desc: "元宝抽",
        reqId: 31,
        name: "goldDraw",
        route: "game.heroHandler.goldDraw"
    },
    USE_ITEM: {
        desc: "使用道具",
        reqId: 32,
        name: "useItem",
        route: "game.itemHandler.useItem"
    },
    REPLACE: {
        desc: "替换武将",
        reqId: 34,
        name: "replace",
        route: "game.roleHandler.replaceHero"
    },
    RENAME: {
        desc: "新手_改名",
        reqId: 35,
        name: "rename",
        route: "game.tutorialHandler.setName"
    },
    PICKHERO: {
        desc: "新手_选初始武将",
        reqId: 36,
        name: "pickHero",
        route: "game.tutorialHandler.pickHero"
    },
    LOGOFF: {
        reqId: 37,
        name: "logoff",
        route:"connector.entryHandler.logOff"
    },
    LIST_SOULS: {
        reqId: 38,
        name: "souls",
        route:"game.heroHandler.listSouls"
    },
    REDEEM_SOULS: {
        reqId: 39,
        name: "redeem_souls",
        route:"game.heroHandler.redeemSouls"
    },
    SELL: {
        reqId: 40,
        name: "sell_item",
        route:"game.itemHandler.sell"
    },
    REFINE_HERO: {
        reqId: 41,
        name: "refine_hero",
        route:"game.heroHandler.refine"
    },
    ROBOT_GM: {
        reqId: 42,
        name: "robot_gm",
        route: "game.robotGm.doGmCmd"
    },

    ACT_END: null
};

var requireUnCached = function (module) {
    delete require.cache[require.resolve(module)];
    return require(module);
};

var pomelo = requireUnCached(cwd + "/app/script/pomelo-client");

var monitor = function (type, name, reqId) {
    if (typeof actor !== 'undefined') {
        actor.emit(type, name, reqId);
    } else {
        console.error(Array.prototype.slice.call(arguments, 0));
    }
};

var requestAsync = Promise.promisify(function(conf, msg, cb) {
    monitor('start', conf.name, conf.reqId);
    pomelo.request(conf.route, msg, function (data) {
        monitor('end', conf.name, conf.reqId);

        if (data.error) {
            cb({code: data.error.code, message: data.error.message, conf: conf});
        }
        else {
            cb(null, data);
        }
    });
});

var offset = (typeof actor !== 'undefined') ? actor.id : 1;

if (typeof actor !== 'undefined') {
    console.log(offset + ' ' + actor.id);
}

var Role = function () {
};

Role.prototype.startTest = function() {
    var self = this;
    self.username = "test_1";// + _.random(1, 1);
    self.password = "password";
    self.actionHistory = [];
    self.curFullAction = [];

    var onReady = function() {
        pomelo.on('onKick', function (data) {
            console.log('You have been kicked offline.');
        });

        pomelo.on('onChat', function (data) {
            console.log('Recv chat message.' + JSON.stringify(data));
        });

        pomelo.on('onAnnounce', function (data) {
            console.log('Recv Announcement.' + JSON.stringify(data));
        });

        pomelo.on('onEndAnnounce', function (data) {
            console.log('Recv EndAnnouncement.' + JSON.stringify(data));
        });

        pomelo.on('disconnect', function (reason) {
            console.log('disconnect invoke!' + reason);
        });

        self.enter();
    };

    pomelo.init({host: "127.0.0.1", port: 3010, log: true}, onReady);
};

Role.prototype.finishAction = function() {
    this.curFullAction.pop();
    this.doAction();
};

Role.prototype.addAction = function(action, opt) {
    this.curFullAction.push([action, opt || {}]);
    this.doAction();
};

Role.prototype.resolveCommon = function(promise) {
    self = this;
    return promise.then(function() {
        self.finishAction();
    }).catch(function(err) {
        var errMsg = "";
        if(err.message) {
            errMsg = " err.message = " + err.message;
        }
        console.log(err.conf.route + " failed!" + errMsg + " err.code = " + err.code);

        if (err.code === Constants.LoginFailed.AlreadyLoggedIn) {
            self.finishAction();
        }
        else if(err.code === Constants.NEED_AUTH) {
            self.addAction(self.enter);
        }
        else if(err.code === Constants.LoginFailed.ID_PASSWORD_MISMATCH) {
            self.username = "test_" + _.random(1, 1000000);
            self.doAction();
        }
        else if(err.code === Constants.NO_COINS || err.code === Constants.NO_GOLDS) {
            self.addAction(self.robotGm_addMoney);
        }
        else if(err.code === Constants.StoreFailed.NO_PURCHASE) {
            self.addAction(self.robotGm_refreshPurchase);
        }
        else if(err.code === Constants.NO_ROOM) {
            for(var i = 0; i != 100; ++i) {
                self.curFullAction.push([self.sellItem, {}]);
            }
            self.doAction();
        }
        else {
            throw err;
        }
    });
};

Role.prototype.enter = function () {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.ENTRY, {
            accType: "main",
            username: self.username,
            password: self.password,
            distro: "test",
            device: {
                os: "mac",
                device: "imac",
                res: {
                    width: 2560,
                    height: 1440
                },
                osVersion: "10.9",
                clientVersion: "0.1",
                mac: "000000000000",
                deviceID: ""
            }
        }).then(function (data) {
            self.user = data.user;
            self.partitions = data.partitions;
            return requestAsync(ActFlagType.ENTER_PARTITION, {partId: data.partitions[0].id});
        }).then(function (data) {
            self.role = data.role;
            self.heroCans = data.heroCans;
            self.heroDefs = data.heroDefs;
            self.itemDefs = data.itemDefs;
            self.equipDefById = _.indexBy(data.equipmentDefs, "id");
            self.items = data.items;
            self.heroes = data.heroes;
            self.stages = data.stages;
            self.nextGoldReset = data.nextGoldReset;
            self.nextCoinReset = data.nextCoinReset;
            self.coinDrawCount = data.coinDrawCount;
        })).catch(function (err) {
            //error specific to this action, should be resolved here
        });
};

Role.prototype.claimDailyReward = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.CLAIM_DAILY_REWARD, {
        }).then(function(data) {
            self.reward = data.reward;
        })).catch(function(err) {
            if(err.code === Constants.ALREADY_CLAIMED) {
                self.addAction(self.robotGm_reset, {type: "claimDailyReward"});
            }
        });
};

Role.prototype.claimHourlyReward = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.CLAIM_QHOURLY_REWARD, {
        }).then(function(data) {
            self.reward = data.reward;
        })).catch(function(err) {
            if(err.code === Constants.ALREADY_CLAIMED) {
                self.addAction(self.robotGm_reset, {type: "claimHourlyReward"});
            }
        });
};

Role.prototype.setTeam = function() {
    var self = this;
    var randomHeroes = _.pluck(_.sample(self.heroes, 3), "id");
    self.resolveCommon(
        requestAsync(ActFlagType.SET_TEAM, {
            heroes: randomHeroes,
            formation: 2
        }).then(function(data) {
            self.role = data.role;
        })
    );
};

Role.prototype.listItem = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.LIST_ITEM, {
        }).then(function(data) {
            self.items = data.items;
        })
    );
};

Role.prototype.upgradeEquip = function() {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.UPGRADE_EQUIPMENT, {
            equipmentId: item.id
        }).then(function (data) {
            self.role.energy = data.stateDiff.energy;
            self.role.coins = data.stateDiff.coins;
            self.role.golds = data.stateDiff.golds;
            self.role.contribs = data.stateDiff.contribs;
            self.updateEquipment(data.equipment);
        })).catch(function(err) {
            if (err.code === Constants.EquipmentFailed.LEVEL_MAX) {
                if(item.level >= 80) {
                    self.addAction(self.robotGm_reset, {type: "upgradeEquip", eqId: item.id});
                }
                else if (self.role.level < 80) {
                    self.addAction(self.robotGm_upgradeLevel);
                }
            }
        });
};

Role.prototype.sellItem = function(opt) {
    var self = this;
    if(!self.items || _.isEmpty(self.items)) {
        self.resolveCommon(Promise.resolve());
        return;
    }

    var item = _.last(self.items);
    self.resolveCommon(
        requestAsync(ActFlagType.SELL, {
            itemId: item.id
        }).then(function (data) {
            self.role.coins += data.coins;
            _.remove(self.items, function(item) {
                return item.id === data.destroyed;
            });
        })
    );
};

Role.prototype.robotGm_addMoney = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addMoney"
        }).then(function(data) {
            self.role.golds = data.golds;
            self.role.coins = data.coins;
        })
    );
};

Role.prototype.robotGm_refreshPurchase = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "refreshPurchase"
        }).then(function(data) {
        })
    );
};

Role.prototype.robotGm_upgradeLevel = function() {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "upgradeLevel"
        }).then(function(data) {
            self.role.level = data.level;
        })
    );
};

Role.prototype.robotGm_reset = function(opt) {
    var self = this;
    self.resolveCommon(
        requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "reset",
            resetOpt: opt
        }).then(function(data) {
        })
    );
};

Role.prototype.listStore = function() {
    var self = this;
    if(self.storeItems) {
        self.resolveCommon(Promise.resolve());
        return;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.LIST_STORE, {
        }).then(function(data) {
            self.storeItems = data.coinItems.concat(data.goldItems);
            self.nextCoinStoreRefresh = data.nextCoinStoreRefresh;
            self.nextGoldStoreRefresh = data.nextGoldStoreRefresh;
            self.coinRefreshLeft = data.coinRefreshLeft;
            self.goldRefreshLeft = data.goldRefreshLeft;
            self.coinPurchaseLeft = data.coinPurchaseLeft;
            self.goldPurchaseLeft = data.goldPurchaseLeft;
        })
    );
};

Role.prototype.storeBuy = function(opt) {
    var self = this;
    if(!self.storeItems) {
        self.addAction(self.listStore);
        return;
    }

    var storeId;

    if(!opt.storeId) {
        if(opt.buyType === "equip") {
            storeId = _.find(self.storeItems, function(store) {
                return self.equipDefById[store.defId];
            }).id;
        }
        else if(opt.buyType === "gem") {
            storeId = _.find(self.storeItems, function(store) {
                return _.any(self.itemDefs, function(def) {
                    return def.id === store.defId && def.type === "宝石";
                });
            }).id;
        }
        else {
            storeId = _.sample(self.storeItems).id;
        }
    }
    else {
        storeId = opt.storeId;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.STORE_BUY, {
            siId: storeId
        }).then(function(data) {
            self.role = data.role;
            if(!self.items) {
                self.items = data.newItems;
            }
            else {
                self.items = self.items.concat(data.newItems);
            }
        })
    );
};

//Role.prototype.compositeEquipment = function() {
//    var self = this;
//    self.resolveCommon(
//        requestAsync(ActFlagType.COMPOSITE_EQUIPMENT, {
//            matType: 52000
//        }).then(function(data) {
//
//        })
//    );
//};

Role.prototype.updateEquipment = function(equipment) {
    var idx = _.findIndex(this.items, function(item) {
        return item.id === equipment.id;
    });

    this.items[idx] = equipment;
};

Role.prototype.getOneEquipment = function() {
    var self = this;
    if(!self.items || _.isEmpty(self.items)) {
        self.addAction(self.storeBuy, {buyType: "equip"});
        return null;
    }

    var item = _.find(self.items, function (item) {
        return self.equipDefById[item.defId];
    });

    if (!item) {
        self.addAction(self.storeBuy, {buyType: "equip"});
        return null;
    }

    return item;
};

Role.prototype.getOneGem = function() {
    var self = this;
    if(!self.items || _.isEmpty(self.items)) {
        self.addAction(self.storeBuy, {buyType: "gem"});
        return null;
    }

    var item = _.find(self.items, function (item) {
        return _.any(self.itemDefs, function(def) {
            return def.id === item.defId && def.type === "宝石";
        });
    });

    if (!item) {
        self.addAction(self.storeBuy, {buyType: "gem"});
        return null;
    }

    return item;
};

Role.prototype.refineWeapon = function() {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.REFINE_EQUIPMENT, {
            equipmentId: item.id
        }).then(function(data) {
            self.role = data.role;
            self.updateEquipment(data.equipment);
        })).catch(function(err) {
            if (err.code === Constants.EquipmentFailed.LEVEL_MAX) {
                self.addAction(self.robotGm_reset, {type: "refineWeapon", eqId: item.id});
            }
        });
};

Role.prototype.refineGem = function() {
    var self = this;
    if(!self.storeItems) {
        self.addAction(self.listStore);
        return;
    }

    var itemDef = _.find(self.itemDefs, function(def) {
        if(!def.composable) {
            return false;
        }

        if(_.isEmpty(def.composeTarget)) {
            return false;
        }

        return self.equipDefById[def.composeTarget[0]];
    });

    self.resolveCommon(
        requestAsync(ActFlagType.REFINE_GEM, {
            gemType: itemDef.id
        }).then(function(data) {
            _.remove(self.items, function(item) {
                return _.some(data.destroyed, function(id) {
                    return id === item.id;
                });
            });
            self.items.push(data.gem);
        })).catch(function(err) {
            if(err.code === Constants.EquipmentFailed.NO_MATERIAL) {
                self.addAction(self.storeBuy, {storeId: _.find(self.storeItems, function(store) {
                    return itemDef.id === store.defId;
                }).id});
            }
        });
};

Role.prototype.setGem = function() {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    var gem = self.getOneGem();

    if(!gem) {
        return;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.SET_GEM, {
            gemId: gem.id,
            equipmentId: item.id
        }).then(function(data) {
        })).catch(function(err) {
            if(err.code === Constants.EquipmentFailed.ALREADY_BOUND) {
                self.addAction(self.robotGm_reset, {type: "setGem", gemId: gem.id});
            }
        });
};

Role.prototype.removeGem = function() {
    var self = this;
    var gem = self.getOneGem();

    if(!gem) {
        return;
    }

    self.resolveCommon(
        requestAsync(ActFlagType.REMOVE_GEM, {
            gemId: gem.id
        }).then(function(data) {

        })
    );
};

Role.prototype.doAction = function() {
    self = this;

    var actions = [
        self.claimDailyReward, self.claimHourlyReward, self.setTeam, self.upgradeEquip, self.storeBuy, self.sellItem,
        self.listStore, self.refineWeapon, self.refineGem, self.setGem, self.removeGem
    ];

    var action = null;
    var opt;

    if(self.curFullAction.length > 0) {
        var arr = _.last(self.curFullAction);
        action = arr[0];
        opt = arr[1];
    }
    else {
        opt = {};
        action = _.sample(actions);
        self.curFullAction.push([action, opt]);
        self.actionHistory.push([action, opt]);
    }

    setTimeout(function() {
        action.call(self, opt);
    }, 100);
};

var timePomeloRequest = function (conf, msg, cb) {
    monitor('start', conf.name, conf.reqId);
    pomelo.request(conf.route, msg, function (data) {
        monitor('end', conf.name, conf.reqId);

        if (data.error) {
            cb({code: data.error.code, message: data.error.message, conf: conf});
        }
        else {
            cb(null, data);
        }
    });
};

Role.prototype.equip = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(_.values(self.items), {defId: 1001});
    var hero = _.findWhere(self.heroes, {defId: 101});

    if (hero && weapon) {
        timePomeloRequest(ActFlagType.EQUIP, {equipmentId: weapon.id, heroId: hero.id}, function (data) {
            cb();
        });
    }
    else {
        cb();
    }
};

Role.prototype.unEquip = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(_.values(self.items), {defId: 1001});

    if (weapon) {
        timePomeloRequest(ActFlagType.UNEQUIP, {equipmentId: weapon.id}, function (data) {
            cb();
        });
    }
    else {
        cb();
    }
};

Role.prototype.destroyEquipment = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(self.items, {defId: 1001});
    if (true) {
        timePomeloRequest(ActFlagType.DESTRUCT, {equipmentId: "914fe772-ce0a-47cd-954c-cdb0bf98cb08"}, function (data) {
            cb();
        });
    }
    else {
        cb();
    }
};

Role.prototype.listLevel = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.LIST_LEVEL, {}, function (data) {
        console.log(data);
        cb();
    });
};

Role.prototype.start = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.START, {level: 10104}, function (data) {
        cb();
    });
};

Role.prototype.end = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.END, {level: 10104, coins: 0, items: []}, function (data) {
        cb();
    });
};

Role.prototype.refreshStore = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.REFRESH_STORE, {isGold: true}, function (data) {
        cb();
    });
};

Role.prototype.coinDraw = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.COIN_DRAW, {}, function (data) {
        console.log(data);
        cb();
    });
};

Role.prototype.replace = function (pomelo, cb) {
    var self = this;
    timePomeloRequest(ActFlagType.REPLACE, {hero: "dab95958-e0b0-4ace-ad11-19b1f206b995", with: "76afabe5-5165-4e31-9f9d-98a21bb0b0ff"}, function (data) {
        cb();
    });
};

Role.prototype.rename = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.RENAME, {name: "set_name_" + _.random(100)}, function (data) {
        cb();
    });
};

Role.prototype.pickHero = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.PICKHERO, {heroId: 10001}, function (data) {
        cb();
    });
};

Role.prototype.listSouls = function (pomelo, cb) {
    var self = this;
    timePomeloRequest(ActFlagType.LIST_SOULS, {}, function (data) {
        self.souls = data;
        cb();
    });
};

Role.prototype.redeemSouls = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.REDEEM_SOULS, {}, function (data) {
        cb();
    });
};

Role.prototype.refineHero = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.REFINE_HERO, {heroId: "2ddc3819-4330-48c7-aac6-4f1e6e22b07f", matId: "fcadc6a0-e40c-43a2-b818-93eacfade904"}, function (data) {
        console.log(data);
        cb();
    });
};

Role.prototype.useItem = function (pomelo, cb) {
    timePomeloRequest(ActFlagType.USE_ITEM, {itemId: "c3109a42-caf5-480e-9615-36e7a7cc77b2", target: "41a602cc-b724-434a-89df-112872bc4dee"}, function (data) {
        cb();
    });
};

(new Role()).startTest();
