var utils = require("../../../shared/utils");
var models = require("../../../shared/models");
var Constants = require("../../../shared/constants");
var Task = require("../../task/tasks");
var Promise = require("bluebird");
var _ = require("lodash");
var events = require('events');
var fs = require("fs");
var logger;

var dailyTaskCount = 2;
var randomTaskCount = 2;


//var unloadAllTasks = function (pathBase) {
//    var files = fs.readdirSync(pathBase);
//    for(var i=0, l=files.length; i<l; i++) {
//        var path = pathBase + files[i];
//        throw new Error("val: " + require.prototype);
//        delete require.cache[require.resolve(path)];
//    }
//};

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


var TaskService = function () {
    this.app = null;
    this.taskPath = null;
    this.tasks = {};
    this.dailyTasks = [];
    this.randomTasks = [];
    this.emitter = null;
};

TaskService.prototype.initOnce = function(app) {
    if (utils.initOnce("taskService")) {
        logger = require('../utils/rethinkLogger').getLogger(app);
        this.app = app;
        this.taskPath = this.app.getBase() + "/task/";
        this.emitter = new events.EventEmitter();
        this.reloadAllTasks();
    }
};

TaskService.prototype.reloadAllTasks = function() {
//    unloadAllTasks(this.taskPath);
    Task = require("../../task/tasks");
    var dTasks = [], rTasks = [];
    return models.Task.run().bind(this)
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
    });
};

TaskService.prototype.notify = function(eventName, context) {
    var listeners = this.emitter.listeners(eventName);
    _.each(listeners, function(l) {
        l.prepare(context);
    });
    return Promise.props(context).bind(this).then(function (context) {
        this.emitter.emit(eventName, context);
    });
};

TaskService.prototype.claim = function(roleId, taskId) {
    return models.Role.get(roleId).run().bind(this)
    .then(function (role) {
        var task = this.tasks[taskId];
        if (!role || !task) {
            throw Constants.TaskFailed.NO_TASK;
        }

        var context = {roleId: role.id, role: role};
        var progress = task.getProgress(context);
        if (progress[0] === progress[1] && progress[1] !== 0) {
            return task.claim(role);
        }
        else {
            throw Constants.TaskFailed.TASK_NOT_DONE;
        }
    });
};

TaskService.prototype.getTaskList = function(roleId) {
    var tids = _.keys(this.tasks);
    if (tids.length === 0) {
        return Promise.resolve([[], null]);
    }

    return models.Role.get(roleId).run().bind(this)
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

            return models.Role.get(role.id).update({taskData: taskUpdate}, {returnVals: true}).execute()
            .then(function (ret) {
                var role = new models.Role(ret.new_val);
                role.setSaved(true);

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
    });
};

module.exports = new TaskService();
