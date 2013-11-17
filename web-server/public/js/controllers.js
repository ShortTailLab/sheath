var sheathControllers = angular.module('sheath.controllers', []);

sheathControllers.controller('basicStatsController', function ($scope, $http, $window) {
    var refreshInterval = 10000;
    $scope.refreshInterval = refreshInterval;

    function fetch() {
        $http.get("/api/nodeInfo").
            success(function (data) {
                $scope.nodes = _.values(data.nodes);
            });
        $http.get("/api/basicStats").
            success(function (data) {
                if ($scope.userStats === undefined) {
                    $scope.userStats = {
                        _clients: data.onlineUser.totalConnCount,
                        _onlineUsers: data.onlineUser.loginedCount,
                        _totalUsers: data.totalUsers,
                        _totalRoles: data.totalRoles
                    };
                }
                else {
                    $scope.userStats._clients = $scope.userStats.clients;
                    $scope.userStats._onlineUsers = $scope.userStats.onlineUsers;
                    $scope.userStats._totalUsers = $scope.userStats.totalUsers;
                    $scope.userStats._totalRoles = $scope.userStats.totalRoles;
                }
                $scope.userStats.clients = data.onlineUser.totalConnCount;
                $scope.userStats.onlineUsers = data.onlineUser.loginedCount;
                $scope.userStats.totalUsers = data.totalUsers;
                $scope.userStats.totalRoles = data.totalRoles;
            });
    }

    $scope.humanizeUpTime = function (minute) {
        return moment.duration(-minute, "minutes").humanize();
    };

    $scope.intervalID = $window.setInterval(function () {
        $scope.$apply(fetch);
    }, refreshInterval);
    $scope.$on('$destroy', function () {
        if ($scope.intervalID) {
            $window.clearInterval($scope.intervalID);
            delete $scope.intervalID;
        }
    });

    fetch();
});

sheathControllers.controller('userListController', function ($scope, $http, $window) {
    $scope.totalUsers = 0;
    $scope.pagingOptions = {
        pageSize: 25,
        currentPage: 1
    };
    $scope.filterOptions = {
        filterText: "",
        useExternalFilter: true
    };
    $scope.gridOptions = {
        data: 'users',
        enablePaging: true,
        showFooter: true,
        totalServerItems: 'totalUsers',
        pagingOptions: $scope.pagingOptions,
        filterOptions: $scope.filterOptions
    };
    $scope.getPagedDataAsync = function (pageSize, page, searchText) {
        $http.post("/api/userList", {pageSize: pageSize, page: page, search: searchText}).
            success(function (data) {
                _.extend($scope, data);
            });
    };

    $scope.getPagedDataAsync($scope.pagingOptions.pageSize, $scope.pagingOptions.currentPage);
    $scope.$watch('filterOptions', function (newVal, oldVal) {
        if (newVal !== oldVal) {
            $scope.getPagedDataAsync($scope.pagingOptions.pageSize, $scope.pagingOptions.currentPage, $scope.filterOptions.filterText);
        }
    }, true);
});

sheathControllers.controller('partitionListController', function ($scope, $http) {
    $http.get("/api/partitions").
        success(function (data) {
            $scope.partitions = data.partitions;
        });
});
