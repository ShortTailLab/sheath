var Promise = require("bluebird");
var models = require("../../shared/models");
var Precondition = require("./preconditions");

export function create (app, taskModel) {
    var ret;
    switch (taskModel.type) {
        case "Level":
            ret = new RoleLevel(app, taskModel);
            break;
    }
    return ret;
}

class Task {
    constructor(app, taskModel) {
        this.app = app;
        this.precondition = Precondition.makePreconditon(taskModel.preCondition);
    }

    visit(eventSource) {
    }

    needRole(context) {
        if (!context.role) {
            context.role = models.Role.findP(context.roleId);
        }
    }
}

class RoleLevel extends Task {
    constructor(app, taskModel) {
        super(app, taskModel);
        this.levelUp.prepare = this.needRole;
    }

    visit(eventSource) {
        eventSource.on("levelUp", this.levelUp.bind(this));
    }

    levelUp(context) {

    }
}
