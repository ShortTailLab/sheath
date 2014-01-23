var pomeloClient = require("./pomelo-client.js");


var adminConfig = require("./config/admin.json");
var config = adminConfig[process.env.NODE_ENV || "development"];

function PomeloConn() {
    this.client = new pomeloClient({
        username: config.username,
        password: config.password,
        md5: false
    });
    this.client.on("close", pro.connect.bind(this));
}

var pro = PomeloConn.prototype;

pro.connect = function () {
    this.client.connect('adminPortal-' + Date.now(), config.host, config.port, function (err) {
        if (err && err !== "ok") {
            console.error('fail to connect to admin console server:');
            console.error(err);
        } else {
            console.info('admin console connected.');
        }
    });
};

pro.request = function (moduleId, msg, cb) {
    this.client.request(moduleId, msg, cb);
};

module.exports = new PomeloConn();
