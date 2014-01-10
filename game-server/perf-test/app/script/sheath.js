/////////////////////////////////////////////////////////////
var cwd = process.cwd();
var pomelo = require(cwd + "/app/script/pomelo-client");
var envConfig = require(cwd + '/app/config/env.json');
var config = require(cwd + '/app/config/' + envConfig.env + '/config');

var ActFlagType = {
    ENTRY: 0,
    ENTER_PARTITION: 1,
    CLAIM_DAILY_REWARD: 2,
    CLAIM_QHOURLY_REWARD: 3,

    ACT_END: 100000
};

var ActDetail = [
    {
        name: "entry",
        route: "connector.entryHandler.enter"
    },
    {
        name: "enterPart",
        route: "connector.entryHandler.enterPartition"
    },
    {
        name: "claimDaily",
        route: "game.roleHandler.claimDailyReward"
    },
    {
        name: "claimQuarterHourlyReward",
        route: "game.roleHandler.claimQuarterHourlyReward"
    },
    {}
];

var monitor = function (type, name, reqId) {
    if (typeof actor !== 'undefined') {
        actor.emit(type, name, reqId);
    } else {
        console.error(Array.prototype.slice.call(arguments, 0));
    }
};

var timePomeloRequest = function (actType, msg, cb) {
    var conf = ActDetail[actType];

    monitor('start', conf.name, ActFlagType.CLAIM_DAILY_REWARD);
    pomelo.request(conf.route, msg, function (data) {
        monitor('end', conf.name, ActFlagType.CLAIM_DAILY_REWARD);

        if (data.error) {
            console.log(conf.name + ' failed!' + (data.error.message || data.error.code));
        }
        else {
            console.log(data);
            cb(data);
        }
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
                afterLogin(pomelo, data);
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
            process.exit(0);
        });
    });
};

setTimeout(function () {
    entry("127.0.0.1", 3010, "main", "uname", "password");
}, Math.random() * 1000);
