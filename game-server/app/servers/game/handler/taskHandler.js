var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var logger;


module.exports = function (app) {
    return new TaskHandler(app);
};

class TaskHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    claim(msg, session, next) {
        wrapSession(session);

        this.safe(this.app.rpc.game.taskRemote.claimAsync(session, session.get("role").id, msg.taskId)
        .then(function (reward) {
            next(null, reward);
        }), next);
    }

    list(msg, session, next) {
        wrapSession(session);

        var taskStates;
        this.safe(this.app.rpc.game.taskRemote.getTaskListAsync(session, session.get("role").id)
        .then(function (tasks) {
            var taskIds = _.pluck(tasks.tasks, "id");
            if (tasks.newTasks) {
                taskIds = taskIds.concat(_.pluck(tasks.newTasks, "id"));
            }
            taskStates = tasks;
            return models.Task.allP({id: {inq: taskIds}});
        })
        .then(function (taskDefs) {
            taskDefs = _.indexBy(taskDefs, "id");
            function toClientTask(state) {
                var tDef = taskDefs[state.id];
                var ret = tDef.toClientObj();
                ret.curProgress = state.progress[0];
                ret.needProgress = state.progress[1];
                return ret;
            }
            next(null, {
                tasks: _.map(taskStates.tasks, toClientTask),
                newTasks: taskStates.newTasks ? _.map(taskStates.newTasks, toClientTask) : undefined
            });
        }), next);
    }
}
