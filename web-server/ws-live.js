module.exports = function (wss) {
    wss.on("connection", function (ws) {
        var conn = new WSConn(ws);
    });
}

function WSConn(ws) {
    this.ws = ws;
    ws.on("message", this.msgCallback.bind(this));
    ws.on("close", this.onclose.bind(this));
}

var pro = WSConn.prototype;

pro.msgCallback = function (data) {
    this.intervalID = setInterval(function () {

    }, 5000);
}

pro.onclose = function () {
    if (this.intervalID) {
        clearInterval(this.intervalID);
    }
}
