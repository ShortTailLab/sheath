module.exports = function(app) {
    return new ChatRemote(app);
};

var ChatRemote = function(app) {
    this.app = app;
    this.channelService = app.get('channelService');
};

/**
 * Add user into chat channel.
 *
 * @param {string} uid unique id for user
 * @param {string} username user name
 * @param {string} sid server id
 * @param {string} name channel name
 * @param {function} cb next process
 *
 */
ChatRemote.prototype.add = function(uid, username, sid, name, cb) {
    var channel = this.channelService.getChannel(name, true);
    var param = {
        route: 'onAdd',
        user: {
            name: username,
            id: uid
        }
    };
    var users = [];
    channel.pushMessage(param);

    if( !!channel ) {
        channel.add(uid + "*" + username, sid);
        users = channel.getMembers();
        for(var i = 0; i < users.length; i++) {
            var idName = users[i].split('*', 1);
            users[i] = {
                id: idName[0],
                name: idName[1]
            };
        }
    }

    cb(users);
};

/**
 * Kick user out chat channel.
 *
 * @param {string} uid unique id for user
 * @param {string} username user name
 * @param {string} sid server id
 * @param {string} name channel name
 *
 */
ChatRemote.prototype.kick = function(uid, username, sid, name, cb) {
    var channel = this.channelService.getChannel(name, false);
    // leave channel
    if( !!channel ) {
        channel.leave(uid + "*" + username, sid);
        var param = {
            route: 'onLeave',
            user: {
                name: username,
                id: uid
            }
        };
        channel.pushMessage(param);
    }
    cb();
};
