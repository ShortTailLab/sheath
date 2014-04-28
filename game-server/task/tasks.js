var Promise = require("bluebird");
var models = require("../../shared/models");
var r = models.r;
var treasure = require("../../shared/treasureClaim");
var Precondition = require("./preconditions");

export function create (app, taskModel) {
    var ret;
    switch (taskModel.condition[0]) {
        case "level":
            ret = new RoleLevel(app, taskModel);
            break;
    }
    return ret;
}

class Task {
    constructor(app, taskModel) {
        this.app = app;
        this.type = taskModel.type;
        this.taskId = taskModel.id;
        this.weight = taskModel.weight;
        this.precondition = Precondition.makePreconditon(taskModel);
        this.treasure = taskModel.reward;
    }

    visit(eventSource) {
    }

    claim(role) {
        return treasure.claim(role, [this.treasure]).bind(this)
        .then(function (gain) {
            return models.Role.get(role.id).update({
                taskDone: r.row("taskDone").difference([this.taskId]),
                taskClaimed: r.row("taskClaimed").setInsert(this.taskId)
            }).run()
            .then(function () {
                return gain;
            });
        });
    }

    needRole(context) {
        if (!context.role) {
            context.role = models.Role.get(context.roleId).run();
        }
    }

    inProgress(context) {
        return context.role.taskData[this.taskId] !== undefined && context.role.taskData[this.taskId] !== null;
    }

    isDone(context) {
        return context.role.taskDone.indexOf(this.taskId) !== -1;
    }

    getProgress(context) {
        if (context.role.taskDone.indexOf(this.taskId) !== -1) {
            return [1, 1];
        }
        else if (this.inProgress(context)) {
            return [0, 1];
        }
        else {
            return [0, 0];
        }
    }

    initialProgress() {
        return true;
    }

    isDaily() {
        return this.type === 2;
    }

    isRandom() {
        return this.type === 1;
    }

    isEvent() {
        return this.type === 0;
    }
}

class RoleLevel extends Task {
    constructor(app, taskModel) {
        super(app, taskModel);
        this.level = taskModel.condition[1];
    }

    visit(eventSource) {
        var levelUp = this.levelUp.bind(this);
        levelUp.prepare = this.needRole;
        eventSource.on("Role.LevelUp", levelUp);
    }

    levelUp(context) {
        context.taskId = this.taskId;
        if (this.inProgress(context)) {
            if (context.role.level === this.level) {
                var dataUpdate = {};
                dataUpdate[this.taskId] = null;
                models.Role.get(context.roleId).update({
                    taskDone: r.row("taskDone").setInsert(this.taskId),
                    taskData: dataUpdate
                }).run();
            }
        }
    }
}
