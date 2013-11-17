var sheathServices = angular.module('sheath.services', []);

sheathServices.factory('ws', function ($rootScope, $location) {
    var wsURL = "ws://" + $location.host() + ":" + $location.port();
    var socket = new WebSocket(wsURL);
    return {
        on: function (eventName, callback) {
            socket.on(eventName, function () {
                var args = arguments;
                $rootScope.$apply(function () {
                    callback.apply(socket, args);
                });
            });
        },
        send: function (data, callback) {
            socket.send(data, function () {
                var args = arguments;
                $rootScope.$apply(function () {
                    if (callback) {
                        callback.apply(socket, args);
                    }
                });
            })
        }
    };
});
