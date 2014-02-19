
function Always() {
    return true;
}

var make = function (variable, op, condition) {

};

export var makePreconditon = function(conditions) {
    var preConditions = [];
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
