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
 * @param {string} id unique id for user
 * @param {string} username user name
 * @param {string} sid server id
 * @param {string} name channel name
 * @param {function} cb next process
 *
 */
ChatRemote.prototype.add = function(id, username, sid, name, cb) {
    var channel = this.channelService.getChannel(name, true);
    var param = {
        route: 'onAdd',
        user: {
            name: username,
            id: id
        }
    };
    var users = [];
    channel.pushMessage(param);

    if( !!channel ) {
        channel.add(id, sid);
        users = channel.getMembers();
    }

    cb(users);
};

/**
 * Kick user out chat channel.
 *
 * @param {string} id unique id for user
 * @param {string} sid server id
 * @param {string} name channel name
 * @param {function} cb next process
 *
 */
ChatRemote.prototype.kick = function(id, sid, name, cb) {
    var channel = this.channelService.getChannel(name, false);
    // leave channel
    if( !!channel ) {
        channel.leave(id, sid);
        var param = {
            route: 'onLeave',
            user: {
                id: id
            }
        };
        channel.pushMessage(param);
    }
    cb();
};
