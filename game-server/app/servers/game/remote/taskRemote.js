var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var task = require("../../../../task/tasks");
var Promise = require("bluebird");
var events = require('events');
var fs = require("fs");
var _ = require("underscore");

module.exports = function (app) {
    return new TaskRemote(app);
};

var unloadAllTasks = function (pathBase) {
    var files = fs.readdirSync(pathBase);
    for(var i=0, l=files.length; i<l; i++) {
        var path = pathBase + files[i];
        delete require.cache[require.resolve(path)];
    }
};

class TaskRemote {
    constructor(app) {
        this.app = app;

        if (this.app.serverType === "game") {
            this.taskPath = this.app.base + "/task/";
            this.tasks = {};
            this.emitter = new events.EventEmitter();
            this.reloadAllTasks(() => {});
        }
    }

    reloadAllTasks(cb) {
        unloadAllTasks(this.taskPath);
        models.Task.allP().bind(this)
        .then((tasks) => {
            var taskDefs = {};
            for (var i=0;i<tasks.length;i++) {
                taskDefs[tasks[i].id] = task.create(this.app, tasks);
            }

            return Promise.props(taskDefs);
        })
        .then(function (taskDefs) {
            this.tasks = taskDefs;
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
            params: params
        };
        var listeners = this.emitter.listeners(eventName);
        _.each(listeners, function(l) {
            l.prepare(context);
        });
        Promise.props(context).bind(this).then(function (context) {
            this.emitter.emit(eventName, context);
        });
    }

    queryTaskStatus(roleId, cb) {
        var tids = _.keys(this.tasks);
        if (tids.length === 0) {
            return cb({});
        }

        models.Task.allP().bind(this);
    }
}
