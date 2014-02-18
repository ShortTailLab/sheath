var traceur = require("traceur");
var path = require("path");

var base = __dirname;
var app = path.normalize(base + "/../game-server/app");
var task = path.normalize(base + "/../game-server/task");

traceur.require.makeDefault(function(filename) {
    return filename.startsWith(base) || filename.startsWith(app) || filename.startsWith(task);
});
