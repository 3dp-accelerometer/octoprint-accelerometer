/*
 * View model for Octoprint Accelerometer
 *
 * Author: Raoul Rubien
 * License: Apache-2.0
 */
$(function() {
    function AccelerometerViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.access = parameters[1];
        self.settings = parameters[2];

        self.plugin_name = "octoprint_accelerometer";
        self.ui_estimated_recording_duration_str = ko.observable();

        // self.settings.settings.plugins.octoprint_accelerometer.do_sample_x.subscribe(function() {
                // console.log("on x changed");
                // self.requestData();
        // });

        self.requestGet = function (request) {
            OctoPrint.simpleApiGet(self.plugin_name +"?q="+ request)
            .done(self.fromResponse);
        };

        self.requestEstimation = function () {
            self.requestGet("estimate");
        };

        self.requestData = function () {
            if (!self.loginState.hasPermission(self.access.permissions.CONNECTION)) { return; }
            self.requestEstimation();
        }

        self.fromResponse = function (response) {
            console.log(response)
            console.log(response.estimated)
            var estimate = response.estimated;
            if (estimate) {self.ui_estimated_recording_duration_str(estimate);}
        };

        self.onStartupComplete = function (allViewModels) { self.requestData(); };

    }

    OCTOPRINT_VIEWMODELS.push({
        construct: AccelerometerViewModel,
        name: "accelerometerViewModel",
        dependencies: ["loginStateViewModel",
                       "accessViewModel",
                       "settingsViewModel"],
        elements: [ "#tab_plugin_octoprint_accelerometer"]
    });
});
