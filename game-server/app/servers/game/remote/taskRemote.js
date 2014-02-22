var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var utils = require("../../../../../shared/utils");
var Task = require("../../../../task/tasks");
var Promise = require("bluebird");
var events = require('events');
var fs = require("fs");
var _ = require("underscore");
var logger;

module.exports = function (app) {
    return new TaskRemote(app);
};

var dailyTaskCount = 2;
var randomTaskCount = 2;

var unloadAllTasks = function (pathBase) {
    var files = fs.readdirSync(pathBase);
    for(var i=0, l=files.length; i<l; i++) {
        var path = pathBase + files[i];
        delete require.cache[require.resolve(path)];
    }
};

var sampleTasks = function(pool, count, context) {
    var validTask = _.filter(pool, function (t) { return t.precondition(context) && !t.inProgress(context) && !t.isDone(context); });
    if (validTask.length <= count) {
        return validTask;
    }
    else {
        var weights = _.pluck(validTask, "weight");
        return utils.sampleWithWeight(validTask, weights, count, true);
    }
};

class TaskRemote {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);

        if (this.app.serverType === "game" && utils.initOnce("TaskRemote")) {
            this.taskPath = this.app.base + "/task/";
            this.tasks = {};
            this.dailyTasks = [];
            this.randomTasks = [];
            this.emitter = new events.EventEmitter();
            this.reloadAllTasks(() => {});
        }
    }

    reloadAllTasks(cb) {
        unloadAllTasks(this.taskPath);
        var dTasks = [], rTasks = [];
        models.Task.allP().bind(this)
        .then((tasks) => {
            var taskDefs = {};
            for (var i=0;i<tasks.length;i++) {
                var task = Task.create(this.app, tasks[0]);
                if (task) {
                    taskDefs[tasks[i].id] = task;
                    if (task.isDaily()) {
                        dTasks.push(task);
                    }
                    else if (task.isRandom()) {
                        rTasks.push(task);
                    }
                }
            }

            return Promise.props(taskDefs);
        })
        .then(function (taskDefs) {
            this.tasks = taskDefs;
            this.dailyTasks = dTasks;
            this.randomTasks = rTasks;
            this.emitter.removeAllListeners();
            var emitter = this.emitter;
            _.each(taskDefs, function (t) { t.visit(emitter); });
        })
        .finally(() => {
            cb();
        });
    }

    notify(eventName, roleId, params, cb) {
        var context = {
            roleId: roleId,
            params: params || {}
        };
        var listeners = this.emitter.listeners(eventName);
        _.each(listeners, function(l) {
            l.prepare(context);
        });
        Promise.props(context).bind(this).then(function (context) {
            this.emitter.emit(eventName, context);
            cb();
        });
    }

    claim(roleId, taskId, cb) {
        models.Role.findP(roleId).bind(this)
        .then(function (role) {
            var task = this.tasks[taskId];
            if (!role || !task) {
                return Promise.reject(Constants.TaskFailed.NO_TASK);
            }

            var context = {roleId: role.id, role: role};
            var progress = task.getProgress(context);
            if (progress[0] === progress[1] && progress[1] !== 0) {
                return task.claim(role);
            }
            else {
                return Promise.reject(Constants.TaskFailed.TASK_NOT_DONE);
            }
        })
        .then(function (gain) {
            cb(null, gain);
        })
        .catch(function (err) {
            cb(err);
        });
    }

    getTaskList(roleId, cb) {
        var tids = _.keys(this.tasks);
        if (tids.length === 0) {
            return cb(null, {});
        }

        models.Role.findP(roleId).bind(this)
        .then(function (role) {
            var tasks = _.values(this.tasks);
            var roleTasks = [];
            var newTasks = [];
            var roleDaily = 0;
            var roleRandom = 0;

            var context = {roleId: role.id, role: role};
            for (var i=0;i<tasks.length;i++) {
                var t = tasks[i];
                var progress = t.getProgress(context);
                if (progress[1] > 0){
                    if (t.isDaily()) roleDaily += 1;
                    if (t.isRandom()) roleRandom += 1;
                    roleTasks.push({
                        id: t.taskId,
                        progress: progress
                    });
                }
            }

            if (roleDaily < dailyTaskCount) {
                newTasks = newTasks.concat(sampleTasks(this.dailyTasks, dailyTaskCount - roleDaily, context));
            }
            if (roleRandom < randomTaskCount) {
                newTasks = newTasks.concat(sampleTasks(this.randomTasks, randomTaskCount - roleRandom, context));
            }

            if (newTasks.length > 0) {
                logger.logInfo("task.newTask", {
                    role: role.toLogObj(),
                    newTasks: _.pluck(newTasks, "taskId")
                });

                var taskUpdate = {};
                for (var j=0;j<newTasks.length;j++) {
                    var task = newTasks[j];
                    taskUpdate[task.taskId] = task.initialProgress();
                }

                return models.Role.updateP({
                    where: {id: role.id},
                    update: { taskData: taskUpdate }
                })
                .then(function () {
                    return models.Role.findP(roleId);
                })
                .then(function (role) {
                    context.role = role;
                    return [roleTasks, _.map(newTasks, function (t) {
                        return {
                            id: t.taskId,
                            progress: t.getProgress(context)
                        };
                    })];
                });
            }
            else {
                return [roleTasks, null];
            }
        })
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
