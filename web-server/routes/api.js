var pomeloConn = require("../pomelo-conn");
var _ = require("lodash");
var Promise = require("bluebird");
var moment = require("moment");
var appModels = require("../../shared/models");
var excel = require("excel-parser");
var excel_export = require("excel4node");
var r = appModels.r;
var fs = require("fs");

function diffModel(m1, m2, fields) {
    var diff = {id: m1.id};
    for (var i=0;i<fields.length;i++) {
        var field = fields[i];
        if(!_.isEqual(m1[field], m2[field])) {
            diff[field] = {
                old: m1[field],
                new: m2[field]
            };
        }

//        if (_.isArray(m1[field])) {
//            if (m1[field].length !== m2[field].length) {
//                diff[field] = m2[field];
//            }
//            else {
//                for (var j=0;j<m1[field].length;j++) {
//                    if (m1[field][j] !== m2[field][j]) {
//                        diff[field] ={
//                            old: m1[field],
//                            new: m2[field]
//                        };
//                        break;
//                    }
//                }
//            }
//        }
//        else if (_.isObject(m2[field])) {
//            if(!_.isEqual(m2[field], m1[field])) {
//                diff[field] ={
//                    old: m1[field],
//                    new: m2[field]
//                };
//            }
//        }
//        else if (m1[field] !== m2[field]) {
//            diff[field] = {
//                old: m1[field],
//                new: m2[field]
//            };
//        }
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
        console.log(err.stack);
    });
};

function partitionRoleCount() {
    return appModels.Role.group("partition").count().execute();
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
        res.send(400, {message: ""+err});
    });
};

