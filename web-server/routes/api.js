var pomeloConn = require("../pomelo-conn");
var _ = require("underscore");
var Promise = require("bluebird");
var appModels = require("../../shared/models");
var r = require("rethinkdb");
var csv = require("csv");

exports.nodeInfo = function (req, res) {
    Promise.all([
        pomeloConn.client.request('nodeInfo', null),
        pomeloConn.client.request('systemInfo', null),
        pomeloConn.client.request('__console__', {signal: 'list'})])
    .spread(function (nodes, system, console) {
        var ret = {nodes: {}};
        for (var id in nodes) {
            if (nodes.hasOwnProperty(id)) {
                ret.nodes[id] = _.extend({}, nodes[id], system[id], console.msg[id]);
            }
        }
        res.json(ret);
    })
    .catch(function (err) {
        res.send(400);
        console.log(err.stack);
    });
};

exports.basicStats = function (req, res) {
    Promise.all([
        pomeloConn.client.request('onlineUser', null),
        appModels.User.countP(),
        appModels.Role.countP()])
    .spread(function (onlineUsers, userCount, roleCount) {
        var ret = {};
        ret.onlineUser = _.reduce(_.values(onlineUsers), function (memo, stat) {
            return {
                totalConnCount: memo.totalConnCount + stat.totalConnCount,
                loginedCount: memo.loginedCount + stat.loginedCount,
                loginedList: memo.loginedList.concat(stat.loginedList)
            };
        }, {totalConnCount: 0, loginedCount: 0, loginedList: []});
        ret.totalUsers = userCount;
        ret.totalRoles = roleCount;

        res.json(ret);
    })
    .catch(function (err) {
        res.send(400);
        console.log(err.stack);
    });
};

function partitionRoleCount() {
    return new Promise(function (resolve, reject) {
        var helperModel = new appModels.Partition();
        var adapter = helperModel._adapter();
        adapter.pool.acquire(function(error, client) {
            r.db(adapter.database).table("role").groupBy("partition", r.count).run(client, function (err, data) {
                adapter.pool.release(client);

                if (err) {
                    reject(err);
                }
                else {
                    resolve(data);
                }
            });
        });
    });
}

