var pomeloConn = require("../pomelo-conn");
var _ = require("lodash");
var Promise = require("bluebird");
var appModels = require("../../shared/models");
var r = appModels.r;
var csv = require("csv");
var fs = require("fs");
var Iconv  = require('iconv').Iconv;
var GB2UTF8 = new Iconv("GB18030", "UTF-8");
var UTF82GB = new Iconv("UTF-8", "GB18030");

function diffModel(m1, m2, fields) {
    var diff = {id: m1.id};
    for (var i=0;i<fields.length;i++) {
        var field = fields[i];
        if (_.isArray(m1[field])) {
            if (m1[field].length !== m2[field].length) {
                diff[field] = m2[field];
            }
            else {
                for (var j=0;j<m1[field].length;j++) {
                    if (m1[field][j] !== m2[field][j]) {
                        diff[field] ={
                            old: m1[field],
                            new: m2[field]
                        };
                        break;
                    }
                }
            }
        }
        else if (_.isObject(m2[field])) {
            if(!_.isEqual(m2[field], m1[field])) {
                diff[field] ={
                    old: m1[field],
                    new: m2[field]
                };
            }
        }
        else if (m1[field] !== m2[field]) {
            diff[field] = {
                old: m1[field],
                new: m2[field]
            };
        }
    }
    return diff;
}

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
        appModels.User.count().execute(),
        appModels.Role.count().execute()])
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
    return appModels.Partition.group("partition").count().execute();
}

