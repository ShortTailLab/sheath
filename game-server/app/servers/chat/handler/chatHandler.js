var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");

module.exports = function (app) {
    return new ChatHandler(app);
};

class ChatHandler extends base.HandlerBase {
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
        var role = session.get("role");
        var channelService = this.app.get('channelService');
        var param = {
            msg: msg.content,
            from: {
                uid: session.uid,
                id: role.id,
                name: role.name
            },
            target: msg.target
        };
        var targetChannel = msg.channel || parId;
        var channel = channelService.getChannel(targetChannel, false);
        if (!channel) {
            return this.errorNext(Constants.ChatFailed.NO_CHANNEL, next);
        }
        if (!channel.getMember(session.uid)) {
            return this.errorNext(Constants.ChatFailed.NOT_IN_CHANNEL, next);
        }

        //targets users
        if (msg.target === "*") {
            channel.pushMessage('onChat', param);
        }
        //the target is specific user
        else {
            var tuid = msg.target;
            var member = channel.getMember(tuid);
            if (member) {
                var tsid = channel.getMember(tuid).sid;
                channelService.pushMessageByUids('onChat', param, [
                    {
                        uid: tuid,
                        sid: tsid
                    }
                ]);
            }
        }
        next(null, {
            ok: true
        });
    }
}