exports.partitions = function (req, res) {
    Promise.join(appModels.Partition.allP(), partitionRoleCount(), pomeloConn.client.request('onlineUser', null))
    .spread(function (parts, roleCounts, onlineUsers) {
        onlineUsers = _.reduce(_.values(onlineUsers), function (memo, stat) {
            return {
                totalConnCount: memo.totalConnCount + stat.totalConnCount,
                loginedCount: memo.loginedCount + stat.loginedCount,
                loginedList: memo.loginedList.concat(stat.loginedList)
            };
        });
        var partUsers = _.groupBy(onlineUsers.loginedList, function (u) {return u.role.partition;});

        for (var i=0;i<parts.length;i++) {
            var p = parts[i] = _.pick(parts[i], ["id", "name", "public", "openSince", "distro"]);
            var countObj = _.find(roleCounts, function (red) {
                return red.group.partition === p.id;
            });
            if (countObj)
                p.roleCount = countObj.reduction;
            else
                p.roleCount = 0;
            var partU = partUsers[p.id];
            if (partU)
                p.onlineRoles = partU.length;
            else
                p.onlineRoles = 0;
        }

        res.json({
            partitions: parts
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.addPartition = function (req, res) {
    var newPart = req.body;
    var createTime = new Date();

    appModels.Partition.findOrCreateP({
        where: {
            name: newPart.name
        }
    },{
        name: newPart.name,
        public: newPart.public,
        distro: newPart.distro,
        openSince: newPart.openSince,
        createTime: createTime
    })
    .then(function (p) {
        if (p.createTime.getTime() === createTime.getTime()) {
            var ret = _.pick(p, ["id", "name", "public", "openSince", "distro"]);
            ret.roleCount = 0;
            ret.onlineRoles = 0;
            res.send(ret);
        }
        else {
            res.send(400, {message: "区名重复"});
        }
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.removePartition = function (req, res) {
    var part = req.body;

    Promise.join(appModels.Partition.findP(part.id), partitionRoleCount())
    .spread(function (p, roleCounts) {
        if (!p) {
            return res.send(400, {message: "分区不存在"});
        }
        var countObj = _.find(roleCounts, function (red) {
            return red.group.partition === p.id;
        });
        if (countObj && countObj.reduction > 0) {
            return res.send(400, {message: "区内已有角色，不能删除"});
        }
        res.send({id: p.id});
        return p.destroyP();
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.userList = function (req, res) {
    var listOptions = req.body;

    var query = {
        where: {},
        limit: listOptions.pageSize,
        order: "id",
        skip: (listOptions.page - 1) * listOptions.pageSize
    };
    if (listOptions.partitions) {
        query.where.partition = {inq: listOptions.partitions};
    }
    if (listOptions.hint) {
        query.where.name = {match: listOptions.hint};
    }

    Promise.join(appModels.Role.allP(query), appModels.Role.countP(query.where))
    .spread(function (roles, roleCount) {
        res.json({
            roles: _.map(roles, roleToJson),
            totalRoles: roleCount
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.updateRole = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var diff = req.body;
    var rawObject = false;

    if (!req.body.id) {
        diff = req.body.diff;
        rawObject = req.body.rawObject;
    }

    appModels.Role.findP(diff.id).then(function (role) {
        if (!role) {
            return Promise.reject();
        }
        delete diff.id;
        return role.updateAttributesP(diff);
    })
    .then(function (role) {
        res.json(roleToJson(role, rawObject));
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.updateHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var diff = req.body;

    appModels.Hero.findP(diff.id).then(function (h) {
        if (!h) {
            return Promise.reject();
        }
        delete diff.id;
        return h.updateAttributesP(diff);
    })
    .then(function (h) {
        res.json(heroToJson(h));
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.updateItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var diff = req.body;

    appModels.Item.findP(diff.id).then(function (it) {
        if (!it) {
            return Promise.reject();
        }
        delete diff.id;
        return it.updateAttributesP(diff);
    })
    .then(function (it) {
        res.json(itemToJson(it));
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.addHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var newHeroes = req.body.heroes;
    var roleId = req.body.role;

    appModels.Role.existsP(roleId)
    .then(function (exists) {
        if (exists) {
            var heroes = _.map(newHeroes, function (heroId) {
                return {
                    heroDefId: heroId,
                    owner: roleId
                };
            });
            return appModels.Hero.createP(heroes);
        }
        else {
            return Promise.reject();
        }
    })
    .then(function (heroes) {
        res.json({
            heroes: _.map(heroes, function (h) {return heroToJson(h);})
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.addItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var newItems = req.body.items;
    var roleId = req.body.role;

    appModels.Role.existsP(roleId)
        .then(function (exists) {
            if (exists) {
                var items = _.map(newItems, function (itemId) {
                    return {
                        itemDefId: itemId,
                        owner: roleId
                    };
                });
                return appModels.Item.createP(items);
            }
            else {
                return Promise.reject();
            }
        })
        .then(function (items) {
            res.json({
                items: _.map(items, function (h) {return itemToJson(h);})
            });
        })
        .catch(function (err) {
            res.send(400);
        });
};

exports.removeHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var hid = req.body.hero;
    appModels.Hero.findP(hid)
    .then(function (hero) {
        if (hero) {
            var unbound = appModels.Item.updateP({where: {bound: hid}, update: {bound: null}});
            return [hero.destroyP(), unbound];
        }
        return null;
    })
    .spread(function () {
        res.send(200);
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.removeItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var itemId = req.body.item;
    appModels.Item.findP(itemId)
    .then(function (item) {
        if (item) {
            var unbound = appModels.Item.updateP({where: {bound: itemId}, update: {bound: null}});
            return [item.destroyP(), unbound];
        }
        return null;
    })
    .spread(function () {
        res.send(200);
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.findRoles = function (req, res) {
    var hint = req.body.hint;
    var queries = [];

    queries.push(appModels.Role.allP({where: {name: {match: hint}}, limit: 10}));
    queries.push(appModels.Role.findP(hint));
    queries.push(appModels.Partition.allP());

    Promise.all(queries)
    .spread(function (roles, r, partitions) {
        if (r) roles.unshift(r);

        partitions = _.groupBy(partitions, "id");
        res.send({
            roles: _.map(roles, function (role) {
                var ret = roleToJson(role);
                var partition = partitions[role.partition][0];
                ret.partName = partition.name;

                return ret;
            })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.getRole = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var uid = req.body.uid;
    Promise.join(appModels.Role.findP(uid), appModels.Hero.allP({where: {owner: uid}}), appModels.Item.allP({where: {owner: uid}}))
    .spread(function (role, heroes, items) {
        res.json({
            role: roleToJson(role, true),
            heroes: _.map(heroes, function (h) {return heroToJson(h);}),
            items: _.map(items, function (item) {return itemToJson(item);})
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.findUsers = function (req, res) {
    var hint = req.body.hint;
    var queries = [];

    var userQuery = {where: {authId: {between: [hint, hint + "\uffff"]}}, limit: 10};
    if (req.body.notAdmin) {
        userQuery.where.manRole = null;
    }

    queries.push(appModels.User.allP(userQuery));
    queries.push(appModels.User.findP(hint));
    queries.push(appModels.Role.allP({where: {name: {match: hint}}, limit: 10}));
    queries.push(appModels.Partition.allP());

    Promise.all(queries)
    .spread(function (users, u, roles, partitions) {
        if (u) {
            users.unshift(u);
        }

        var owner = appModels.User.allP({where: {id: {inq: _.pluck(roles, "owner")}, manRole: null}});
        var ownerRole = Promise.all(_.map(users, function (u) { return appModels.Role.findOneP({where: {owner: u.id}}); }));

        return [users, owner, roles, ownerRole, partitions];
    })
    .spread(function (users, roleOwners, roles, userRoles, partitions) {
        users = _.compact(users.concat(roleOwners));
        roles = _.compact(roles.concat(userRoles));

        partitions = _.groupBy(partitions, "id");
        roles = _.groupBy(roles, "owner");

        res.send({
            users: _.map(users, function (u) {
                var ret = adminToJson(u);
                if (roles[u.id]) {
                    var role = roles[u.id][0];
                    var partition = partitions[role.partition][0];
                    ret.roleName = role.name;
                    ret.partName = partition.name;
                }
                else {
                    ret.roleName = "无角色";
                    ret.partName = "无角色";
                }

                return ret;
            })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

var adminToJson = function (u) {
    var ret = _.pick(u, "id", "manRole");
    for (var i=0;i<u.auth.length;i++) {
        if (u.auth[i].type === "main") {
            ret.name = u.auth[i].id;
            break;
        }
    }
    return ret;
};

var roleToJson = function (role, rawObject) {
    var ret;
    if (rawObject) {
        ret = _.omit(role.toObject(true), "energyRefreshTime", "dailyRefreshData");
    }
    else {
        ret = _.pick(role, "id", "name", "title", "level", "energy", "golds", "coins", "contribs", "partition", "spent");
    }
    ret.createTime = +role.createTime;

    return ret;
};

var heroToJson = function (hero) {
    var ret = hero.toObject(true);
    ret.createTime = +ret.createTime;
    return ret;
};

var itemToJson = function (item) {
    var ret = item.toObject(true);
    ret.createTime = +ret.createTime;
    return ret;
};

exports.adminList = function (req, res) {
    if (!req.session.user.manRole.admin)
        return res.send(400, {message: "没有查看管理员的权限"});

    appModels.User.allP({ where: {manRole: {neq: null}} })
    .then(function (admins) {
        res.json({
            admins: _.map(admins, adminToJson)
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.modifyAdmin = function (req, res) {
    if (!req.session.user.manRole.admin)
        return res.send(400, {message: "没有修改管理员权限的权限"});

    var newAdminRole = req.body;
    appModels.User.findP(newAdminRole.id)
    .then(function (admin) {
        if (admin.manRole === null) {
            return res.send(400, {message: "用户不是管理员"});
        }
        admin.manRole = _.pick(newAdminRole.manRole, "admin", "editUser", "data", "debug");
        return admin.saveP();
    })
    .then(function (admin) {
        res.send(adminToJson(admin));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.removeAdmin = function (req, res) {
    if (!req.session.user.manRole.admin)
        return res.send(400, {message: "没有删除管理员的权限"});

    var newAdminRole = req.body;
    appModels.User.findP(newAdminRole.id)
    .then(function (admin) {
        if (admin.manRole === null) {
            return res.send(200);
        }
        admin.manRole = null;
        return admin.saveP();
    })
    .then(function (admin) {
        res.send(200);
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.addAdmin = function (req, res) {
    if (!req.session.user.manRole.admin)
        return res.send(400, {message: "没有添加管理员的权限"});

    var userId = req.body.userId;
    appModels.User.findP(userId)
    .then(function (admin) {
        if (!admin) {
            return res.send(400, {message: "找不到用户"});
        }
        if (admin.manRole !== null) {
            return res.send(400, {message: "用户已是管理员"});
        }
        admin.manRole = {};
        return admin.saveP();
    })
    .then(function (admin) {
        res.send(adminToJson(admin));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

// data import / data export
var dataColumns = {
    heroDef: ["id", "name", "resKey", "type", "stars", "vitality", "strength", "intelligence", "vitGrowth", "strGrowth", "intelGrowth",
        "hp", "attack", "magic", "defense", "resist", "critical", "attackSpeed", "speed", "ballLev", "skill",
        "ice", "fire", "slow", "weak", "attackDelta", "damage", "damageReduction", "damageFactor", "damageRedFactor",
        "physicalResist", "magicResist", "attackFactor", "defenseFactor"],
    itemDef: ["id", "name", "type", "quality", "resKey", "levelReq", "price", "destructCoeff"],
    treasure: ["id", "type", "count", "desc", "candidates", "weights"],
    ballistic: ["id", "value"]
};

var transformHeroDef = function (row) {
    row.attackDelta = JSON.parse(row.attackDelta || "[]");
    row.id = parseInt(row.id);
    row.name = row.name || "";
    row.resKey = row.resKey || "";
    row.type = row.type || "";

    _.each(["stars", "vitality", "strength", "intelligence", "hp", "attack", "magic", "defense",
        "resist", "vitGrowth", "strGrowth", "intelGrowth", "critical", "attackSpeed", "speed", "ballLev",
        "ice", "fire", "slow", "weak", "damage", "damageReduction", "damageFactor", "damageRedFactor",
        "physicalResist", "magicResist", "skill", "attackFactor", "defenseFactor"], function (f) {
        row[f] = parseFloat(row[f]) || 0;
    });
};

var transformItemDef = function (row) {
    row.id = parseInt(row.id);
    row.quality = parseInt(row.quality);
    row.levelReq = parseInt(row.levelReq);
    row.price = parseInt(row.price);
    row.destructCoeff = JSON.parse(row.destructCoeff);
};

var transformTreasure = function (row) {
    row.id = parseInt(row.id);
    row.count = parseInt(row.count);
    row.candidates = JSON.parse(row.candidates || "[]");
    row.weights = JSON.parse(row.weights || "[]");
};

var transformBallistic = function (row) {
    if (row.id === "") return;
    var ins = new appModels.Ballistic();
    var adapter = ins._adapter();
    return Promise.promisify(adapter.save, adapter)("ballistic", row);
};

exports.import = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导入数据的权限"});

    var file = req.files.file;
    var data = req.body;
    var modelsAndTransform = {
        heroDef: [appModels.HeroDef, transformHeroDef],
        itemDef: [appModels.ItemDef, transformItemDef],
        treasure: [appModels.Treasure, transformTreasure],
        ballistic: [appModels.Ballistic, transformBallistic]
    };

    csv().from.path(file.path, { columns: dataColumns[data.tag] }).to.array(function (newDefs) {
        while (newDefs[0].id === "[SKIP]") {
            newDefs.shift();
        }
        var updates = _.map(newDefs, function (d) {
            if (d && d.id !== null && d.id !== undefined && d.id !== "" && !_.isNaN(d.id))
            {
                if (Promise.is(d)) {
                    return d;
                }
                else {
                    return modelsAndTransform[data.tag][0].upsertP(d);
                }
            }
        });

        Promise.all(updates).then(function () {
            res.send(200);
        })
        .catch(function (err) {
            res.send(400, {message: ""+err});
        });
    }).transform(function (row, index) {
        if (index < 2) {
            row.id = "[SKIP]";
        }
        else {
            var newRow = modelsAndTransform[data.tag][1](row);
            if (newRow) return newRow;
        }
        return row;
    });
};

exports.export = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导出数据的权限"});

    var data = req.body;
    res.header('content-type','text/csv');
    res.header('content-disposition', 'attachment; filename=' + data.tag + '.csv');

    if (data.tag === "heroDef") {
        appModels.HeroDef.allP({order: "id"}).then(function (hDefs) {
            csv().from.array(hDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns.heroDef
            }).transform(function (row) {
                row.attackDelta = JSON.stringify(row.attackDelta);
                return row;
            });
        });
    }
    else if (data.tag === "itemDef") {
        appModels.ItemDef.allP({order: "id"}).then(function (itemDefs) {
            csv().from.array(itemDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: {
                    id: "id",
                    name: "道具名",
                    type: "类型",
                    quality: "品质",
                    resKey: "拼音",
                    levelReq: "等级需求",
                    price: "售价",
                    destructCoeff: "拆解参数"
                }
            }).transform(function (row) {
                row.destructCoeff = JSON.stringify(row.destructCoeff);
                return row;
            });
        });
    }
    else if (data.tag === "stage") {

    }
    else if (data.tag === "treasure") {
        appModels.Treasure.allP({order: "id"}).then(function (treasures) {
            csv().from.array(treasures, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: {
                    id: "id",
                    type: "类型",
                    count: "数量",
                    desc: "说明",
                    candidates: "选择",
                    weights: "权重"
                }
            });
        }).transform(function (row) {
            row.candidates = JSON.stringify(row.candidates);
            row.weights = JSON.stringify(row.weights);
            return row;
        });
    }
    else if (data.tag === "ballistic") {
        appModels.Ballistic.allP({order: "id"}).then(function (treasures) {
            csv().from.array(treasures, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: {
                    id: "key",
                    value: "value"
                }
            });
        });
    }
};

exports.heroDefs = function (req, res) {
    appModels.HeroDef.allP()
    .then(function (data) {
        res.json({
            heroes: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.treasures = function (req, res) {
    appModels.Treasure.allP()
    .then(function (data) {
        res.json({
            treasures: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.itemDefs = function (req, res) {
    appModels.ItemDef.allP()
    .then(function (data) {
        res.json({
            items: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.balls = function (req, res) {
    appModels.Ballistic.allP()
    .then(function (data) {
        res.json({
            balls: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

// debug handlers
exports.kickAll = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "kickAll"});
    res.send(200);
};

exports.broadcast = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "broadcast", msg: req.body.content || "测试消息."});
    res.send(200);
};

exports.chat = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "chat", content: req.body.content});
    res.send(200);
};

exports.sendMail = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "mail", target: req.body.role, content: req.body.content});
    res.send(200);
};

exports.getStatInfo = function (req, res) {
};
