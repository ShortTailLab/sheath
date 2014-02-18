var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var task = require("../../../../task/tasks");
var Promise = require("bluebird");
var fs = require("fs");
var _ = require("underscore");

module.exports = function (app) {
    return new TaskRemote(app);
};

var Always = function () { return true; };
var Nothing = function () {};

var genTaskDef = function (pathBase, task) {
    var preCond = Always, script = Nothing;
    if (task.preCond) preCond = require(pathBase + task.preCond)(task.preCondParams);
    if (task.script) script = require(pathBase + task.script)(task.params);
    return {
        pre: preCond,
        script: script
    };
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
        this.taskPath = this.app.base + "/task/";
        this.tasks = {};

        this.reloadAllTasks(() => {});
    }

    reloadAllTasks(cb) {
        unloadAllTasks(this.taskPath);
        models.Task.allP().bind(this)
        .then((tasks) => {
            var taskDefs = {};
            for (var i=0;i<tasks.length;i++) {
                taskDefs[tasks[i].id] = genTaskDef(this.taskPath, tasks[i]);
            }

            return Promise.props(taskDefs);
        })
        .then(function (taskDefs) {
            this.tasks = taskDefs;
        })
        .finally(() => {
            cb();
        });
    }

    notify(eventName, roleId, params, cb) {
    }

    queryTaskStatus(roleId, cb) {
        var tids = _.keys(this.tasks);
        if (tids.length === 0) {
            return cb({});
        }

        models.Task.allP().bind(this);
    }
}
