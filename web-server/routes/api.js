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
    Promise.join(appModels.Partition.allP(), partitionRoleCount())
    .spread(function (parts, roleCounts) {
        for (var i=0;i<parts.length;i++) {
            var p = parts[i] = _.pick(parts[i], ["id", "name", "public", "openSince"]);
            var countObj = _.find(roleCounts, function (red) {
                return red.group.partition === p.id;
            });
            if (countObj)
                p.roleCount = countObj.reduction;
            else
                p.roleCount = 0;
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
        openSince: newPart.openSince,
        createTime: createTime
    })
    .then(function (p) {
        if (p.createTime.getTime() === createTime.getTime()) {
            var ret = _.pick(p, ["id", "name", "public", "openSince"]);
            ret.roleCount = 0;
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

    Promise.join(appModels.User.allP({
        limit: listOptions.pageSize,
        skip: (listOptions.page - 1) * listOptions.pageSize
    }), appModels.User.countP())
    .spread(function (users, userCount) {
        res.json({
            user: _.map(users, function (u) {
                var ret = _.pick(u, "id", "activated");
                ret.name = null;
                for (var i=0;i<u.auth.length;i++) {
                    if (u.auth[i].type === "main") {
                        ret.name = u.auth[i].id;
                        break;
                    }
                }

                return ret;
            }),
            totalUsers: userCount
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};

exports.findUsers = function (req, res) {
    var hint = req.body.hint;
    var queries = [];

    queries.push(appModels.User.allP({where: {authId: {between: [hint, hint + "\uffff"]}, manRole: null}, limit: 10}));
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
        admin.manRole = _.pick(newAdminRole.manRole, "admin", "editUser", "data");
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
    heroDef: ["id", "name", "stars", "resKey", "maxLevel", "male", "canEquip"],
    itemDef: ["id", "name", "type", "quality", "resKey", "levelReq", "price", "destructCoeff"]
};

var transformHeroDef = function (row) {
    row.id = parseInt(row.id);
    row.stars = parseInt(row.stars);
    row.maxLevel = parseInt(row.maxLevel);
    row.male = Boolean(parseInt(row.male));
    row.canEquip = JSON.parse(row.canEquip);
};

var transformItemDef = function (row) {
    row.id = parseInt(row.id);
    row.quality = parseInt(row.quality);
    row.levelReq = parseInt(row.levelReq);
    row.price = parseInt(row.price);
    row.destructCoeff = JSON.parse(row.destructCoeff);
};

exports.import = function (req, res) {
    var file = req.files.file;
    var data = req.body;
    var modelsAndTransform = {
        heroDef: [appModels.HeroDef, transformHeroDef],
        itemDef: [appModels.ItemDef, transformItemDef]
    };

    csv().from.path(file.path, { columns: dataColumns[data.tag] }).to.array(function (newDefs) {
        if (newDefs[0].id === "id") {
            newDefs.shift();
        }
        var updates = _.map(newDefs, function (d) {
            return modelsAndTransform[data.tag][0].upsertP(d);
        });

        Promise.all(updates).then(function () {
            res.send(200);
        })
        .catch(function (err) {
            res.send(400, {message: ""+err});
        });
    }).transform(function (row) {
        if (row.id !== "id") {
            modelsAndTransform[data.tag][1](row);
        }
        return row;
    });
};

exports.export = function (req, res) {
    var data = req.body;
    res.header('content-type','text/csv');
    res.header('content-disposition', 'attachment; filename=' + data.tag + '.csv');

    if (data.tag === "heroDef") {
        appModels.HeroDef.allP({order: "id"}).then(function (hDefs) {
            csv().from.array(hDefs, { columns: dataColumns[data.tag] }).to(res, {
                header: true,
                eof: true,
                columns: {
                    id: "id",
                    name: "武将名",
                    stars: "星级",
                    resKey: "拼音",
                    maxLevel: "最大等级",
                    male: "性别",
                    canEquip: "可装备武器类型"
                }
            }).transform(function (row) {
                if (row.male) {
                    row.male = 1;
                }
                else {
                    row.male = 0;
                }
                row.canEquip = JSON.stringify(row.canEquip);
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
};
