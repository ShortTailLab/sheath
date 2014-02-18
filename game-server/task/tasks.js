var Promise = require("bluebird");
var models = require("../../shared/models");

export function create (app, taskModel) {
    console.log(taskModel);
}

class Task {
    visit(eventSource) {
    }

    needRole(context) {
        if (!context.role) {
            context.role = models.Role.findP(context.roleId);
        }
    }
}

class RoleLevel extends Task {
    constructor() {
        this.levelUp.prepare = this.needRole;
    }

    visit(eventSource) {
        eventSource.on("levelUp", this.levelUp.bind(this));
    }

    levelUp(context) {

    }
}
