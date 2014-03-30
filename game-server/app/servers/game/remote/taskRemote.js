var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var utils = require("../../../../../shared/utils");
var taskService = require("../../../services/taskService");
var Promise = require("bluebird");
var _ = require("lodash");
var logger;

module.exports = function (app) {
    return new TaskRemote(app);
};

class TaskRemote {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);

        if (this.app.serverType === "game") {
            taskService.initOnce(app);
        }
    }

    reloadAllTasks(cb) {
        taskService.reloadAllTasks()
        .finally(() => {
            cb();
        });
    }

    notify(eventName, roleId, params, cb) {
        var context = {
            roleId: roleId,
            params: params || {}
        };
        taskService.notify(eventName, context)
        .finally(() => {
            cb();
        });
    }

    claim(roleId, taskId, cb) {
        taskService.claim(roleId, taskId)
        .then(function (gain) {
            cb(null, gain);
        })
        .catch(function (err) {
            cb(err);
        });
    }

    getTaskList(roleId, cb) {
        taskService.getTaskList(roleId)
        .then(function (tasks) {
            cb(null, {
                tasks: tasks[0],
                newTasks: tasks[1] ? tasks[1] : undefined
            });
        })
        .catch(function () {
            cb(null, {});
        });
    }
}
