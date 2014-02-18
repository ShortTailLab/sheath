class Task {
    visit(eventSource) {

    }
}


exports.stageClear = function (opts) {
    return function (event, params) {
        switch (event) {
            case "Stage.Clear":
                break;
            default:
                return;
        }
    };
};

exports.levelAchieved = function (opts) {

};
