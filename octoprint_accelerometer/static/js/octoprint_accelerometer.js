/*
 * View model for Octoprint Accelerometer
 *
 * Author: Raoul Rubien
 * License: Apache-2.0
 */
$(function() {

    // ----- GET/POST API

    PLUGIN_NAME = "octoprint_accelerometer";

    function requestGet(request, optional = "") {
        return OctoPrint.simpleApiGet(PLUGIN_NAME +"?q="+ request + optional);
    };

    function requestCommandPost (command, payload) {
        return OctoPrint.simpleApiCommand(PLUGIN_NAME, command, payload);
    };

    function pluginGetEstimate() { return requestGet("estimate"); }
    function pluginGetAllParameters() { return requestGet("parameters"); }
    function pluginGetParameters(names_list) { return requestGet("parameters", "&v=" + names_list); }

    function pluginDoStartRecording() { return requestCommandPost("start_recording", {}); };
    function pluginDoAbortRecording() { return requestCommandPost("abort_recording", {}); };
    function pluginDoSetValues(values_dict) { return requestCommandPost("set_values", values_dict); };

    // ----- helper

    function secondsToReadableString(seconds) {
        minutes = Math.floor(seconds / 60);
        seconds = Number(seconds - (minutes  * 60)).toFixed(1);
        if (minutes >  0) { minutes = minutes + "m "; } else { minutes = ""; }
        if (seconds >  0) { seconds = seconds + "s"; } else { seconds = ""; }
        return minutes + seconds;
    };

    function effectiveSteps(start, stop, increment) {
        return Math.floor((stop - start) / increment);
    };

    // ----- tab view model

    function AccelerometerTabViewModel(parameters) {
        var self = this;

        self.login_state = parameters[0];
        self.access = parameters[1];
        self.settings = parameters[2];
        self.printer_state = parameters[3];



        // variables shared among plugin, settings and UI
        self.ui_estimated_recording_duration_text = ko.observable();
        self.ui_do_sample_x = ko.observable();
        self.ui_do_sample_y = ko.observable();
        self.ui_do_sample_z = ko.observable();
        self.ui_repetitions_count = ko.observable();
        self.ui_distance_x_mm = ko.observable();
        self.ui_distance_y_mm = ko.observable();
        self.ui_distance_z_mm = ko.observable();
        self.ui_speed_x_mm_s = ko.observable();
        self.ui_speed_y_mm_s = ko.observable();
        self.ui_speed_z_mm_s = ko.observable();
        self.ui_acceleration_x_mm_ss = ko.observable();
        self.ui_acceleration_y_mm_ss = ko.observable();
        self.ui_acceleration_z_mm_ss = ko.observable();
        self.ui_frequency_start = ko.observable();
        self.ui_frequency_stop = ko.observable();
        self.ui_frequency_step = ko.observable();
        self.ui_zeta_start = ko.observable();
        self.ui_zeta_stop = ko.observable();
        self.ui_zeta_step = ko.observable();
        self.ui_recording_timespan_s = ko.observable();
        self.ui_repetitions_separation_s = ko.observable();
        self.ui_steps_separation_s = ko.observable();

        // variables shared among plugin and UI
        self.ui_devices_seen = ko.observable();
        self.ui_device = ko.observable();

        // variables shared with UI
        self.ui_frequency_steps_total_count = ko.observable();
        self.ui_zeta_steps_total_count = ko.observable();

        self.onStartupComplete = function () {
            self.plugin_settings = self.settings.settings.plugins.octoprint_accelerometer;

            var updatePluginDataAndRequestEstimation = function () {
                self.updatePluginDataFromUi();
                self.requestPluginEstimation();
            };

            // register UI on settings changed
            var settings_observables = [
                [self.plugin_settings.do_sample_x, self.ui_do_sample_x],
                [self.plugin_settings.do_sample_y, self.ui_do_sample_y],
                [self.plugin_settings.do_sample_z, self.ui_do_sample_z],
                [self.plugin_settings.repetitions_count, self.ui_repetitions_count],
                [self.plugin_settings.distance_x_mm, self.ui_distance_x_mm],
                [self.plugin_settings.distance_y_mm, self.ui_distance_y_mm],
                [self.plugin_settings.distance_z_mm, self.ui_distance_z_mm],
                [self.plugin_settings.speed_x_mm_s, self.ui_speed_x_mm_s],
                [self.plugin_settings.speed_y_mm_s, self.ui_speed_y_mm_s],
                [self.plugin_settings.speed_z_mm_s, self.ui_speed_z_mm_s],
                [self.plugin_settings.acceleration_x_mm_ss, self.ui_acceleration_x_mm_ss],
                [self.plugin_settings.acceleration_y_mm_ss, self.ui_acceleration_y_mm_ss],
                [self.plugin_settings.acceleration_z_mm_ss, self.ui_acceleration_z_mm_ss],
                [self.plugin_settings.frequency_start, self.ui_frequency_start],
                [self.plugin_settings.frequency_stop, self.ui_frequency_stop],
                [self.plugin_settings.frequency_step, self.ui_frequency_step],
                [self.plugin_settings.zeta_start, self.ui_zeta_start],
                [self.plugin_settings.zeta_stop, self.ui_zeta_stop],
                [self.plugin_settings.zeta_step, self.ui_zeta_step],
                [self.plugin_settings.recording_timespan_s, self.ui_recording_timespan_s],
                [self.plugin_settings.repetitions_separation_s, self.ui_repetitions_separation_s],
                [self.plugin_settings.steps_separation_s, self.ui_steps_separation_s],
            ];

            for (let index = 0; index < settings_observables.length; ++index) {
                settings_observables[index][0].subscribe(
                    function (newValue){
                        settings_observables[index][1](newValue);
                        updatePluginDataAndRequestEstimation();
                });
            }

            // send UI changes to plugin
            var observables = [
                [self.ui_do_sample_x, updatePluginDataAndRequestEstimation],
                [self.ui_do_sample_y, updatePluginDataAndRequestEstimation],
                [self.ui_do_sample_z, updatePluginDataAndRequestEstimation],
                [self.ui_repetitions_count, updatePluginDataAndRequestEstimation],
                [self.ui_distance_x_mm, updatePluginDataAndRequestEstimation],
                [self.ui_distance_y_mm, updatePluginDataAndRequestEstimation],
                [self.ui_distance_z_mm, updatePluginDataAndRequestEstimation],
                [self.ui_speed_x_mm_s, updatePluginDataAndRequestEstimation],
                [self.ui_speed_y_mm_s, updatePluginDataAndRequestEstimation],
                [self.ui_speed_z_mm_s, updatePluginDataAndRequestEstimation],
                [self.ui_acceleration_x_mm_ss, updatePluginDataAndRequestEstimation],
                [self.ui_acceleration_y_mm_ss, updatePluginDataAndRequestEstimation],
                [self.ui_acceleration_z_mm_ss, updatePluginDataAndRequestEstimation],
                [self.ui_frequency_start, updatePluginDataAndRequestEstimation],
                [self.ui_frequency_stop, updatePluginDataAndRequestEstimation],
                [self.ui_frequency_step, updatePluginDataAndRequestEstimation],
                [self.ui_zeta_start, updatePluginDataAndRequestEstimation],
                [self.ui_zeta_stop, updatePluginDataAndRequestEstimation],
                [self.ui_zeta_step, updatePluginDataAndRequestEstimation],
                [self.ui_recording_timespan_s, updatePluginDataAndRequestEstimation],
                [self.ui_repetitions_separation_s, updatePluginDataAndRequestEstimation],
                [self.ui_steps_separation_s, updatePluginDataAndRequestEstimation],
            ];

            for (let index = 0; index < observables.length; ++index) {
                observables[index][0].subscribe(observables[index][1]);
            }

            // fetch data from plugin
            self.getPluginData();
        };

        self.startRecording = function () {
            if (self.printer_state.isOperational() &&
               !self.printer_state.isPrinting() &&
               !self.printer_state.isCancelling() &&
               !self.printer_state.isPausing() &&
                self.login_state.hasPermission(self.access.permissions.PRINT))
            {
                pluginDoStartRecording();
            }
        };

        self.abortRecording = function () {
            if (self.login_state.hasPermission(self.access.permissions.CONNECTION))
            {
                pluginDoAbortRecording();
            }
        };

        // ----- plugin API

        self.getPluginData = function () {
            if (!self.login_state.hasPermission(self.access.permissions.CONNECTION)) { return; }
            self.requestPluginEstimation();
            self.requestAllParameters();

        }

        self.updatePluginDataFromUi = function () {
            pluginDoSetValues(
                {"do_sample_x": self.ui_do_sample_x(),
                 "do_sample_y": self.ui_do_sample_y(),
                 "do_sample_z": self.ui_do_sample_z(),
                 "repetitions_count": self.ui_repetitions_count(),
                 "distance_x_mm": self.ui_distance_x_mm(),
                 "distance_y_mm": self.ui_distance_y_mm(),
                 "distance_z_mm": self.ui_distance_z_mm(),
                 "speed_x_mm_s": self.ui_speed_x_mm_s(),
                 "speed_y_mm_s": self.ui_speed_y_mm_s(),
                 "speed_z_mm_s": self.ui_speed_z_mm_s(),
                 "acceleration_x_mm_ss": self.ui_acceleration_x_mm_ss(),
                 "acceleration_y_mm_ss": self.ui_acceleration_y_mm_ss(),
                 "acceleration_z_mm_ss": self.ui_acceleration_z_mm_ss(),
                 "frequency_start": self.ui_frequency_start(),
                 "frequency_stop": self.ui_frequency_stop(),
                 "frequency_step": self.ui_frequency_step(),
                 "zeta_start": self.ui_zeta_start(),
                 "zeta_stop": self.ui_zeta_stop(),
                 "zeta_step": self.ui_zeta_step(),
                 "recording_timespan_s": self.ui_recording_timespan_s(),
                 "repetitions_separation_s": self.ui_repetitions_separation_s(),
                 "steps_separation_s": self.ui_steps_separation_s(),
                 });
        };

        self.requestPluginEstimation = function () { pluginGetEstimate().done(self.updateUiFromGetResponse); };
        self.requestAllParameters = function () { pluginGetAllParameters().done(self.updateUiFromGetResponse); };

        // ----- GET/POST plugin API

        self.updateUiFromGetResponse = function (response) {
            self.ui_frequency_steps_total_count(
                effectiveSteps(self.ui_frequency_start(), self.ui_frequency_stop(), self.ui_frequency_step()));
            self.ui_zeta_steps_total_count(
                effectiveSteps(self.ui_zeta_start(), self.ui_zeta_stop(), self.ui_zeta_step()));

            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }

            if (Object.hasOwn(response, "parameters")) {
                var do_sample_x = response.parameters.do_sample_x;
                var do_sample_y = response.parameters.do_sample_y;
                var do_sample_z = response.parameters.do_sample_z;
                var repetitions_count = response.parameters.repetitions_count;
                var distance_x_mm = response.parameters.distance_x_mm;
                var distance_y_mm = response.parameters.distance_y_mm;
                var distance_z_mm = response.parameters.distance_z_mm;
                var speed_x_mm_s = response.parameters.speed_x_mm_s;
                var speed_y_mm_s = response.parameters.speed_y_mm_s;
                var speed_z_mm_s = response.parameters.speed_z_mm_s;
                var acceleration_x_mm_ss = response.parameters.acceleration_x_mm_ss;
                var acceleration_y_mm_ss = response.parameters.acceleration_y_mm_ss;
                var acceleration_z_mm_ss = response.parameters.acceleration_z_mm_ss;
                var frequency_start = response.parameters.frequency_start;
                var frequency_stop = response.parameters.frequency_stop;
                var frequency_step = response.parameters.frequency_step;
                var zeta_start = response.parameters.zeta_start;
                var zeta_stop = response.parameters.zeta_stop;
                var zeta_step = response.parameters.zeta_step;
                var recording_timespan_s = response.parameters.recording_timespan_s;
                var repetitions_separation_s = response.parameters.repetitions_separation_s;
                var steps_separation_s = response.parameters.steps_separation_s;
                var devices_seen = response.parameters.devices_seen;
                var device = response.parameters.device;

                if (do_sample_x) { self.ui_do_sample_x(do_sample_x); }
                if (do_sample_y) { self.ui_do_sample_y(do_sample_y); }
                if (do_sample_z) { self.ui_do_sample_z(do_sample_z); }
                if (repetitions_count) { self.ui_repetitions_count(repetitions_count); }
                if (distance_x_mm) { self.ui_distance_x_mm(distance_x_mm); }
                if (distance_y_mm) { self.ui_distance_y_mm(distance_y_mm); }
                if (distance_z_mm) { self.ui_distance_z_mm(distance_z_mm); }
                if (speed_x_mm_s) { self.ui_speed_x_mm_s(speed_x_mm_s); }
                if (speed_y_mm_s) { self.ui_speed_y_mm_s(speed_y_mm_s); }
                if (speed_z_mm_s) { self.ui_speed_z_mm_s(speed_z_mm_s); }
                if (acceleration_x_mm_ss) { self.ui_acceleration_x_mm_ss(acceleration_x_mm_ss); }
                if (acceleration_y_mm_ss) { self.ui_acceleration_y_mm_ss(acceleration_y_mm_ss); }
                if (acceleration_z_mm_ss) { self.ui_acceleration_z_mm_ss(acceleration_z_mm_ss); }
                if (frequency_start) { self.ui_frequency_start(frequency_start); }
                if (frequency_stop) { self.ui_frequency_stop(frequency_stop); }
                if (frequency_step) { self.ui_frequency_step(frequency_step); }
                if (zeta_start) { self.ui_zeta_start(zeta_start); }
                if (zeta_stop) { self.ui_zeta_stop(zeta_stop); }
                if (zeta_step) { self.ui_zeta_step(zeta_step); }
                if (recording_timespan_s) { self.ui_recording_timespan_s(recording_timespan_s); }
                if (repetitions_separation_s) { self.ui_repetitions_separation_s(repetitions_separation_s); }
                if (steps_separation_s) { self.ui_steps_separation_s(steps_separation_s); }
                if (devices_seen) { self.ui_devices_seen(devices_seen); } else { self.ui_devices_seen([]); }
                if (device) { self.ui_device(device); } else { self.ui_device("-"); }
            }
        };

    };

    // ----- settings view model

    function AccelerometerSettingsViewModel(parameters) {
        var self = this;

        self.settings_view_model = parameters[0];

        self.ui_frequency_steps_total_count = ko.observable();
        self.ui_zeta_steps_total_count = ko.observable();
        self.ui_estimated_recording_duration_text = ko.observable();

        self.requestPluginEstimation = function () { pluginGetEstimate().done(self.updateUiFromGetResponse); };

        self.updateUiFromGetResponse = function (response) {
            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }
        };

        self.onStartupComplete = function () {
            var updateFrequencySteps = function () {
                self.ui_frequency_steps_total_count(
                    effectiveSteps(
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_start(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_stop(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_step()));
            };

            var updateZetaSteps = function () {
                self.ui_zeta_steps_total_count(
                    effectiveSteps(
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_start(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_stop(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_step()));
            };

            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_start.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_stop.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_step.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_start.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_stop.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_step.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });

            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_x.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_y.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_z.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.recording_timespan_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.repetitions_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.steps_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.runs_count.subscribe(self.requestPluginEstimation);

            self.requestPluginEstimation();
            updateFrequencySteps();
            updateZetaSteps();
        };
    };

    // -----

    OCTOPRINT_VIEWMODELS.push({
        construct: AccelerometerTabViewModel,
        name: "accelerometerTabViewModel",
        dependencies: ["loginStateViewModel",
                       "accessViewModel",
                       "settingsViewModel",
                       "printerStateViewModel"],
        elements: ["#tab_plugin_octoprint_accelerometer"]
    });

    OCTOPRINT_VIEWMODELS.push({
        construct: AccelerometerSettingsViewModel,
        name: "accelerometerSettingsViewModel",
        dependencies: ["settingsViewModel"],
        elements: ["#settings_plugin_octoprint_accelerometer"]
    });
});
