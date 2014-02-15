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
                id: role.id,
                name: role.name
            },
            target: {
                id: msg.target,
                name: msg.targetName
            }
        };
        var channel = channelService.getChannel(parId, false);
        if (!channel) {
            return this.errorNext(Constants.PartitionFailed.PARTITION_DO_NOT_EXIST, next);
        }

        //targets users
        if (msg.target === "*") {
            channel.pushMessage('onChat', param);
        }
        //the target is specific user
        else {
            var tuid = msg.target;
            var tsid = channel.getMember(tuid).sid;
            channelService.pushMessageByUids('onChat', param, [
                {
                    uid: tuid,
                    sid: tsid
                }
            ]);
        }
        next(null, {
            ok: true
        });
    }
}
