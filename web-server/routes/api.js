var pomeloConn = require("../pomelo-conn");
var _ = require("underscore");
var Promise = require("bluebird");
var appModels = require("../../shared/models");
var r = require("rethinkdb");

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
    Promise.joins(appModels.User.allP({

    }), appModels.User.countP())
    .spread(function (users, userCount) {
        res.json({
            user: _.map(users, function (u) {return _._.pluck(u, ["joinDate", "activated"])}),
            totalUsers: userCount
        });
    })
    .catch(function (err) {
        res.send(400);
    });
};
