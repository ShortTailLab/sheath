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

var monitor = function (type, name, reqId) {
    if (typeof actor !== 'undefined') {
        actor.emit(type, name, reqId);
    } else {
        console.error(Array.prototype.slice.call(arguments, 0));
    }
};

var offset = (typeof actor !== 'undefined') ? actor.id : 1;

if (typeof actor !== 'undefined') {
    console.log(offset + ' ' + actor.id);
}

var Role = function () {
};

Role.prototype.requestAsync = function(conf, msg) {
    var self = this;
    monitor('start', conf.name, conf.reqId);
    return new Promise(function(resolve, reject) {
        self.pomelo.request(conf.route, msg, function (data) {
            monitor('end', conf.name, conf.reqId);
            if (data.error) {
                reject({code: data.error.code, message: data.error.message, conf: conf});
            }
            else {
                resolve(data);
            }
        });
    });
};

Role.prototype.startTest = function() {
    var self = this;
    self.pomelo = requireUnCached(cwd + "/app/script/pomelo-client");
    self.username = "test_" + _.random(1, 1000000);
    self.password = "password";
    self.curFullAction = [];
    self.actionCount = 0;
    self.costTime = 0;
    self.actionTimeArr = [];

    var onReady = function() {
        self.pomelo.on('onKick', function (data) {
            console.log('You have been kicked offline.');
        });

        self.pomelo.on('onChat', function (data) {
//            console.log('Recv chat message.' + JSON.stringify(data));
        });

        self.pomelo.on('onAnnounce', function (data) {
            console.log('Recv Announcement.' + JSON.stringify(data));
        });

        self.pomelo.on('onEndAnnounce', function (data) {
            console.log('Recv EndAnnouncement.' + JSON.stringify(data));
        });

        self.pomelo.on('disconnect', function (reason) {
            console.log('disconnect invoke!' + reason);
        });

        self.lastTime = _.now();
        self.enter();
    };

    self.pomelo.init({host: "127.0.0.1", port: 3010, log: true}, onReady);
};

Role.prototype.finishAction = function() {
    this.curFullAction.pop();
    this.doAction();
};

Role.prototype.addAction = function(action, opt) {
    this.curFullAction.push([action, opt || {}]);
    this.doAction();
};

Role.prototype.replaceAction_1 = function(action, opt) {
    this.curFullAction.pop();
    this.curFullAction.push([action, opt || {}]);
    this.doAction();
};

Role.prototype.replaceAction_2 = function(action, opt) {
    this.curFullAction.pop();
    this.curFullAction.push([action, opt || {}]);
    this.curFullAction.push([null, null]);
};

Role.prototype.printActionCount = function() {
    var self = this;
    ++self.actionCount;
    var now = _.now();
    var elapse = now - self.lastTime;
    self.lastTime = now;
    var msec;
    self.actionTimeArr.push(elapse);

    if(self.actionCount <= 100) {
        self.costTime += elapse;
        msec = self.costTime / self.actionCount;
    }
    else {
        var elapseHead = self.actionTimeArr.shift();
        self.costTime += elapse - elapseHead;
        msec = self.costTime / 100;
    }

    console.log("---------------------------------------执行完第" + self.actionCount + "个action   每个action耗费时间 " + msec + "毫秒");
};

Role.prototype.resolveCommon = function(promise) {
    var self = this;
    return promise.then(function() {
        self.printActionCount();
        self.finishAction();
    })
    .catch(function(err) {
        self.printActionCount();
        var errMsg = "";
        if(err.message) {
            errMsg = " err.message = " + err.message;
        }

        if(err.conf) {
            console.log(err.conf.route + " failed!" + errMsg + " err.code = " + err.code);
        }
        else {
            console.log("error happend : " + err);
        }

        if (err.code === Constants.LoginFailed.AlreadyLoggedIn.code) {
            self.finishAction();
        }
//        else if(err.code === Constants.NEED_AUTH.code) {
//            self.addAction(self.enter);
//        }
//        else if(err.code === Constants.LoginFailed.ID_PASSWORD_MISMATCH) {
//            self.username = "test_" + _.random(1, 1000000);
//            self.doAction();
//        }
        else if(err.code === Constants.NO_COINS.code || err.code === Constants.NO_GOLDS.code) {
            self.addAction(self.robotGm_addMoney);
        }
        else if(err.code === Constants.NO_IRONS.code) {
            self.addAction(self.robotGm_addIron);
        }
        else if(err.code === Constants.NO_ENERGY.code) {
            self.addAction(self.robotGm_addEnergy);
        }
        else if(err.code === Constants.StageFailed.LevelRequired.code) {
            self.addAction(self.robotGm_upgradeLevel);
        }
        else if(err.code === Constants.StoreFailed.NO_PURCHASE.code) {
            self.addAction(self.robotGm_refreshPurchase);
        }
        else if(err.code === Constants.NO_ROOM.code) {
            for(var i = 0; i < 100; ++i) {
                self.curFullAction.push([self.sellItem, {}]);
            }
            self.doAction();
        }
        else {
            throw err; //err should be resolved in specific action.
        }
    });
};

