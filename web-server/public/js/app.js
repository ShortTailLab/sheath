var sheath = angular.module('sheath', [
    'ngRoute',
    'ngAnimate',
    'countTo',
    'highcharts-ng',
    'ui.grid',
    'ui.grid.edit',
    'ui.select2',
    'ui.bootstrap',
    'ui.bootstrap.datetimepicker',
    'ui.ace',
    'angular-loading-bar',
    'angularFileUpload',
    'ngTable',
    'angularMoment',
    'textAngular',
    'sheath.controllers',
    'sheath.services'
]);

sheath.config(['$routeProvider', '$locationProvider', "$httpProvider", function ($routeProvider, $locationProvider, $httpProvider) {
    $routeProvider.
        when('/index', {
            templateUrl: 'partials/index',
            controller: 'basicStatsController'
        }).
        when('/user', {
            templateUrl: 'partials/user',
            controller: 'userListController'
        }).
        when('/user/detail/:uid', {
            templateUrl: 'partials/userDetail',
            controller: 'userDetailController'
        }).
        when('/reward', {
            templateUrl: 'partials/reward',
            controller: 'rewardController'
        }).
        when('/store', {
            templateUrl: 'partials/store',
            controller: 'storeController'
        }).
        when('/event', {
            templateUrl: 'partials/event',
            controller: 'eventController'
        }).
        when('/stats', {
            templateUrl: 'partials/stats',
            controller: 'statsController'
        }).
        when('/partition', {
            templateUrl: 'partials/partition',
            controller: 'partitionListController'
        }).
        when('/admin', {
            templateUrl: 'partials/admin',
            controller: 'adminController'
        }).
        when('/export', {
            templateUrl: 'partials/export',
            controller: 'exportController'
        }).
        when('/control', {
            templateUrl: 'partials/control',
            controller: 'settingsController'
        }).
        when('/import', {
            templateUrl: 'partials/import',
            controller: 'importController'
        }).
        when('/announcement', {
            templateUrl: 'partials/announcement',
            controller: 'announcementController'
        }).
        when('/push', {
            templateUrl: 'partials/push',
            controller: 'pushController'
        }).
        when('/mcode', {
            templateUrl: 'partials/mcode',
            controller: 'mcodeController'
        }).
        when('/logout', {
            redirectTo: function () {window.location = "/logout";}
        }).
        otherwise({
            redirectTo: '/index'
        });

    $httpProvider.responseInterceptors.push(['$rootScope', '$q', "$window", function (scope, $q, $window) {

        function success(response) {
            return response;
        }

        function error(response) {
            var status = response.status;

            if (status === 401) {
                $window.location = "/login";
                return;
            }
            // otherwise
            return $q.reject(response);
        }

        return function (promise) {
            return promise.then(success, error);
        };

    }]);

    $locationProvider.html5Mode(true).hashPrefix("!#");
}]);
