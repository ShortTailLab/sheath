var Constants = require("../../../../../shared/constants");
var models = require("../../../../../shared/models");
var fs = require("fs");

module.exports = function (app) {
    return new TaskRemote(app);
};

var requireUnCached = function (module) {
    delete require.cache[require.resolve(module)];
    return require(module);
};

var checkFileType = function(fn, suffix) {
    if(suffix.charAt(0) !== '.') {
        suffix = '.' + suffix;
    }

    if(fn.length <= suffix.length) {
        return false;
    }

    var str = fn.substring(fn.length - suffix.length).toLowerCase();
    suffix = suffix.toLowerCase();
    return str === suffix;
};

var isFile = function(path) {
    return fs.statSync(path).isFile();
};

class TaskRemote {
    constructor(app) {
        this.app = app;
    }

    notify(eventName, roleId, params, cb) {
    }

    queryTaskStatus(roleId) {
    }

    loadFile() {
        try {
            var path = this.app.base + "/task/";
            var files = fs.readdirSync(path);

            for(var i=0, l=files.length; i<l; i++) {
                var fn = files[i];
                var fp = path + fn;

                if(!isFile(fp) || !checkFileType(fn, '.js')) {
                    // only load js file type
                    continue;
                }

                requireUnCached(fp);
            }
        }
        catch (err) {
            console.warn(err);
        }
    }
}
