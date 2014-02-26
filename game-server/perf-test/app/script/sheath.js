/////////////////////////////////////////////////////////////
var cwd = process.cwd();
var envConfig = require(cwd + '/app/config/env.json');
var config = require(cwd + '/app/config/' + envConfig.env + '/config');
var async = require("async");
var _ = require(cwd + "/node_modules/underscore");

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

var timePomeloRequest = function (conf, msg, cb) {
    monitor('start', conf.name, conf.reqId);
    pomelo.request(conf.route, msg, function (data) {
        monitor('end', conf.name, conf.reqId);

        if (data.error) {
            console.log(conf.name + ' failed!' + (data.error.message || data.error.code));
        }
        else {
//            console.log(data);
        }
        cb(data);
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

var offset = (typeof actor !== 'undefined') ? actor.id : 1;

if (typeof actor !== 'undefined') {
    console.log(offset + ' ' + actor.id);
}

var Role = function () {
};

Role.prototype.entry = function entry(host, port, accType, username, password) {
    var self = this;
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
            self.user = data.user;

            timePomeloRequest(ActFlagType.ENTER_PARTITION, {partId: data.partitions[0].id}, function (data) {
                self.role = data.role;
                self.afterLogin(pomelo);
            });
        });
    };

    // 初始化socketClient
    pomelo.init({host: host, port: port, log: true}, entryFunc);
};

Role.prototype.afterLogin = function (pomelo) {
    var self = this;

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

    timePomeloRequest(ActFlagType.LIST_ITEM_DEF, {}, function (data) {
        self.itemDefs = data.defs;
        timePomeloRequest(ActFlagType.LIST_HERO_DEF, {}, function (data) {
            self.heroDefs = data.defs;
            timePomeloRequest(ActFlagType.LIST_HERO, {}, function (data) {
                self.heroes = data.heroes;
                timePomeloRequest(ActFlagType.LIST_ITEM, {}, function (data) {
                    self.items = toKeyedObject(data.items);

                    timePomeloRequest(ActFlagType.CLAIM_DAILY_REWARD, {}, function (data) {
                        timePomeloRequest(ActFlagType.CLAIM_QHOURLY_REWARD, {}, function (data) {
                            timePomeloRequest(ActFlagType.LIST_TASK, {}, function (data) {
                                self.randomActions(pomelo);
                            });
                        });
                    });
                });
            });
        });
    });
};

Role.prototype.randomActions = function (pomelo) {
    var actions = [
        this.upgradeWeapon, this.compositeEquipment, this.refineWeapon, this.refineGem, this.equip, this.unEquip,
        this.setGem, this.setTeam
    ];
    var count  = 50;
    var self = this;
    async.whilst(
        function () { return count > 0; },
        function (cb) {
            var index = _.random(0, actions.length - 1);
            count--;
            actions[index].call(self, pomelo, cb);
        },
        function (err) {
            process.exit(0);
        }
    );
};

Role.prototype.upgradeWeapon = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(_.values(self.items), {defId: 1001});
    if (weapon) {
        timePomeloRequest(ActFlagType.UPGRADE_EQUIPMENT, {equipmentId: weapon.id}, function (data) {
            if (!data.error) {
                delete self.items[data.destroyed];
                self.items[data.equipment.id] = data.equipment;
            }
            cb();
        });
    }
    else {
        cb();
    }
};

Role.prototype.compositeEquipment = function (pomelo, cb) {
    var self = this;
    timePomeloRequest(ActFlagType.COMPOSITE_EQUIPMENT, {matType: 1011}, function (data) {
        if (!data.error) {
            delete self.items[data.destroyed[0]];
            delete self.items[data.destroyed[1]];
            self.items[data.newItem.id] = data.newItem;
        }
        cb();
    });
};

Role.prototype.refineWeapon = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(_.values(self.items), {defId: 1001});
    if (weapon) {
        timePomeloRequest(ActFlagType.REFINE_EQUIPMENT, {equipmentId: weapon.id}, function (data) {
            cb();
        });
    }
    else {
        cb();
    }
};

Role.prototype.refineGem = function (pomelo, cb) {
    var self = this;
    timePomeloRequest(ActFlagType.REFINE_GEM, {gemType: 1022, gemLevel: 0}, function (data) {
        if (!data.error) {
            self.items[data.gem.id] = data.gem;
        }
        cb();
    });
};

Role.prototype.setGem = function (pomelo, cb) {
    var self = this;
    var weapon = _.findWhere(_.values(self.items), {defId: 1001});
    var gem = _.findWhere(_.values(self.items), {defId: 1022});
    if (weapon && gem) {
        timePomeloRequest(ActFlagType.SET_GEM, {gemId: gem.id, equipmentId: weapon.id}, function (data) {
            if (!data.error) {
                timePomeloRequest(ActFlagType.REMOVE_GEM, {gemId: gem.id}, function (data) {
                    cb();
                });
            }
            else {
                cb();
            }
        });
    }
    else {
        cb();
    }
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
    if (weapon) {
        timePomeloRequest(ActFlagType.DESTRUCT_CHECK, {equipmentId: weapon.id}, function (data) {
            timePomeloRequest(ActFlagType.DESTRUCT, {equipmentId: weapon.id}, function (data) {
                cb();
            });
        });
    }
    else {
        cb();
    }
};

Role.prototype.setTeam = function (pomelo, cb) {
    var self = this;
    var randomHeroes = _.pluck(_.sample(self.heroes, 3), "id");
    while (randomHeroes.length < 5) {
        randomHeroes.push(null);
    }

    timePomeloRequest(ActFlagType.SET_TEAM, {heroes: randomHeroes, formation: 2}, function (data) {
        cb();
    });
};

setTimeout(function () {
    var role = new Role();
    var uname = "test" + _.random(2000, 2999);
    role.entry("127.0.0.1", 3010, "main", uname, uname);
//    role.entry("sh-test.shorttaillab.com", 3010, "main", uname, uname);
//    role.entry("127.0.0.1", 3010, "main", "colprog", "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8");
}, Math.random() * 2000);