Role.prototype.enter = function () {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ENTRY, {
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
        })
        .then(function (data) {
            self.user = data.user;
            self.partitions = data.partitions;
            return self.requestAsync(ActFlagType.ENTER_PARTITION, {partId: data.partitions[0].id});
        })
        .then(function (data) {
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
        })
    )
    .catch(function (err) {
        //error specific to this action, should be resolved here
    });
};

Role.prototype.claimDailyReward = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.CLAIM_DAILY_REWARD, {
        })
        .then(function(data) {
            self.reward = data.reward;
        })
    )
    .catch(function(err) {
        if(err.code === Constants.ALREADY_CLAIMED.code) {
            self.addAction(self.robotGm_reset, {type: "claimDailyReward"});
        }
    });
};

Role.prototype.claimHourlyReward = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.CLAIM_QHOURLY_REWARD, {
        })
        .then(function(data) {
            self.reward = data.reward;
        })
    )
    .catch(function(err) {
        if(err.code === Constants.ALREADY_CLAIMED.code) {
            self.addAction(self.robotGm_reset, {type: "claimHourlyReward"});
        }
    });
};

Role.prototype.setTeam = function(opt) {
    var self = this;
    var heroes;
    if(opt.heroes) {
        heroes = opt.heroes;
    }
    else {
        heroes = _.pluck(_.sample(self.heroes, 3), "id");
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.SET_TEAM, {
            heroes: heroes,
            formation: 2
        })
        .then(function(data) {
            self.role = data.role;
        })
    );
};

Role.prototype.listItem = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_ITEM, {
        })
        .then(function(data) {
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
        self.requestAsync(ActFlagType.UPGRADE_EQUIPMENT, {
            equipmentId: item.id
        })
        .then(function (data) {
            self.role.energy = data.stateDiff.energy;
            self.role.coins = data.stateDiff.coins;
            self.role.golds = data.stateDiff.golds;
            self.role.contribs = data.stateDiff.contribs;
            self.updateItem(data.equipment);
        })
    )
    .catch(function(err) {
        if (err.code === Constants.EquipmentFailed.LEVEL_MAX.code) {
            if(item.level >= 80) {
                self.addAction(self.robotGm_reset, {type: "upgradeEquip", eqId: item.id});
            }
            else if (self.role.level < 80) {
                self.addAction(self.robotGm_upgradeLevel);
            }
        }
    });
};

Role.prototype.sellItem = function() {
    var self = this;
    if(!self.items || _.isEmpty(self.items)) {
        self.finishAction();
        return;
    }

    var item = _.find(self.items, function(it) {
        return self.equipDefById[it.defId] === undefined;
    });

    if(!item) {
        self.replaceAction_1(self.destroyEquipment);
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.SELL, {
            itemId: item.id
        })
        .then(function (data) {
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
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addMoney"
        })
        .then(function(data) {
            self.role.golds = data.golds;
            self.role.coins = data.coins;
        })
    );
};

Role.prototype.robotGm_addIron = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addIron"
        })
        .then(function(data) {
            self.role.irons = data.irons;
        })
    );
};

Role.prototype.robotGm_addSoul = function(opt) {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addSoul",
            heroId: opt.heroId
        })
        .then(function(data) {
        })
    );
};

Role.prototype.robotGm_addEnergy = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addEnergy"
        })
        .then(function(data) {
            self.role.energy = data.energy;
        })
    );
};

Role.prototype.robotGm_addMail = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "addMail"
        })
        .then(function(data) {
            self.mails = self.mails || [];
            self.mails.push(data.mail);
        })
    );
};