exports.partitions = function (req, res) {
    Promise.join(appModels.Partition.run(), partitionRoleCount(), pomeloConn.client.request('onlineUser', null))
    .spread(function (parts, roleCounts, onlineUsers) {
        onlineUsers = _.reduce(_.values(onlineUsers), function (memo, stat) {
            return {
                totalConnCount: memo.totalConnCount + stat.totalConnCount,
                loginedCount: memo.loginedCount + stat.loginedCount,
                loginedList: memo.loginedList.concat(stat.loginedList)
            };
        }, {totalConnCount: 0, loginedCount: 0, loginedList: []});
        var partUsers = _.groupBy(onlineUsers.loginedList, function (u) {return u.role.partition;});

        for (var i=0;i<parts.length;i++) {
            var p = parts[i] = _.pick(parts[i], ["id", "name", "public", "openSince", "distro"]);
            var countObj = _.findWhere(roleCounts, {group: p.id});
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

    appModels.Partition.filter({name: newPart.name}).execute()
    .then(function (exists) {
        if (exists) {
            res.send(400, {message: "区名重复"});
        }
        else {
            var part = new appModels.Partition({
                name: newPart.name,
                public: newPart.public,
                distro: newPart.distro,
                openSince: newPart.openSince,
                createTime: createTime
            });
            return part.save()
            .then(function (p) {
                var ret = _.pick(p, ["id", "name", "public", "openSince", "distro"]);
                ret.roleCount = 0;
                ret.onlineRoles = 0;
                pomeloConn.client.request("cacheMonitor", {type: "partition", server: "connector"});
                res.send(ret);
            });
        }
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.removePartition = function (req, res) {
    var part = req.body;

    Promise.join(appModels.Partition.get(part.id).run(), partitionRoleCount())
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
        pomeloConn.client.request("cacheMonitor", {type: "partition", server: "connector"});
        return p.delete();
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.userList = function (req, res) {
    var listOptions = req.body;
    var ownerPromise = [[], 0];
    var roleQuery = appModels.Role;

    if (listOptions.partitions) {
        var params = listOptions.partitions.concat([{index: "partition"}]);
        roleQuery = roleQuery.getAll.apply(roleQuery, params);
    }
    if (listOptions.hint) {
        roleQuery = roleQuery.filter(r.row("name").match(listOptions.hint));

        ownerPromise = appModels.User.between(listOptions.hint, listOptions.hint + "\uffff", {index: "authId"}).run()
        .then(function (users) {
            if (users.length === 0)
                return [[], 0];
            else {
                var param = _.pluck(users, "id").concat([{index: "owner"}]);
                var q = appModels.Role.getAll.apply(appModels.Role, param);
                if (listOptions.partitions) {
                    q = q.filter(function (row) {
                        r.expr(listOptions.partitions).contains(row("partition"));
                    });
                }
                return Promise.join(q.run(), q.count.run());
            }
        });
    }

    var skip = (listOptions.page - 1) * listOptions.pageSize;
    var limit = listOptions.pageSize;
    Promise.join(roleQuery.orderBy("id").skip(skip).limit(limit).run(), roleQuery.count().execute(), ownerPromise)
    .spread(function (roles, roleCount, rolesByUser) {
        res.json({
            roles: _.map(roles.concat(rolesByUser[0]), roleToJson),
            totalRoles: roleCount + rolesByUser[1]
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.cloneRole = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var targetPart = req.body.partition;
    var sourceRole = req.body.role;
    var targetUser = req.body.user;
    var newRole;

    if (!targetPart || !sourceRole || !targetUser) {
        return res.send(400);
    }

    appModels.Role.get(sourceRole).run()
    .then(function (role) {
        var newRole = role.toObject(true);
        delete newRole.id;
        delete newRole.createTime;
        newRole.owner = targetUser;
        newRole.partition = targetPart;
        return [(new appModels.Role(newRole)).save(), appModels.Item.getAll(sourceRole, {index: "owner"}).run(), appModels.Hero.getAll(sourceRole, {index: "owner"}).run()];
    })
    .spread(function (role, items, heroes) {
        var mapper = function (entry) {
            var ret = entry.toObject();
            ret.owner = role.id;
            delete ret.id;
            var Model = entry.getModel();
            return (new Model(ret)).save();
        };
        newRole = role;

        var newItems = _.map(items, mapper);
        var newHeroes = _.map(heroes, mapper);
        return [Promise.all(newItems), Promise.all(newHeroes)];
    })
    .all().then(function () {
        res.send({id: newRole.id});
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
    var _role;

    if (!req.body.id) {
        diff = req.body.diff;
        rawObject = req.body.rawObject;
    }

    appModels.Role.get(diff.id).run()
    .then(function (role) {
        if (!role) {
            return Promise.reject();
        }
        delete diff.id;
        if (diff.taskData) {
            diff.taskData = r.literal(diff.taskData);
        }
        _role = role;
        return appModels.Role.get(role.id).update(diff).run();
    })
    .then(function () {
        return appModels.Role.get(_role.id).run();
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

    appModels.Hero.get(diff.id).run()
    .then(function (h) {
        if (!h) {
            return Promise.reject();
        }
        delete diff.id;
        h.merge(diff);
        return h.save();
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

    appModels.Item.get(diff.id).run()
    .then(function (it) {
        if (!it) {
            return Promise.reject();
        }
        delete diff.id;
        it.merge(diff);
        return it.save();
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

    appModels.Role.get(roleId).execute()
    .then(function (exists) {
        if (exists) {
            var heroes = _.map(newHeroes, function (heroId) {
                return (new appModels.Hero({
                    heroDefId: heroId,
                    owner: roleId
                })).save();
            });
            return Promise.all(heroes);
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
        console.log(err);
        res.send(400);
    });
};

exports.addItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var newItems = req.body.items;
    var roleId = req.body.role;

    appModels.Role.get(roleId).execute()
    .then(function (exists) {
        if (exists) {
            var items = _.map(newItems, function (itemId) {
                return (new appModels.Item({
                    itemDefId: itemId,
                    owner: roleId
                })).save();
            });
            return Promise.all(items);
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
    appModels.Hero.get(hid).run()
    .then(function (hero) {
        if (hero) {
            var unbound = appModels.Item.getAll(hid, {index: "bound"}).update({bound: null}).run();
            var removeFromTeam = appModels.Role.get(hero.owner).run().then(function (role) {
                var updated = false;
                for (var i=0;i<role.team.length;i++) {
                    if (role.team[i] === hid) {
                        role.team[i] = null;
                        updated = true;
                    }
                }
                if (updated) return role.save();
                else return role;
            });
            return [removeFromTeam, hero.delete(), unbound];
        }
        return null;
    })
    .spread(function (role) {
        res.json(roleToJson(role, true));
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.removeItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var itemId = req.body.item;
    appModels.Item.get(itemId).run()
    .then(function (item) {
        if (item) {
            var unbound = appModels.Item.getAll(itemId, {index: "bound"}).update({bound: null}).run();
            return [item.delete(), unbound];
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

    queries.push(appModels.Role.filter(r.row("name").match(hint)).limit(10).run());
    queries.push(appModels.Role.get(hint).run());
    queries.push(appModels.Partition.run());

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
    Promise.join(appModels.Role.get(uid).run(), appModels.Hero.getAll(uid, {index: "owner"}).run(), appModels.Item.getAll(uid, {index: "owner"}).run())
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

    var userQuery = appModels.User.between(hint, hint + "\uffff", {index: "authId"}).limit(10);
    if (req.body.notAdmin) {
        userQuery = userQuery.filter({manRole: null});
    }

    queries.push(userQuery.run());
    queries.push(appModels.User.get(hint).run());
    queries.push(appModels.Role.filter(r.row("name").match(hint)).limit(10).run());
    queries.push(appModels.Partition.run());

    Promise.all(queries)
    .spread(function (users, u, roles, partitions) {
        if (u) {
            users.unshift(u);
        }

        var owner = _.pluck(roles, "owner");
        owner = owner.length > 0 ? appModels.User.getAll.apply(appModels.User, owner).filter({manRole: null}).run() : null;
        var ownerRole = Promise.all(_.map(users, function (u) { return appModels.Role.getAll(u.id, {index: "owner"}).limit(1).run(); }));

        return [users, owner, roles, ownerRole, partitions];
    })
    .spread(function (users, roleOwners, roles, userRoles, partitions) {
        users = _.compact(users.concat(roleOwners));
        roles = _.compact(roles.concat(_.map(userRoles, function (ua) {return ua[0];})));

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
    ret.lastLogOff = +role.lastLogOff;

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

    appModels.User.filter(r.row("manRole").ne("null")).run()
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
    appModels.User.get(newAdminRole.id).run()
    .then(function (admin) {
        if (admin.manRole === null) {
            return res.send(400, {message: "用户不是管理员"});
        }
        admin.manRole = _.pick(newAdminRole.manRole, "admin", "editUser", "data", "debug", "announce");
        return admin.save();
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
    appModels.User.get(newAdminRole.id).run()
    .then(function (admin) {
        if (admin.manRole === null) {
            return res.send(200);
        }
        admin.manRole = null;
        return admin.save();
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
    appModels.User.get(userId).run()
    .then(function (admin) {
        if (!admin) {
            return res.send(400, {message: "找不到用户"});
        }
        if (admin.manRole !== null) {
            return res.send(400, {message: "用户已是管理员"});
        }
        admin.manRole = {};
        return admin.save();
    })
    .then(function (admin) {
        res.send(adminToJson(admin));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.updateAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有修改公告的权限"});

    var diff = req.body;

    appModels.Announcement.get(diff.id).run().then(function (ann) {
        if (!ann) {
            return Promise.reject();
        }
        delete diff.id;
        ann.merge(diff);
        return ann.save();
    })
    .then(function (ann) {
        pomeloConn.client.request("debugCommand", {command: "delAnn", annId: ann.id}, function () {
            pomeloConn.client.request("debugCommand", {command: "addAnn", annId: ann.id});
        });
        var ret =  ann.toObject(true);
        ret.start = +ret.start;
        ret.end = +ret.end;
        res.send(200, ret);
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.saveAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有发公告的权限"});

    var newAnn = req.body;
    appModels.Announcement.insert(newAnn, {upsert: true}).run()
    .then(function (ann) {
        if (ann) {
            pomeloConn.client.request("debugCommand", {command: "addAnn", annId: ann.id});
            var ret =  ann.toObject(true);
            ret.start = +ret.start;
            ret.end = +ret.end;
            res.send(200, ret);
        }
        else {
            return Promise.reject();
        }
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.removeAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有删除公告的权限"});

    var annId = req.body.annId;
    appModels.Announcement.get(annId).run()
    .then(function (ann) {
        if (ann) {
            return ann.delete();
        }
        else {
            return Promise.reject(404);
        }
    })
    .then(function () {
        pomeloConn.client.request("debugCommand", {command: "delAnn", annId: annId});
        res.send(200);
    })
    .catch(function (err) {
        if (err === 404) {
            res.send(404);
        }
        else {
            res.send(400);
        }
    });
};

// data import / data export
var dataColumns = {
    heroDef: ["id", "name", "resKey", "type", "stars", "quality", "vitality", "strength", "intelligence", "hp", "hpGrowth",
        "attack", "attackGrowth", "magic", "magicGrowth", "defense", "defenseGrowth", "resist", "resistGrowth",
        "critical", "interval", "attackSpeed", "speed", "ballLev", "secBallLev", "skill",
        "hpRefine", "attackRefine", "magicRefine", "defenseRefine", "resistRefine",
        "ice", "fire", "slow", "weak", "attackDelta", "damage", "damageReduction", "damageFactor", "damageRedFactor",
        "physicalResist", "magicResist", "attackFactor", "defenseFactor", "souls"],
    heroDraw: ["id", "contribs", "golds", "sysWeight", "freeWeight", "paidWeight", "level"],
    heroNode: [],
    itemDef: ["id", 'name', 'quality', 'type', 'subType', 'resKey', 'levelReq', 'stackSize', 'composable', 'composeCount',
        'composeTarget', 'canSell', 'price', 'desc'],
    equipmentDef: ['id', 'name', "color", 'quality', 'type', 'subType', 'levelReq', 'resKey', 'hp', 'attack', 'magic',
        'defense', "resist", 'hpGrowth', 'attackGrowth', 'magicGrowth', 'defenseGrowth', "resistGrowth", 'upgradeCost',
        'hpRefine', 'attackRefine', 'magicRefine', 'defenseRefine', "resistRefine", 'refineCost',
        'slots', 'gemType', 'price'],
    gemDef: ["id", "name", "quality", "subType", "level", "resKey", "levelReq", "stackSize", "composable", "composeCount",
        "composeTarget", "canSell", "price", "hp", "attack", "magic", "defense", "resist", "attackSpeed", "critical",
        "desc", "extended"],
    treasure: ["id", "type", "count", "desc", "candidates", "weights"],
    task: ["id", "level", "type", "weight", "name", "desc", "condition", "reward", "start", "end"],
    storeitem: ["id", "name", "gold", "price", "defId", "count", "desc"],
    ballistic: ["id", "value"]
};

var transformHeroDef = function (row) {
    row.attackDelta = JSON.parse(row.attackDelta || "[]");
    row.id = parseInt(row.id);
    row.name = (row.name || "").trim();
    row.resKey = (row.resKey || "").trim();
    row.type = (row.type || "").trim();
    row.souls = parseInt(row.souls) || 100;

    _.each(["stars", "quality", "vitality", "strength", "intelligence", "hp", "hpGrowth", "attack", "attackGrowth", "magic",
        "magicGrowth", "defense", "defenseGrowth", "resist", "resistGrowth", "critical", "interval", "attackSpeed",
        "speed", "ballLev", "secBallLev", "skill", "hpRefine", "attackRefine", "magicRefine", "defenseRefine",
        "resistRefine", "ice", "fire", "slow", "weak", "damage", "damageReduction", "damageFactor",
        "damageRedFactor", "physicalResist", "magicResist", "attackFactor", "defenseFactor"], function (f) {
        row[f] = parseFloat(row[f]) || 0;
    });
};

var transformHeroDraw = function (row) {
    row.id = parseInt(row.id);
    row.golds = parseInt(row.golds);
    row.contribs = parseInt(row.contribs);
    row.level = parseInt(row.level);
    row.sysWeight = parseFloat(row.sysWeight);
    row.freeWeight = parseFloat(row.freeWeight);
    row.paidWeight = parseFloat(row.paidWeight);
};

var transformHeroNode = function (row) {
};

var transformItemDef = function (row) {
    row.id = parseInt(row.id);

    _.each(["quality", "levelReq", "stackSize", "composable", "composeCount", "canSell", "price"], function (f) {
        row[f] = parseFloat(row[f]) || 0;
    });
    _.each(["composeTarget"], function (f) {
        if (row[f] && row[f] !== "0") {
            row[f] = JSON.parse(row[f]);
        }
    });
    row.canSell = !!row.canSell;
    row.composable = !!row.composable;
};

var transformGemDef = function (row) {
    return {
        id: parseInt(row.id),
        name: row.name,
        type: "宝石",
        subType: row.subType.trim(),
        quality: parseInt(row.quality),
        levelReq: parseInt(row.levelReq),
        resKey: row.resKey,
        stackSize: parseInt(row.stackSize),
        composable: !!parseInt(row.composable),
        composeCount: parseInt(row.composeCount),
        composeTarget: (row.composeTarget && row.composeTarget !== "0") ? [parseInt(row.composeTarget)] : [],
        canSell: !!parseInt(row.canSell),
        price: parseInt(row.price),
        desc: row.desc.trim(),
        extended: {
            hp: parseInt(row.hp),
            attack: parseFloat(row.attack),
            magic: parseFloat(row.magic),
            defense: parseFloat(row.defense),
            resist: parseFloat(row.resist),
            attackSpeed: parseFloat(row.attackSpeed),
            critical: parseFloat(row.critical)
        }
    };
};

var transformEquipmentDef = function (row) {
    row.id = parseInt(row.id);
    if (row.gemType && row.gemType !== "0") {
        row.gemType = row.gemType.split(",");
        for (var i=0;i<row.gemType.length;i++) {
            row.gemType[i] = row.gemType[i].trim();
        }
    }
    else {
        row.gemType = [];
    }

    _.each(["color", "quality", "levelReq", 'hp', 'attack', 'magic', 'defense', "resist", 'hpGrowth', 'attackGrowth',
        'magicGrowth', 'defenseGrowth', "resistGrowth", 'upgradeCost', 'hpRefine', 'attackRefine', 'magicRefine',
        'defenseRefine', "resistRefine", 'refineCost', 'slots', 'price'], function (f) {
        row[f] = parseFloat(row[f]) || 0;
    });
};

var transformTreasure = function (row) {
    row.id = parseInt(row.id);
    row.count = parseInt(row.count);
    row.candidates = JSON.parse(row.candidates || "[]");
    row.weights = JSON.parse(row.weights || "[]");
};

var transformTask = function (row) {
    row.id = parseInt(row.id);
    row.level = parseInt(row.level) || 0;
    row.weight = parseFloat(row.weight) || 1;
    row.reward = parseInt(row.reward) || 0;
    row.condition = JSON.parse(row.condition || "[]");
    row.start = row.start ? moment(row.start).toDate() : null;
    row.end = row.end ? moment(row.end).toDate() : null;

    switch (row.type) {
        case "活动":
            row.type = 0;
            break;
        case "随机":
            row.type = 1;
            break;
        case "每日":
            row.type = 2;
            break;
    }
};

var transformStoreItem = function (row) {
    row.id = parseInt(row.id);
    row.gold = !!parseInt(row.gold || "0");
    row.price = parseInt(row.price);
    row.defId = parseInt(row.defId);
    row.count = parseInt(row.count);
};

exports.import = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导入数据的权限"});

    var body = req.body;
    var modelsAndTransform = {
        heroDef: [appModels.HeroDef, transformHeroDef],
        heroDraw: [appModels.HeroDraw, transformHeroDraw],
        heroNode: [appModels.HeroNode, transformHeroNode],
        itemDef: [appModels.ItemDef, transformItemDef],
        equipmentDef: [appModels.EquipmentDef, transformEquipmentDef],
        gemDef: [appModels.ItemDef, transformGemDef],
        treasure: [appModels.Treasure, transformTreasure],
        storeitem: [appModels.StoreItem, transformStoreItem],
        task: [appModels.Task, transformTask]
    };

    if (req.files) {
        fs.readFile(req.files.file.path, function (err, data) {
            if (body.encoding !== "utf8") {
                try {
                    data = GB2UTF8.convert(data);
                }
                catch (err) {}
            }
            csv().from.string(data, { columns: dataColumns[body.tag] }).to.array(function (newDefs) {
                while (newDefs.length > 0 && newDefs[0].id === "[SKIP]") {
                    newDefs.shift();
                }
                if (newDefs.length === 0) {
                    return res.send({news: [], mods: [], updates: [], tag: body.tag});
                }

                var ids = _.pick(newDefs, "id");
                modelsAndTransform[body.tag][0].run()
                .then(function (stock) {
                    stock = _.indexBy(stock, "id");
                    var compareCols = _.without(dataColumns[body.tag], "id");
                    var diffCol = {news: [], mods: [], updates: [], tag: body.tag};
                    _.each(newDefs, function (value) {
                        if (value.id === null || value.id === undefined || _.isNaN(value.id)) return;
                        var key = value.id.toString();
                        if (stock[key] === undefined) {
                            diffCol.news.push(value);
                            diffCol.updates.push(value);
                        }
                        else {
                            var diff = diffModel(stock[key], value, compareCols);
                            if (_.size(diff) > 1) {
                                diffCol.mods.push(diff);
                                var update = {};
                                _.each(diff, function (value, key) {
                                    if (value.new !== undefined && value.old !== undefined) {
                                        update[key] = value.new;
                                    }
                                    else {
                                        update[key] = value;
                                    }
                                });
                                diffCol.updates.push(update);
                            }
                        }
                    });
                    res.send(diffCol);
                })
                .catch(function (err) {
                    res.send(400, {message: ""+err});
                });
            }).transform(function (row, index) {
                if (index < 2) {
                    row.id = "[SKIP]";
                }
                else if (body.tag !== "ballistic") {
                    var newRow = modelsAndTransform[body.tag][1](row);
                    if (newRow) return newRow;
                }
                return row;
            });
        });
    }
    else if (body.confirm) {
        var updates = _.map(body.updates, function (d) {
            var model = modelsAndTransform[body.tag][0];
            if (!d.id) {
                return (new model(d)).save();
            }
            else {
                return model.get(d.id).update(d).run().then(function (data) {
                    if (data.replaced === 0) {
                        return (new model(d)).save();
                    }
                });
            }
        });

        Promise.all(updates).then(function () {
            pomeloConn.client.request("cacheMonitor", {type: body.tag});
            res.send(200);
        });
    }
    else {
        res.send(400);
    }
};

exports.export = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导出数据的权限"});

    var data = req.body;
    res.header('content-type','text/csv');
    res.header('content-disposition', 'attachment; filename=' + data.tag + '.csv');

    if (data.tag === "heroDef") {
        appModels.HeroDef.orderBy("id").run().then(function (hDefs) {
            csv().from.array(hDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns[data.tag]
            }).transform(function (row) {
                row.attackDelta = JSON.stringify(row.attackDelta);
                return row;
            });
        });
    }
    else if (data.tag === "heroDraw") {
        appModels.HeroDraw.orderBy("id").run().then(function (hDraws) {
            csv().from.array(hDraws, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns[data.tag]
            });
        });
    }
    else if (data.tag === "heroNode") {

    }
    else if (data.tag === "itemDef") {
        appModels.ItemDef.filter(r.row("type").ne("宝石")).orderBy("id").run().then(function (itemDefs) {
            csv().from.array(itemDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns.itemDef
            }).transform(function (row) {
                row.canSell = row.canSell ? 1 : 0;
                row.composable = row.composable ? 1: 0;
                row.composeTarget = JSON.stringify(row.composeTarget);
                return row;
            });
        });
    }
    else if (data.tag === "equipmentDef") {
        appModels.EquipmentDef.orderBy("id").run().then(function (eqDefs) {
            csv().from.array(eqDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns.equipmentDef
            }).transform(function (row) {
                row.gemType = row.gemType.join(",");
                return row;
            });
        });
    }
    else if (data.tag === "gemDef") {
        appModels.ItemDef.filter({type: "宝石"}).orderBy("id").run().then(function (itemDefs) {
            csv().from.array(itemDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns[data.tag]
            }).transform(function (row) {
                row.composeTarget = row.composeTarget.length ? row.composeTarget[0] : 0;
                row.level = 0;
                row.canSell = row.canSell ? 1 : 0;
                row.composable = row.composable ? 1: 0;
                _.extend(row, row.extended);
                row.extended = undefined;
                return row;
            });
        });
    }
    else if (data.tag === "stage") {

    }
    else if (data.tag === "treasure") {
        appModels.Treasure.orderBy("id").run().then(function (treasures) {
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
    else if (data.tag === "task") {
        appModels.Task.orderBy("id").run().then(function (tasks) {
            csv().from.array(tasks, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns.task
            }).transform(function (row) {
                row.condition = JSON.stringify(row.condition);
                row.type = ["活动", "随机", "每日"][row.type];
                if (row.start) row.start = +row.start;
                if (row.end) row.end = +row.end;
                return row;
            });
        });
    }
    else if (data.tag === "storeitem") {
        appModels.StoreItem.orderBy("id").run().then(function (items) {
            csv().from.array(items, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: dataColumns.storeitem
            }).transform(function (row) {
                row.gold = row.gold ? 1 : 0;
                return row;
            });
        });
    }
};

exports.heroDefs = function (req, res) {
    appModels.HeroDef.run()
    .then(function (data) {
        res.json({
            heroes: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.heroDraws = function (req, res) {
    appModels.HeroDraw.run()
    .then(function (data) {
        res.json({
            draws: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.heroNodes = function (req, res) {
    appModels.HeroNode.run()
    .then(function (data) {
        res.json({
            nodes: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.levels = function (req, res) {
    appModels.Level.run()
    .then(function (data) {
        res.json({
            levels: _.map(data, function (l) { return _.omit(l.toObject(true), "enemies"); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.treasures = function (req, res) {
    appModels.Treasure.run()
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
    appModels.ItemDef.run()
    .then(function (data) {
        res.json({
            items: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.equipmentDefs = function (req, res) {
    appModels.EquipmentDef.run()
    .then(function (data) {
        res.json({
            equipments: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.tasks = function (req, res) {
    appModels.Task.run()
    .then(function (data) {
        res.json({
            tasks: _.map(data, function (t) {
                var ret = t.toObject(true);
                t.start = +t.start;
                t.end = +t.end;
                return ret;
            })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.anns = function (req, res) {
    appModels.Announcement.run()
    .then(function (data) {
        res.json({
            anns: _.map(data, function (h) {
                var ret =  h.toObject(true);
                ret.start = +ret.start;
                ret.end = +ret.end;
                return ret;
            })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.storeitems = function (req, res) {
    appModels.StoreItem.run()
    .then(function (data) {
        res.json({
            storeItems: _.map(data, function (h) {
                var ret =  h.toObject(true);
                return ret;
            })
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.importInGameReward = function (req, res) {
    if (req.body.key !== "nimei123.J$p1ter") {
        return res.send(401);
    }

    var level = req.body;
    appModels.Level.insert(level, {upsert: true}).run().then(function () {
        res.send(200);
        pomeloConn.client.request("cacheMonitor", {type: "level"});
    });
};

// debug handlers
exports.kickAll = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "kickAll"});
    res.send(200);
};

exports.reloadTask = function (req, res) {
    if (!req.session.user.manRole.debug)
        return res.send(400, {message: "没有执行调试命令的权限"});
    pomeloConn.client.request("debugCommand", {command: "reloadTask"});
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

exports.sendNotification = function (req, res) {
    var target = req.body.target || '';
    var content = req.body.content;

    pomeloConn.client.notify("debugCommand", {command:"push", target: target, content: content});
    res.send(200);
};

exports.getStatInfo = function (req, res) {
};
