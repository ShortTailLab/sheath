var sheath = angular.module('sheath', [
    'ngRoute',
    'ngAnimate',
    'ngGrid',
    'countTo',
    'highcharts-ng',
    'angular-loading-bar',
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
        when('/phones/:phoneId', {
            templateUrl: 'partials/phone-detail.html',
            controller: 'PhoneDetailCtrl'
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

            if (status == 401) {
                $window.location = "/login";
                return;
            }
            // otherwise
            return $q.reject(response);
        }

        return function (promise) {
            return promise.then(success, error);
        }

    }]);

    $locationProvider.html5Mode(true).hashPrefix("!#");
}]);