Role.prototype.robotGm_refreshPurchase = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "refreshPurchase"
        })
        .then(function(data) {
        })
    );
};

Role.prototype.robotGm_upgradeLevel = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "upgradeLevel"
        })
        .then(function(data) {
            self.role.level = data.level;
        })
    );
};

Role.prototype.robotGm_reset = function(opt) {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "reset",
            resetOpt: opt
        })
        .then(function(data) {
            if(opt.type === "tutorial") {
                self.role.tutorial = data.tutorial;
            }
        })
    );
};

Role.prototype.robotGm_delHero = function(opt) {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.ROBOT_GM, {
            cmdType: "delHero",
            heroId: opt.heroId
        })
        .then(function(data) {
            _.remove(self.heroes, function(hero) {
                if(hero.defId === opt.heroId) {
                    _.remove(self.role.team, function(id) {
                        return hero.id === id;
                    });

                    return true;
                }

                return false;
            });

            self.replaceAction_2(self.setTeam, {heroes: self.role.team});
        })
    );
};

Role.prototype.listStore = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_STORE, {
        })
        .then(function(data) {
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
            storeId = (_.find(self.storeItems, function(store) {
                return self.equipDefById[store.defId];
            }) || {}).id;
        }
        else if(opt.buyType === "gem") {
            storeId = (_.find(self.storeItems, function(store) {
                return _.any(self.itemDefs, function(def) {
                    return def.id === store.defId && def.type === "宝石";
                });
            }) || {}).id;
        }
        else if(opt.buyType === "useItem") {
            storeId = (_.find(self.storeItems, function(store) {
                return _.any(self.itemDefs, function(def) {
                    return def.id === store.defId && def.useTarget === 1 && def.itemEffect && _.size(def.itemEffect) > 0;
                });
            }) || {}).id;
        }
        else {
            storeId = (_.sample(self.storeItems) || {}).id;
        }
    }
    else {
        storeId = opt.storeId;
    }

    if (storeId === null || storeId === undefined) {
        self.resolveCommon(Promise.resolve());
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.STORE_BUY, {
            siId: storeId
        })
        .then(function(data) {
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

Role.prototype.updateItem = function(item) {
    var idx = _.findIndex(this.items, function(it) {
        return item.id === it.id;
    });

    this.items[idx] = item;
};

Role.prototype.updateHero = function(hero) {
    var idx = _.findIndex(this.heroes, function(h) {
        return h.id === hero.id;
    });

    this.heroes[idx] = hero;
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

Role.prototype.getOneUnClaimedMail = function() {
    var self = this;
    if(!self.mails || _.isEmpty(self.mails)) {
        self.addAction(self.robotGm_addMail);
        return null;
    }

    var mail = _.find(self.mails, function(mail) {
        return !mail.claimed;
    });

    if(!mail) {
        if(self.mails.length < 100) {
            self.addAction(self.robotGm_addMail);
        }

        return null;
    }

    return mail;
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

Role.prototype.getOneUseItem = function() {
    var self = this;

    if(!self.items || _.isEmpty(self.items)) {
        self.addAction(self.storeBuy, {buyType: "useItem"});
        return null;
    }

    var item = _.find(self.items, function (item) {
        return _.any(self.itemDefs, function(def) {
            return def.id === item.defId && def.useTarget === 1 && def.itemEffect && _.size(def.itemEffect) > 0;
        });
    });

    if (!item) {
        self.addAction(self.storeBuy, {buyType: "useItem"});
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
        self.requestAsync(ActFlagType.REFINE_EQUIPMENT, {
            equipmentId: item.id
        })
        .then(function(data) {
            self.role = data.role;
            self.updateItem(data.equipment);
        })
    )
    .catch(function(err) {
        if (err.code === Constants.EquipmentFailed.LEVEL_MAX.code) {
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

    if (!itemDef) {
        self.resolveCommon(Promise.resolve());
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.REFINE_GEM, {
            gemType: itemDef.id
        })
        .then(function(data) {
            _.remove(self.items, function(item) {
                return _.some(data.destroyed, function(id) {
                    return id === item.id;
                });
            });
            self.updateItem(data.gem);
        })
    )
    .catch(function(err) {
        if(err.code === Constants.EquipmentFailed.NO_MATERIAL.code) {
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
        self.requestAsync(ActFlagType.SET_GEM, {
            gemId: gem.id,
            equipmentId: item.id
        })
        .then(function(data) {
        })
    )
    .catch(function(err) {
        if(err.code === Constants.EquipmentFailed.ALREADY_BOUND.code) {
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
        self.requestAsync(ActFlagType.REMOVE_GEM, {
            gemId: gem.id
        })
        .then(function(data) {
        })
    );
};

Role.prototype.destroyEquipment = function(opt) {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.DESTRUCT, {
            equipmentId: item.id
        })
        .then(function(data) {
            self.role = data.role;
            _.remove(self.items, function(item) {
                return item.id === data.destroyed;
            });
        })
    );
};

Role.prototype.listHeroDef = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_HERO_DEF, {
        })
        .then(function(data) {
            self.heroDefs = data.defs;
        })
    );
};

Role.prototype.listItemDef = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_ITEM_DEF, {
        })
        .then(function(data) {
            self.itemDefs = data.items;
            self.equipDefById = _.indexBy(data.equipments, "id");
        })
    );
};

Role.prototype.equip = function() {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    var heroId = _.compact(self.heroes)[0].id;
    self.resolveCommon(
        self.requestAsync(ActFlagType.EQUIP, {
            equipmentId: item.id,
            heroId: heroId
        })
        .then(function(data) {
            self.updateItem(data.equipment);
        })
    );
};

Role.prototype.unEquip = function() {
    var self = this;
    var item = self.getOneEquipment();

    if(!item) {
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.UNEQUIP, {
            equipmentId: item.id
        })
        .then(function(data) {
            self.updateItem(data.equipment);
        })
    );
};

Role.prototype.listHero = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_HERO, {
        })
        .then(function(data) {
            self.heroes = data.heroes;
        })
    );
};

