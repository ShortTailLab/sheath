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

sheathControllers.controller('userListController', function ($scope, $http, ngTableParams) {
    $scope.query = null;

    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
        _.each($scope.partitions, function (p) { p.selected = true; });

        $scope.tableParams = new ngTableParams({
            page: 1,
            count: 50
        }, {
            total: 0,
            counts: [],
            groupBy: "partitionName",
            getData: function($defer, params) {
                var partitions = _.pluck(_.filter($scope.partitions, function (p) {return p.selected;}), "id");
                $http.post("/api/userList", {pageSize: params.count(), page: params.page(), hint:$scope.query, partitions: partitions})
                .success(function (data) {
                    params.total(data.totalRoles);
                    _.each(data.roles, function (r) {
                        var part = _.findWhere($scope.partitions, {id: r.partition});
                        if (part) {
                            r.partitionName = part.name;
                        }
                        else {
                            r.partitionName = "---";
                        }
                    });

                    $defer.resolve(data.roles);
                });
            }
        });
    });

    $scope.humanize = function (date) {
        return moment(date).format("YYYY-MM-DD HH:mm:ss");
    };
    $scope.submit = function () {
        $scope.tableParams.reload();
    };
    $scope.edit = function (role) {
        role.editable = angular.copy(role);
    };
    $scope.save = function (role) {
        var editable = role.editable;
        delete role.editable;

        var diff = {id: role.id};
        var fields = ["level", "energy", "golds", "coins", "contribs"];
        for (var i=0;i<fields.length;i++) {
            var field = fields[i];
            if (role[field] !== editable[field]) {
                diff[field] = editable[field];
            }
        }

        if (_.size(diff) > 1) {
            $http.post("/api/updateRole", diff).success(function (data) {
                _.extend(role, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
});

sheathControllers.controller('partitionListController', function ($scope, $modal, $http) {
    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
    });

    $scope.humanize = function (date) {
        return moment(date).format("YYYY-MM-DD HH:mm");
    };

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: 'modalAddPartition.html',
            controller: 'addPartitionController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newPart) {
            $http.post("/api/addPartitions", newPart).success(function (data) {
                $scope.partitions.push(data);
                $scope.error = null;
            })
            .error(function (data) {
                $scope.error = "添加分区 " + newPart.name + " 失败，" + (data.message || "未知错误");
            });
        });
    };

    $scope.removePartition = function (part) {
        $http.post("/api/removePartition", {id: part.id}).success(function (data) {
            $scope.partitions = _.reject($scope.partitions, function (p) {return p.id === data.id;});
            $scope.error = null;
        })
        .error(function (data) {
            $scope.error = "删除分区 " + part.name + " 失败，" + (data.message || "未知错误");
        });
    };
});

sheathControllers.controller('addPartitionController', function ($scope, $modalInstance) {
    var openTime = moment(new Date());
    openTime.seconds(0);
    $scope.newPartition = {
        openSince: openTime,
        public: true
    };

    $scope.ok = function () {
        $modalInstance.close($scope.newPartition);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };

    $scope.openDate = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        $scope.dpOpened = true;
    };
});

sheathControllers.controller('adminController', function ($scope, $http, $timeout, $modal) {
    $http.post("/api/adminList").success(function (data) {
        $scope.items = data.admins;
        $scope.select($scope.items[0]);
    })
    .error(function (data) {
        $scope.error = data.message || "未知错误";
    });

    $scope.select = function (data) {
        $scope.selected = data;
        $scope.editable = angular.copy(data);
    };

    $scope.modify = function () {
        $http.post("/api/modifyAdmin", {id: $scope.editable.id, manRole: $scope.editable.manRole}).success(function (data) {
            var stock = _.findWhere($scope.items, {id: data.id});
            if (stock) {
                _.extend(stock, data);
                $scope.select(stock);
                $scope.info = "修改成功";
                $timeout(function () {$scope.info = null;}, 2000);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.delete = function () {
        $http.post("/api/removeAdmin", {id: $scope.editable.id}).success(function () {
            $scope.items = _.reject($scope.items, function (item) {
                return item.id === $scope.editable.id;
            });
            $scope.editable = null;
            if ($scope.items.length) {
                $scope.select($scope.items[0]);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: 'templates/modalAddAdmin',
            controller: 'addAdminController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newAdmin) {
            $http.post("/api/addAdmin", {userId: newAdmin}).success(function (data) {
                $scope.items.push(data);
                $scope.error = null;
                $scope.select(data);
            })
            .error(function (data) {
                $scope.error = "添加管理员错误。 " + (data.message || "未知错误");
            });
        });
    };
});

sheathControllers.controller('addAdminController', function ($scope, $http, $modalInstance) {
    $scope.getUserByHint = function (val) {
        return $http.post("/api/findUsers", {hint: val}).then(function (res) {
            return res.data.users;
        });
    };

    $scope.ok = function (userId) {
        $modalInstance.close(userId);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('importController', function ($scope, $http, $upload, $timeout) {
    $scope.upload = function ($files, tag) {
        var file = $files[0];
        $upload.upload({
            url: "/api/import",
            data: {tag: tag},
            file: file
        })
        .success(function (data) {
            $scope.error = null;
            $scope.info = "导入成功";
            $timeout(function () {$scope.info = null;}, 2000);
        })
        .error(function (err) {
            $scope.error = "上传文件失败: " + (err.message || "未知错误");
        });
    };
});

sheathControllers.controller('exportController', function ($scope, $http) {

});

sheathControllers.controller('settingsController', function ($scope, $http) {
    $scope.kickAll = function () {
        $http.post("/api/kickAll");
    };

    $scope.broadcast = function () {
        $http.post("/api/broadcast");
    };

    $scope.chat = function () {
        $http.post("/api/chat");
    };
});
