module.exports = function (app) {
    return new ChatHandler(app);
};

class ChatHandler {
    constructor(app) {
        this.app = app;
    }

    /**
     * Send messages to users
     *
     * @param {object} msg message from client
     * @param {object} session
     * @param  {function} next next step callback
     *
     */
    send(msg, session, next) {
        var parId = session.get('partId');
        var username = session.get("role").name;
        var channelService = this.app.get('channelService');
        var param = {
            msg: msg.content,
            from: {
                id: session.uid,
                name: username
            },
            target: msg.target,
            targetName: msg.targetName
        };
        var channel = channelService.getChannel(parId, false);

        //targets users
        if (msg.target === "*") {
            channel.pushMessage('onChat', param);
        }
        //the target is specific user
        else {
            var tuid = msg.target + '*' + msg.targetName;
            var tsid = channel.getMember(tuid).sid;
            channelService.pushMessageByUids('onChat', param, [
                {
                    uid: tuid,
                    sid: tsid
                }
            ]);
        }
        next(null, {
            route: msg.route
        });
    }
}