Role.prototype.listMail = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_MAIL, {
        })
        .then(function(data) {
            self.mails = data.mails;
        })
    );
};

Role.prototype.claimMail = function() {
    var self = this;
    var mail = self.getOneUnClaimedMail();

    if(!self.mails || self.mails.length < 100) {
        if(!mail) {
            return;
        }
    }
    else {
        self.finishAction();
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.CLAIM_MAIL, {
            mailId: mail.id
        })
        .then(function(data) {
            self.role = data.role;
            mail.claimed = true;
        })
    )
    .catch(function(err) {
        if(err.code === Constants.ALREADY_CLAIMED.code) {
            self.finishAction();
        }
    });
};

Role.prototype.chat = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.CHAT, {
            target: "*",
            content: "this is a mail"
        })
        .then(function(data) {
        })
    );
};

Role.prototype.listTask = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_TASK, {
        })
        .then(function(data) {
        })
    );
};

Role.prototype.listLevel = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_LEVEL, {
        })
        .then(function(data) {
            self.stages = data.stages;
        })
    );
};

Role.prototype.start = function() {
    var self = this;
    var stage = _.sample(self.stages);
    var level = _.sample(stage.levels).id;
    self.resolveCommon(
        self.requestAsync(ActFlagType.START, {
            level: level
        })
        .then(function(data) {
            self.enemies = data.enemies;
            if(self.enemies) {
                self.level = level;
            }
        })
    );
};

Role.prototype.end = function() {
    var self = this;
    if(!self.level) {
        self.addAction(self.start);
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.END, {
            level: self.level,
            coins: 0,
            items: []
        })
        .then(function(data) {
            self.role = data.role;
            self.heroExp = data.heroExp;
            self.roleExp = data.roleExp;
        })
    );
};

Role.prototype.refreshStore = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.REFRESH_STORE, {
            isGold: true
        })
        .then(function(data) {
        })
    )
    .catch(function(err) {
        if(err.code === Constants.StoreFailed.NO_REFRESH.code) {
            self.finishAction();
        }
    });
};

Role.prototype.coinDraw = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.COIN_DRAW, {
        })
        .then(function(data) {
            self.role = data.role;
            self.soulHeroId = _.keys(data.souls)[0];
        })
    );
};

Role.prototype.goldDraw = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.GOLD_DRAW, {
        })
        .then(function(data) {
            self.role = data.role;
            self.soulHeroId = _.keys(data.souls)[0];
        })
    );
};

