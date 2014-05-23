
function Always() {
    return true;
}

var makeLevel = function (op, condition) {
    condition = parseInt(condition);
    switch (op) {
        case "=":
            return function (context) { return context.role.level === condition; };
        case "!=":
            return function (context) { return context.role.level !== condition; };
        case "<":
            return function (context) { return context.role.level < condition; };
        case ">":
            return function (context) { return context.role.level > condition; };
        case ">=":
            return function (context) { return context.role.level >= condition; };
        case "<=":
            return function (context) { return context.role.level <= condition; };
        default:
            return Always;
    }
};

var makeTimes = function (op, condition) {
    condition = parseInt(condition);
    return function (context) {
        return context.role.taskData[context.taskId] < condition;
    };
};

var makeTask = function (op, condition) {
    condition = parseInt(condition);
    switch (op) {
        case "=":
            return function (context) { return context.role.taskDone.indexOf(condition) !== -1; };
        case "!=":
            return function (context) { return context.role.taskDone.indexOf(condition) === -1; };
        default:
            return Always;
    }
};

var make = function (variable, op, condition) {
    var factoryMap = {
        level: makeLevel,
        times: makeTimes,
        task: makeTask
    };
    var factoryFunc = factoryMap[variable];
    return factoryFunc ? factoryFunc(op, condition) : Always;
};

export var makePreconditon = function(task) {
    var preConditions = [];

    if (task.type === 0) {
        var evStart = task.start;
        var evEnd = task.end;
        preConditions.push(function (context) {
            var ret = evStart < new Date() < evEnd;
            return ret;
        });
    }

    var conditions = task.preCondition;
    for (var i=0;i<conditions.length;i+=3) {
        var variable = conditions[i];
        var op = conditions[i+1];
        var cond = conditions[i+2];
        preConditions.push(make(variable, op, cond));
    }

    if (preConditions.length === 0) {
        return Always;
    }
    else if (preConditions.length === 1) {
        return preConditions[0];
    }
    else {
        return function (context) {
            for (var i=0;i<preConditions.length;i++) {
                if (!preConditions[i](context)) {
                    return false;
                }
            }
            return true;
        };
    }
};