exports.addPartition = function (req, res) {
    var newPart = req.body;
    var createTime = new Date();

    appModels.Partition.filter({name: newPart.name}).limit(1).run()
    .then(function (exists) {
        if (exists.length) {
            res.send(400, {message: "区名重复"});
        }
        else {
            var part = new appModels.Partition({
                name: newPart.name,
                public: newPart.public,
                distro: newPart.distro,
                openSince: moment(newPart.openSince).toDate(),
                createTime: createTime
            });
            return part.save()
            .then(function (p) {
                var ret = _.pick(p, ["id", "name", "public", "openSince", "distro"]);
                ret.roleCount = 0;
                ret.onlineRoles = 0;
                pomeloConn.client.request("cacheMonitor", {type: "partition", server: "connector"});
                res.json(ret);
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

function buildRoleQuery(listOptions) {
    var roleQuery = appModels.Role;
    if (listOptions.partitions) {
        var params = listOptions.partitions.concat([{index: "partition"}]);
        roleQuery = roleQuery.getAll.apply(roleQuery, params);
    }

    if (listOptions.hint) {
        roleQuery = roleQuery.filter(r.row("name").match(listOptions.hint));
    }
    return roleQuery;
}

exports.userList = function (req, res) {
    var listOptions = req.body;
    var ownerPromise = [[], 0];

    if (listOptions.hint) {
        ownerPromise = appModels.User.between(listOptions.hint, listOptions.hint + "\uffff", {index: "authId"}).run()
        .then(function (users) {
            if (users.length === 0)
                return [[], 0];
            else {
                var param = _.pluck(users, "id").concat([{index: "owner"}]);
                var q = appModels.Role.getAll.apply(appModels.Role, param);
                if (listOptions.partitions) {
                    q = q.filter(function (row) {
                        return r.expr(listOptions.partitions).contains(row("partition"));
                    });
                }
                return Promise.join(q.run(), q.count().execute());
            }
        });
    }

    var skip = (listOptions.page - 1) * listOptions.pageSize;
    var limit = listOptions.pageSize;
    var roleQ = buildRoleQuery(listOptions);
    Promise.join(roleQ.skip(skip).limit(limit).run(), roleQ.count().execute(), ownerPromise)
    .spread(function (roles, roleCount, rolesByUser) {
        res.json({
            roles: _.map(roles.concat(rolesByUser[0]), roleToJson),
            totalRoles: roleCount + rolesByUser[1]
        });
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
    });
};

exports.updateHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var diff = req.body;

    appModels.Hero.get(diff.id).run()
    .then(function (h) {
        delete diff.id;
        h.merge(diff);
        return h.save();
    })
    .then(function (h) {
        res.json(heroToJson(h));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.updateItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var diff = req.body;

    appModels.Item.get(diff.id).run()
    .then(function (it) {
        delete diff.id;
        it.merge(diff);
        return it.save();
    })
    .then(function (it) {
        res.json(itemToJson(it));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.addHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var newHeroes = req.body.heroes;
    var roleId = req.body.role;
    var role;

    appModels.Role.get(roleId).run()
    .then(function (_role) {
        role = _role;
        var heroes = _.map(newHeroes, function (heroId) {
            return {
                heroDefId: heroId,
                owner: roleId
            };
        });
        return appModels.Hero.save(heroes);
    })
    .then(function (heroes) {
        if (role.team.length > 3) role.team = role.team.slice(0, 3);
        var newHeroIds = _.pluck(heroes, "id");
        for (var i=0;i<role.team.length;i++) {
            if (role.team[i] === null) {
                role.team[i] = newHeroIds.shift(1) || null;
            }
        }
        return role.save().then(function (role) {
            res.json({
                role: roleToJson(role, true),
                heroes: _.map(heroes, function (h) {return heroToJson(h);})
            });
        });
    })
    .catch(function (err) {
        console.log(err.stack);
        res.send(400, {message: ""+err});
    });
};

exports.addItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var newItems = req.body.items;
    var roleId = req.body.role;

    appModels.Role.get(roleId).run()
    .then(function (exists) {
        if (exists) {
            var items = _.map(newItems, function (itemId) {
                return {
                    itemDefId: itemId,
                    owner: roleId
                };
            });
            return appModels.Item.save(items);
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
        res.send(400, {message: ""+err});
    });
};

exports.removeHero = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var hid = req.body.hero;
    appModels.Hero.get(hid).run()
    .then(function (hero) {
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
    })
    .spread(function (role) {
        res.json(roleToJson(role, true));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.removeItem = function (req, res) {
    if (!req.session.user.manRole.editUser)
        return res.send(400, {message: "没有修改用户数据的权限"});

    var itemId = req.body.item;
    appModels.Item.get(itemId).run()
    .then(function (item) {
        var unbound = appModels.Item.getAll(itemId, {index: "bound"}).update({bound: null}).run();
        return [item.delete(), unbound];
    })
    .spread(function () {
        res.send(200);
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
    });
};

exports.findUsers = function (req, res) {
    var hint = req.body.hint;
    var queries = [];

    var userQuery = appModels.User.between(hint, hint + "\uffff", {index: "authId"}).limit(10);
    if (req.body.notAdmin) {
        userQuery = userQuery.filter({manRole: null}, {default: true});
    }

    queries.push(userQuery.run());
    queries.push(appModels.User.get(hint).execute());
    queries.push(appModels.Partition.run());

    Promise.all(queries)
    .spread(function (users, u, partitions) {
        if (u) {
            users.unshift(new appModels.User(u));
        }

        var ownerRole = Promise.all(_.map(users, function (u) { return appModels.Role.getAll(u.id, {index: "owner"}).limit(1).run(); }));

        return [users, ownerRole, partitions];
    })
    .spread(function (users, userRoles, partitions) {
        users = _.compact(users);
        var roles = _.compact(_.map(userRoles, function (ua) {return ua[0];}));

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
        res.send(400, {message: ""+err});
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
        ret = _.omit(role.toObject(true), "energyRefreshTime", "dailyRefreshData", "manualRefreshData");
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

    appModels.User.filter(r.row("manRole").ne(null)).run()
    .then(function (admins) {
        res.json({
            admins: _.map(admins, adminToJson)
        });
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
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
        if (admin.manRole) {
            return res.send(400, {message: "用户已是管理员"});
        }
        admin.manRole = {};
        return admin.save();
    })
    .then(function (admin) {
        res.send(adminToJson(admin));
    })
    .catch(function (err) {
        var errMessage = ""+err;
        if (errMessage.startsWith("Cannot build a new instance of")) {
            errMessage = "找不到用户";
        }
        res.send(400, {message: ""+err});
    });
};

exports.updateAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有修改公告的权限"});

    var diff = req.body;
    if (diff.start) diff.start = moment(diff.start).toDate();
    if (diff.end) diff.end = moment(diff.end).toDate();

    appModels.Announcement.get(diff.id).run().then(function (ann) {
        delete diff.id;
        ann.merge(diff);
        return ann.save();
    })
    .then(function (ann) {
        pomeloConn.client.request("debugCommand", {command: "delAnn", annId: ann.id}, function () {
            pomeloConn.client.request("debugCommand", {command: "addAnn", annId: ann.id});
        });
        var ret = ann.toObject();
        ret.start = +ret.start;
        ret.end = +ret.end;
        res.send(200, ret);
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.saveAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有发公告的权限"});

    var newAnn = req.body;
    newAnn.start = moment(newAnn.start).toDate();
    newAnn.end = moment(newAnn.end).toDate();
    new appModels.Announcement(newAnn).save()
    .then(function (ann) {
        pomeloConn.client.request("debugCommand", {command: "addAnn", annId: ann.id});
        var ret =  ann.toObject();
        ret.start = +ret.start;
        ret.end = +ret.end;
        res.send(200, ret);
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.removeAnn = function (req, res) {
    if (!req.session.user.manRole.announce)
        return res.send(400, {message: "没有删除公告的权限"});

    var annId = req.body.annId;
    appModels.Announcement.get(annId).run()
    .then(function (ann) {
        return ann.delete();
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
            res.send(400, {message: ""+err});
        }
    });
};

var modelDict = {
    herodef: appModels.HeroDef,
    herodraw: appModels.HeroDraw,
    drawnode: appModels.DrawNode,
    itemdef: appModels.ItemDef,
    equipmentdef: appModels.EquipmentDef,
    gemdef: appModels.ItemDef,
    treasure: appModels.Treasure,
    storeitem: appModels.StoreItem,
    task: appModels.Task
};

function adjustField(tblName, allFields, modelSchema) {
    //对字段进行统一的调整, 从model元数据里提取默认值
    for(var field in modelSchema) {
        var fieldValue = modelSchema[field];
        if(tblName == "task") {
            //任务需要做特殊处理
            if(field == "type") {
                _.forEach(allFields, function(rowFields) {
                    var rawValue = rowFields[field];
                    switch(rawValue) {
                        case "活动":
                            rowFields[field] = 0;
                            break;
                        case "随机":
                            rowFields[field] = 1;
                            break;
                        case "每日":
                            rowFields[field] = 2;
                            break;
                        default:
                            rowFields[field] = 0;
                            break;
                    }
                });
                continue;
            }
        } else if(tblName == "gemdef") {
            if (field == "extended") {
                _.forEach(allFields, function (rowFields) {
                    var rawValue = rowFields[field];
                    if (!rawValue) {
                        rowFields[field] = fieldValue.default();
                    } else {
                        rowFields[field] = {};
                        rowFields[field].hp = parseInt(rowFields.hp);
                        rowFields[field].attack = parseFloat(rowFields.attack);
                        rowFields[field].magic = parseFloat(rowFields.magic);
                        rowFields[field].defense = parseFloat(rowFields.defense);
                        rowFields[field].resist = parseFloat(rowFields.resist);
                        rowFields[field].attackSpeed = parseFloat(rowFields.attackSpeed);
                        rowFields[field].critical = parseFloat(rowFields.critical);
                    }
                });
                continue;
            } else if(field == "type") {
                _.forEach(allFields, function(rowFields) {
                    rowFields[field] = "宝石";
                });
                continue;
            }
        }

        var defaultValue;
        var fieldType;
        if(_.isPlainObject(fieldValue)) {
            fieldType = fieldValue._type;
            if(_.isFunction(fieldValue.default)) {
                defaultValue = fieldValue.default();
            } else {
                defaultValue = fieldValue.default;
            }
        } else {
            fieldType = fieldValue;
        }

        if(fieldType === Number) {
            defaultValue = _.isUndefined(defaultValue) ? 0 : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue ? parseFloat(rawValue) : defaultValue;
            });
        } else if(fieldType === Boolean) {
            defaultValue = _.isUndefined(defaultValue) ? false : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue ? rawValue.toLowerCase() !== "false" && rawValue !== "0" : defaultValue;
            });
        } else if(fieldType === String) {
            defaultValue = _.isUndefined(defaultValue) ? "" : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue ? rawValue : defaultValue;
            });
        } else if(fieldType === Array) {
            defaultValue = _.isUndefined(defaultValue) ? [] : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue && rawValue !== "0" ? JSON.parse(rawValue) : defaultValue;
            });
        } else if(fieldType === Date) {
            defaultValue = _.isUndefined(defaultValue) ? new Date() : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue ? moment(rawValue).toDate() : defaultValue;
            });
        } else if(fieldType === Object) {
            defaultValue = _.isUndefined(defaultValue) ? {} : defaultValue;
            _.forEach(allFields, function(rowFields) {
                var rawValue = rowFields[field];
                rowFields[field] = rawValue && rawValue !== "0" ? JSON.parse(rawValue) : defaultValue;
            });
        }
    }
}

exports.import = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导入数据的权限"});

    var body = req.body;

    if (req.files) {
        excel.worksheets({
            inFile: req.files.file.path
        }, function (err, sheets) {
            if (err) {
                return res.send(400, {message: err.toString()});
            }

            var sheetDict = {};
            var re = /\((\w+)\)/;

            for (var i in sheets) {
                var sheet = sheets[i];

                if (!re.test(sheet.name)) {
                    continue;
                }

                var tblName = RegExp.$1;
                var Model = modelDict[tblName];

                if (!Model) {
                    continue;
                }

                sheetDict[sheet.id] = [tblName, Model];
            }

            if(_.size(sheetDict) == 0) {
                return res.send(400, {message: "后台系统没有检测到需要导入的表"});
            }

            var allDiffColumns = [];
            var parse = function (id) {
                var tblName = sheetDict[id][0];
                var Model = sheetDict[id][1];
                excel.parse({
                    inFile: req.files.file.path,
                    worksheet: id
                }, function (err, records) {
                    if (err) {
                        return res.send(400, {message: err.toString()});
                    }

                    if (records.length <= 2) {
                        return res.send(400, {message: "文件行数少于两行"});
                    }

                    var allFields = [];
                    var keys = records[1];

                    for (var i = 2; i < records.length; ++i) {
                        var record = records[i];
                        var rowFields = {};

                        for (var j = 0; j < record.length; ++j) {
                            rowFields[keys[j]] = record[j].trim();
                        }

                        allFields.push(rowFields);
                    }

                    var modelSchema = Model.__proto__._schema;
                    adjustField(tblName, allFields, modelSchema);

                    Model.run().then(function (stock) {
                        stock = _.indexBy(stock, "id");
                        var compareCols = _.keys(modelSchema);
                        var diffCol = {news: [keys, []], mods: [keys, []], updates: [], tag: tblName};
                        _.forEach(allFields, function (rowFields) {
                            if (!rowFields.id) {
                                return;
                            }

                            var key = rowFields.id.toString();
                            if (stock[key] == null) {
                                diffCol.news[1].push(rowFields);
                            } else {
                                var diff = diffModel(stock[key], rowFields, compareCols);
                                if (_.size(diff) > 1) {
                                    diffCol.mods[1].push(diff);
                                }
                            }
                            diffCol.updates.push(rowFields);
                        });

                        allDiffColumns.push(diffCol);
                        if(allDiffColumns.length == _.size(sheetDict)) {
                            res.send(allDiffColumns);
                        }
                    }).catch(function (err) {
                        res.send(400, {message: err.toString()});
                    });

                    if (id < _.size(sheetDict)) {
                        parse(id + 1);
                    }
                });
            };
            parse(1);
        });
    } else if (body.confirm) {
        var allSavePromise = _.map(body.allDiff, function (tbl) {
            console.log(JSON.stringify(tbl));
            var Model = modelDict[tbl.tag];
            return Model.delete().run().then(function() {
                return Model.save(tbl.updates).then(function() {
                    pomeloConn.client.request("cacheMonitor", {type: tbl.tag});
                });
            });
        });

        Promise.all(allSavePromise).then(function() {
            res.send(200);
        }).catch(function(err) {
            res.send(400, {message: "" + err.toString()});
        });
    }
    else {
        res.send(400);
    }
};

exports.export = function (req, res) {
    if (!req.session.user.manRole.data)
        return res.send(400, {message: "没有导出数据的权限"});
    var tag = req.body.tag;
    var Model = modelDict[tag];

    if(Model === undefined) {
        return res.send(400, {message: "后台系统没有检测到需要导出的表"});
    }

    var lcun = function() {

    };

    var wb = new excel_export.WorkBook();
    var ws = wb.WorkSheet("(" + tag + ")");
    var modelSchema = Model.__proto__._schema;
    var keys = _.keys(modelSchema);
    keys.unshift("id");
    var writeXlsx = function(stock) {
        var col = 1;
        _.forEach(keys, function(field) {
            var row = 3;
            var fieldValue = modelSchema[field];
            ws.Cell(1, col).String("标题 " + col);
            ws.Cell(2, col).String(field);

            if(tag == "task" && field == "type") {
                _.forEach(stock, function(rowFields) {
                    ws.Cell(row++, col).String(["活动", "随机", "每日"][rowFields[field]]);
                });
            } else if(tag == "itemdef" && field == "extended") {
                --col;
            } else {
                if (_.isPlainObject(fieldValue)) {
                    if (fieldValue._type === Array || fieldValue._type === Object) {
                        _.forEach(stock, function (rowFields) {
                            ws.Cell(row++, col).String(JSON.stringify(rowFields[field]));
                        });
                    } else {
                        _.forEach(stock, function (rowFields) {
                            ws.Cell(row++, col).String(rowFields[field]);
                        });
                    }
                } else {
                    _.forEach(stock, function (rowFields) {
                        ws.Cell(row++, col).String(rowFields[field]);
                    });
                }
            }
            ++col;
        });

        wb.write(tag + ".xlsx", res);
    };

    if(tag == "itemdef") {
        Model.filter(r.row("type").ne("宝石")).orderBy("id").run().then(writeXlsx);
    } else if(tag == "gemdef") {
        Model.filter({type: "宝石"}).orderBy("id").run().then(writeXlsx);
    } else {
        Model.orderBy("id").run().then(writeXlsx);
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
    });
};

exports.heroNodes = function (req, res) {
    appModels.DrawNode.run()
    .then(function (data) {
        res.json({
            nodes: _.map(data, function (h) { return h.toObject(true); })
        });
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
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
        res.send(400, {message: ""+err});
    });
};

exports.importInGameReward = function (req, res) {
    if (req.body.key !== "nimei123.J$p1ter") {
        return res.send(401);
    }

    var level = req.body;
    level.key = undefined;
    appModels.Level.insert(level, {conflict: 'replace'}).run().then(function () {
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

exports.resetPerfStats = function (req, res) {
    pomeloConn.client.request("perf", {command:"reset"});
    res.send(200);
};

exports.getPerfStats = function (req, res) {
    pomeloConn.client.request("perf", {command:"collect"}, function (err, results) {
        if (err) res.send(400, {message: "" + err});
        else {
            var accum = results.accum;
            res.json(_.chain(accum).map(function (value, key) {
                value.route = key;
                return value;
            }).compact().value());
        }
    });
};

exports.getStatInfo = function (req, res) {
    var statReq = req.body;
    var type = statReq.type, startTime = new Date(statReq.start || 0), endTime = statReq.end ? new Date(statReq.end) : new Date();

    var typeMap = {
        regRole: "newRole",
        regUser: "newUser",
        onlineRole: "activeRole",
        onlineUser: "activeUser",
        retention: "retention.d" + statReq.cycle
    };

    appModels.Stat.between(startTime, endTime, {index: "time"}).orderBy({index: "time"}).filter({type: typeMap[type], cycle: "daily"}).run()
    .then(function (results) {
        res.json(_.map(results, function (stat) {
            return {
                x: stat.time.toISOString(),
                y: stat.value
            };
        }));
    })
    .catch(function (err) {
        res.send(400, {message: ""+err});
    });
};

exports.refreshStats = function (req, res) {
    var start = moment(req.body.start).startOf("day");
    var end = moment(req.body.end).startOf("day");

    var logCron = require("../../game-server/app/servers/manager/cron/logCron");

    while (start.isBefore(end)) {
        var nextDay = moment(start).add(1, "d");
        logCron.runJobs(start.toDate(), nextDay.toDate());
        start = nextDay;
    }

    res.json({});
};