Role.prototype.useItem = function() {
    var self = this;
    var item = self.getOneUseItem();

    if(!item) {
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.USE_ITEM, {
            itemId: item.id,
            target: self.role.id
        })
        .then(function(data) {
            self.role = data.role;
            _.remove(self.items, function(it) {
                return it.id === item.id;
            });
        })
    );
};

Role.prototype.replace = function() {
    var self = this;
    if(!self.role.team || _.size(_.compact(self.role.team)) < 2) {
        self.addAction(self.setTeam);
        return;
    }

    var heroes = _.sample(_.compact(self.role.team), 2);
    self.resolveCommon(
        self.requestAsync(ActFlagType.REPLACE, {
            hero: heroes[0],
            with: heroes[1]
        })
        .then(function(data) {
        })
    )
    .catch(function(err) {
        if(err.code === Constants.InvalidRequest.code) {
            self.finishAction();
        }
    });
};

Role.prototype.rename = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.RENAME, {
            name: "name" + _.random(1, 1000000)
        })
        .then(function(data) {
            self.role.tutorial = data.tutorial;
        })
    )
    .catch(function(err) {
        if(err.code === Constants.TutorialFailed.TutorialStateError.code) {
            self.addAction(self.robotGm_reset, {type: "tutorial"});
        }
        else if(err.code === Constants.NameInvalid.code) {
            self.doAction();
        }
    });
};

Role.prototype.pickHero = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.PICKHERO, {
            heroId: _.sample(self.heroCans)
        })
        .then(function(data) {
            self.role.tutorial = data.tutorial;
            self.role.team[0] = data.newHero.id;
            self.heroes.push(data.newHero);
        })
    )
    .catch(function(err) {
        if(err.code === Constants.TutorialFailed.TutorialStateError.code) {
            if(self.role.tutorial !== 2) {
                self.addAction(self.robotGm_reset, {type: "tutorial"});
            }
            else {
                self.addAction(self.rename);
            }
        }
    });
};

Role.prototype.listSouls = function() {
    var self = this;
    self.resolveCommon(
        self.requestAsync(ActFlagType.LIST_SOULS, {
        })
        .then(function(data) {
            self.souls = data;
        })
    );
};

Role.prototype.redeemSouls = function() {
    var self = this;

    if(!self.soulHeroId) {
        self.addAction(self.coinDraw);
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.REDEEM_SOULS, {
            heroId: parseInt(self.soulHeroId)
        })
        .then(function(data) {
        })
    )
    .catch(function(err) {
        if(err.code === Constants.HeroFailed.ALREADY_HAVE_HERO.code) {
            self.addAction(self.robotGm_delHero, {heroId: parseInt(self.soulHeroId)});
        }
        else if(err.code === Constants.HeroFailed.NOT_ENOUGH_SOULS.code) {
            self.addAction(self.robotGm_addSoul, {heroId: self.soulHeroId});
        }
    });
};

Role.prototype.refineHero = function() {
    var self = this;
    var hero = _.sample(self.heroes);
    var mat = _.find(self.heroes, function(m) {
        return m.stars === hero.stars && m.defId === hero.defId && m.id !== hero.id && !_.any(self.role.team, function(t) {
            return t === m.id;
        });
    });

    if(!hero || !mat) {
        self.addAction(self.pickHero);
        return;
    }

    self.resolveCommon(
        self.requestAsync(ActFlagType.REFINE_HERO, {
            heroId: hero.id,
            matId: mat.id
        })
        .then(function(data) {
            self.updateHero(data.hero);
            _.remove(self.heroes, {id: mat.id});
        })
    )
    .catch(function(err) {
        if(err.code === Constants.HeroFailed.REFINE_MAX.code) {
            self.finishAction();
        }
    });
};

Role.prototype.doAction = function() {
    var self = this;
    var actions = [
        self.claimDailyReward, self.claimHourlyReward, self.setTeam, self.upgradeEquip, self.sellItem,
        self.listStore, self.refineWeapon, self.refineGem, self.setGem, self.removeGem, self.listHeroDef,
        self.listItemDef, self.equip, self.unEquip, self.listHero, self.listMail, self.claimMail, self.chat,
        self.listTask, self.listLevel, self.start, self.end, self.refreshStore, self.coinDraw, self.goldDraw,
        self.useItem, self.replace, self.listSouls, self.redeemSouls
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
    }

    action.call(self, opt);
};

for(var i = 0; i < 1; ++i) {
    (new Role()).startTest();
}
