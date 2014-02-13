var _ = require("underscore");

module.exports.dispatch = function(key, list) {
    return _.sample(list, 1);
};
