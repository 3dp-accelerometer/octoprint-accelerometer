"use strict";
$(function() {

    /**
     * GET/POST API
     */

    const PLUGIN_NAME = "octoprint_accelerometer";
    function requestGet(request, optional = "") {
        return OctoPrint.get(OctoPrint.getBlueprintUrl(PLUGIN_NAME) + "/" + request + optional);
    };

    function requestPost (command, payload_json = {}) {
        return OctoPrint.postJson(OctoPrint.getBlueprintUrl(PLUGIN_NAME) + "/" + command, payload_json);
    };

    function pluginGetEstimate() { return requestGet("get_estimate"); }
    function pluginGetAllParameters() { return requestGet("get_parameters"); }
    function pluginGetParameters(names_list) { return requestGet("get_parameters", "?v=" + names_list); }
    function pluginGetFilesListing(names_list) { return requestGet("get_files_listing"); }
    function pluginGetStreamFilesListing(names_list) { return requestGet("get_stream_files_listing"); }
    function pluginGetFftFilesListing(names_list) { return requestGet("get_fft_files_listing"); }
    function pluginGetDataListing(names_list) { return requestGet("get_data_listing"); }

    function pluginDoStartRecording() { return requestPost("start_recording"); };
    function pluginDoAbortRecording() { return requestPost("abort_recording"); };
    function pluginDoSetValues(values_dict) { return requestPost("set_values", values_dict); };
    function pluginDoStartDataProcessing(values_dict) { return requestPost("start_data_processing", {}); };

    /**
     * helper
     */

    function secondsToReadableString(seconds) {
        let minutes_fraction = Math.floor(seconds / 60);
        let seconds_fraction = Number(seconds - (minutes_fraction  * 60)).toFixed(1);
        if (minutes_fraction >  0) { minutes_fraction = minutes_fraction + "m "; } else { minutes_fraction = ""; }
        if (seconds_fraction >  0) { seconds_fraction = seconds_fraction + "s"; } else { seconds_fraction = ""; }
        return minutes_fraction + seconds_fraction;
    };

    function effectiveSteps(start, stop, increment) {
        return Math.floor((stop - start) / increment);
    };

    /**
     * tab view model
     */

    function AccelerometerTabViewModel(parameters) {
        const self = this;

        self.login_state = parameters[0];
        self.access = parameters[1];
        self.settings = parameters[2];
        self.printer_state = parameters[3];

        // settings: shared among plugin, settings and UI
        self.ui_estimated_recording_duration_text = ko.observable();
        self.ui_do_sample_x = ko.observable();
        self.ui_do_sample_y = ko.observable();
        self.ui_do_sample_z = ko.observable();
        self.ui_step_count = ko.observable();
        self.ui_sequence_count = ko.observable();
        self.ui_distance_x_mm = ko.observable();
        self.ui_distance_y_mm = ko.observable();
        self.ui_distance_z_mm = ko.observable();
        self.ui_speed_x_mm_s = ko.observable();
        self.ui_speed_y_mm_s = ko.observable();
        self.ui_speed_z_mm_s = ko.observable();
        self.ui_acceleration_x_mm_ss = ko.observable();
        self.ui_acceleration_y_mm_ss = ko.observable();
        self.ui_acceleration_z_mm_ss = ko.observable();
        self.ui_start_frequency_hz = ko.observable();
        self.ui_stop_frequency_hz = ko.observable();
        self.ui_step_frequency_hz = ko.observable();
        self.ui_start_zeta_em2 = ko.observable();
        self.ui_stop_zeta_em2 = ko.observable();
        self.ui_step_zeta_em2 = ko.observable();
        self.ui_recording_timespan_s = ko.observable();
        self.ui_sequence_separation_s = ko.observable();
        self.ui_step_separation_s = ko.observable();
        self.ui_sensor_output_data_rate_hz = ko.observable();
        self.ui_auto_home = ko.observable();
        self.ui_go_start = ko.observable();
        self.ui_return_start = ko.observable();
        self.ui_data_remove_before_run = ko.observable();
        self.ui_do_dry_run = ko.observable();

        // variables computed by plugin and shared with UI
        self.ui_devices_seen = ko.observable();
        self.ui_device = ko.observable();
        self.ui_stream_files_list = ko.observable();

        // variables computed in UI
        self.ui_frequency_hz_step_total_count = ko.observable();
        self.ui_zeta_em2_step_total_count = ko.observable();

        // volatile UI variables that come via onDataUpdaterPluginMessage callback
        //   - do not require loading from the plugin itself
        //   - its okay to loose those values on page reload
        self.ui_recording_state = ko.observable("");
        self.ui_data_processing_state = ko.observable("");
        self.ui_last_data_recording_duration_str = ko.observable();
        self.ui_last_data_processing_duration_str = ko.observable();
        self.ui_last_data_processing_total_files_count = ko.observable();
		self.ui_last_data_processing_processed_files_count = ko.observable();
		self.ui_last_data_processing_skipped_files_count = ko.observable();

        self.onStartupComplete = () => {
            self.plugin_settings = self.settings.settings.plugins.octoprint_accelerometer;

            // on settings changed: subscribe UI observables on their respective settings observable
            const settings_observables = [
                // observable, observable name (as in plugin; without ui_ prefix), observer
                [self.plugin_settings.do_sample_x, "do_sample_x", self.ui_do_sample_x],
                [self.plugin_settings.do_sample_y, "do_sample_y", self.ui_do_sample_y],
                [self.plugin_settings.do_sample_z, "do_sample_z", self.ui_do_sample_z],
                [self.plugin_settings.step_count, "step_count", self.ui_step_count],
                [self.plugin_settings.sequence_count, "sequence_count", self.ui_sequence_count],
                [self.plugin_settings.distance_x_mm, "distance_x_mm", self.ui_distance_x_mm],
                [self.plugin_settings.distance_y_mm, "distance_y_mm", self.ui_distance_y_mm],
                [self.plugin_settings.distance_z_mm, "distance_z_mm", self.ui_distance_z_mm],
                [self.plugin_settings.speed_x_mm_s, "speed_x_mm_s", self.ui_speed_x_mm_s],
                [self.plugin_settings.speed_y_mm_s, "speed_y_mm_s", self.ui_speed_y_mm_s],
                [self.plugin_settings.speed_z_mm_s, "speed_z_mm_s", self.ui_speed_z_mm_s],
                [self.plugin_settings.acceleration_x_mm_ss, "acceleration_x_mm_ss", self.ui_acceleration_x_mm_ss],
                [self.plugin_settings.acceleration_y_mm_ss, "acceleration_y_mm_ss", self.ui_acceleration_y_mm_ss],
                [self.plugin_settings.acceleration_z_mm_ss, "acceleration_z_mm_ss", self.ui_acceleration_z_mm_ss],
                [self.plugin_settings.start_frequency_hz, "start_frequency_hz", self.ui_start_frequency_hz],
                [self.plugin_settings.stop_frequency_hz, "stop_frequency_hz", self.ui_stop_frequency_hz],
                [self.plugin_settings.step_frequency_hz, "step_frequency_hz", self.ui_step_frequency_hz],
                [self.plugin_settings.start_zeta_em2, "start_zeta_em2", self.ui_start_zeta_em2],
                [self.plugin_settings.stop_zeta_em2, "stop_zeta_em2", self.ui_stop_zeta_em2],
                [self.plugin_settings.step_zeta_em2, "step_zeta_em2", self.ui_step_zeta_em2],
                [self.plugin_settings.recording_timespan_s, "recording_timespan_s", self.ui_recording_timespan_s],
                [self.plugin_settings.sequence_separation_s, "sequence_separation_s", self.ui_sequence_separation_s],
                [self.plugin_settings.step_separation_s, "step_separation_s", self.ui_step_separation_s],
                [self.plugin_settings.sensor_output_data_rate_hz, "sensor_output_data_rate_hz", self.ui_sensor_output_data_rate_hz],
                [self.plugin_settings.auto_home, "auto_home", self.ui_auto_home],
                [self.plugin_settings.go_start, "go_start", self.ui_go_start],
                [self.plugin_settings.return_start, "return_start", self.ui_return_start],
                [self.plugin_settings.data_remove_before_run, "data_remove_before_run", self.ui_data_remove_before_run],
                [self.plugin_settings.do_dry_run, "do_dry_run", self.ui_do_dry_run],
            ];

            for (const item of settings_observables) {
                const observable = item[0];
                const observable_name = item[1];
                const observer = item[2];
                observable.subscribe(
                    (new_value) => {
                        observer(new_value);
                        self.updatePluginValuesFromUi([observable_name]);
                        self.requestPluginEstimation();
                    }
                );
            }

            // on UI parameter changed: subscribe on UI observable changes and send the respective parameter update to the plugin
            const observables = [
                // observable, observable name (as in plugin, without ui_ prefix)
                [self.ui_do_sample_x, "do_sample_x"],
                [self.ui_do_sample_y, "do_sample_y"],
                [self.ui_do_sample_z, "do_sample_z"],
                [self.ui_step_count, "step_count"],
                [self.ui_sequence_count, "sequence_count"],
                [self.ui_distance_x_mm, "distance_x_mm"],
                [self.ui_distance_y_mm, "distance_y_mm"],
                [self.ui_distance_z_mm, "distance_z_mm"],
                [self.ui_speed_x_mm_s, "speed_x_mm_s"],
                [self.ui_speed_y_mm_s, "speed_y_mm_s"],
                [self.ui_speed_z_mm_s, "speed_z_mm_s"],
                [self.ui_acceleration_x_mm_ss, "acceleration_x_mm_ss"],
                [self.ui_acceleration_y_mm_ss, "acceleration_y_mm_ss"],
                [self.ui_acceleration_z_mm_ss, "acceleration_z_mm_ss"],
                [self.ui_start_frequency_hz, "start_frequency_hz"],
                [self.ui_stop_frequency_hz, "stop_frequency_hz"],
                [self.ui_step_frequency_hz, "step_frequency_hz"],
                [self.ui_start_zeta_em2, "start_zeta_em2"],
                [self.ui_stop_zeta_em2, "stop_zeta_em2"],
                [self.ui_step_zeta_em2, "step_zeta_em2"],
                [self.ui_recording_timespan_s, "recording_timespan_s"],
                [self.ui_sequence_separation_s, "sequence_separation_s"],
                [self.ui_step_separation_s, "step_separation_s"],
                [self.ui_sensor_output_data_rate_hz, "sensor_output_data_rate_hz"],
                [self.ui_auto_home, "auto_home"],
                [self.ui_go_start, "go_start"],
                [self.ui_return_start, "return_start"],
                [self.ui_data_remove_before_run, "data_remove_before_run"],
                [self.ui_do_dry_run, "do_dry_run"],
            ];

            for (const item of observables) {
                const observable = item[0];
                const observable_name = item[1]
                observable.subscribe(() => {
                        self.updatePluginValuesFromUi([observable_name]);
                        self.requestPluginEstimation();
                    }
                );
            }

            // initially fetch data from plugin
            const getPluginData = () => {
                if (!self.login_state.hasPermission(self.access.permissions.CONNECTION)) { return; }
                self.requestPluginEstimation();
                self.requestAllParameters();
                self.requestStreamFilesListing();
            }
            getPluginData();
        };

        self.startRecording = () => {
            if (self.printer_state.isOperational() &&
               !self.printer_state.isPrinting() &&
               !self.printer_state.isCancelling() &&
               !self.printer_state.isPausing() &&
                self.login_state.hasPermission(self.access.permissions.PRINT))
            {
                pluginDoStartRecording();
            }
        };

        self.abortRecording = () => {
            if (self.login_state.hasPermission(self.access.permissions.CONNECTION))
            {
                pluginDoAbortRecording();
            }
        };

        /**
         * plugin API
         */

        self.updatePluginValuesFromUi = (values_list = []) => {
            const all_values = {
                "do_sample_x": () => self.ui_do_sample_x(),
                "do_sample_y": () => self.ui_do_sample_y(),
                "do_sample_z": () => self.ui_do_sample_z(),
                "step_count": () => self.ui_step_count(),
                "sequence_count": () => self.ui_sequence_count(),
                "distance_x_mm": () => self.ui_distance_x_mm(),
                "distance_y_mm": () => self.ui_distance_y_mm(),
                "distance_z_mm": () => self.ui_distance_z_mm(),
                "speed_x_mm_s": () => self.ui_speed_x_mm_s(),
                "speed_y_mm_s": () => self.ui_speed_y_mm_s(),
                "speed_z_mm_s": () => self.ui_speed_z_mm_s(),
                "acceleration_x_mm_ss": () => self.ui_acceleration_x_mm_ss(),
                "acceleration_y_mm_ss": () => self.ui_acceleration_y_mm_ss(),
                "acceleration_z_mm_ss": () => self.ui_acceleration_z_mm_ss(),
                "start_frequency_hz": () => self.ui_start_frequency_hz(),
                "stop_frequency_hz": () => self.ui_stop_frequency_hz(),
                "step_frequency_hz": () => self.ui_step_frequency_hz(),
                "start_zeta_em2": () => self.ui_start_zeta_em2(),
                "stop_zeta_em2": () => self.ui_stop_zeta_em2(),
                "step_zeta_em2": () => self.ui_step_zeta_em2(),
                "recording_timespan_s": () => self.ui_recording_timespan_s(),
                "sequence_separation_s": () => self.ui_sequence_separation_s(),
                "step_separation_s": () => self.ui_step_separation_s(),
                "sensor_output_data_rate_hz": () => self.ui_sensor_output_data_rate_hz(),
                "auto_home": () => self.ui_auto_home(),
                "go_start": () => self.ui_go_start(),
                "return_start": () => self.ui_return_start(),
                "data_remove_before_run": () => self.ui_data_remove_before_run(),
                "do_dry_run": () => self.ui_do_dry_run(),
            };

            if (values_list.length === 0) { pluginDoSetValues(all_values); }
            else {
                const values_dict = {};
                for (const var_name of values_list) { values_dict[var_name] = all_values[var_name](); }
                pluginDoSetValues(values_dict);
            }
        };

        self.requestPluginEstimation   = () => pluginGetEstimate().done(self.updateUiFromGetResponse);
        self.requestAllParameters      = () => pluginGetAllParameters().done(self.updateUiFromGetResponse);
        self.requestStreamFilesListing = () => pluginGetStreamFilesListing().done(self.updateUiStreamFilesFromGetResponse);

        self.updateUiStreamFilesFromGetResponse = (response) => {
            if (Object.hasOwn(response, "stream_files")) {
                self.ui_stream_files_list(response.stream_files);
            }
        };

        self.updateUiFromGetResponse = (response) => {
            self.ui_frequency_hz_step_total_count(
                effectiveSteps(self.ui_start_frequency_hz(), self.ui_stop_frequency_hz(), self.ui_step_frequency_hz()));
            self.ui_zeta_em2_step_total_count(
                effectiveSteps(self.ui_start_zeta_em2(), self.ui_stop_zeta_em2(), self.ui_step_zeta_em2()));

            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }

            if (Object.hasOwn(response, "parameters")) {
                const do_sample_x = response.parameters.do_sample_x;
                const do_sample_y = response.parameters.do_sample_y;
                const do_sample_z = response.parameters.do_sample_z;
                const step_count = response.parameters.step_count;
                const sequence_count = response.parameters.sequence_count;
                const distance_x_mm = response.parameters.distance_x_mm;
                const distance_y_mm = response.parameters.distance_y_mm;
                const distance_z_mm = response.parameters.distance_z_mm;
                const speed_x_mm_s = response.parameters.speed_x_mm_s;
                const speed_y_mm_s = response.parameters.speed_y_mm_s;
                const speed_z_mm_s = response.parameters.speed_z_mm_s;
                const acceleration_x_mm_ss = response.parameters.acceleration_x_mm_ss;
                const acceleration_y_mm_ss = response.parameters.acceleration_y_mm_ss;
                const acceleration_z_mm_ss = response.parameters.acceleration_z_mm_ss;
                const start_frequency_hz = response.parameters.start_frequency_hz;
                const stop_frequency_hz = response.parameters.stop_frequency_hz;
                const step_frequency_hz = response.parameters.step_frequency_hz;
                const start_zeta_em2 = response.parameters.start_zeta_em2;
                const stop_zeta_em2 = response.parameters.stop_zeta_em2;
                const step_zeta_em2 = response.parameters.step_zeta_em2;
                const recording_timespan_s = response.parameters.recording_timespan_s;
                const sequence_separation_s = response.parameters.sequence_separation_s;
                const step_separation_s = response.parameters.step_separation_s;
                const devices_seen = response.parameters.devices_seen;
                const device = response.parameters.device;
                const auto_home = response.parameters.auto_home;
                const go_start = response.parameters.go_start;
                const return_start = response.parameters.return_start;
                const data_remove_before_run = response.parameters.data_remove_before_run;
                const do_dry_run = response.parameters.do_dry_run;

                if (do_sample_x) { self.ui_do_sample_x(do_sample_x); }
                if (do_sample_y) { self.ui_do_sample_y(do_sample_y); }
                if (do_sample_z) { self.ui_do_sample_z(do_sample_z); }
                if (step_count) { self.ui_step_count(step_count); }
                if (sequence_count) { self.ui_sequence_count(sequence_count); }
                if (distance_x_mm) { self.ui_distance_x_mm(distance_x_mm); }
                if (distance_y_mm) { self.ui_distance_y_mm(distance_y_mm); }
                if (distance_z_mm) { self.ui_distance_z_mm(distance_z_mm); }
                if (speed_x_mm_s) { self.ui_speed_x_mm_s(speed_x_mm_s); }
                if (speed_y_mm_s) { self.ui_speed_y_mm_s(speed_y_mm_s); }
                if (speed_z_mm_s) { self.ui_speed_z_mm_s(speed_z_mm_s); }
                if (acceleration_x_mm_ss) { self.ui_acceleration_x_mm_ss(acceleration_x_mm_ss); }
                if (acceleration_y_mm_ss) { self.ui_acceleration_y_mm_ss(acceleration_y_mm_ss); }
                if (acceleration_z_mm_ss) { self.ui_acceleration_z_mm_ss(acceleration_z_mm_ss); }
                if (start_frequency_hz) { self.ui_start_frequency_hz(start_frequency_hz); }
                if (stop_frequency_hz) { self.ui_stop_frequency_hz(stop_frequency_hz); }
                if (step_frequency_hz) { self.ui_step_frequency_hz(step_frequency_hz); }
                if (start_zeta_em2) { self.ui_start_zeta_em2(start_zeta_em2); }
                if (stop_zeta_em2) { self.ui_stop_zeta_em2(stop_zeta_em2); }
                if (step_zeta_em2) { self.ui_step_zeta_em2(step_zeta_em2); }
                if (recording_timespan_s) { self.ui_recording_timespan_s(recording_timespan_s); }
                if (sequence_separation_s) { self.ui_sequence_separation_s(sequence_separation_s); }
                if (step_separation_s) { self.ui_step_separation_s(step_separation_s); }
                if (auto_home) { self.ui_auto_home(auto_home); }
                if (go_start) { self.ui_go_start(go_start); }
                if (return_start) { self.ui_return_start(return_start); }
                if (data_remove_before_run) { self.ui_data_remove_before_run(data_remove_before_run); }
                if (do_dry_run) { self.ui_do_dry_run(do_dry_run); }
                if (devices_seen) { self.ui_devices_seen(devices_seen); } else { self.ui_devices_seen([]); }
                if (device) { self.ui_device(device); } else { self.ui_device("-"); }
            }
        };

        self.onDataUpdaterPluginMessage = (plugin, data) => {
            console.log(plugin);
            console.log(data);

            if (plugin !== PLUGIN_NAME) { return; }
			if ("RecordingEventType" in data) {
			    const recording_event = data["RecordingEventType"];
			    self.ui_recording_state(recording_event);
			    if (["PROCESSING_FINISHED", "UNHANDLED_EXCEPTION", "ABORTED"].includes(recording_event)) {
			        pluginDoStartDataProcessing();
			    }
			}
			if ("DataProcessingEventType" in data) {
			    self.ui_data_processing_state(data["DataProcessingEventType"]);
			}
			if ("LAST_DATA_RECORDING_DURATION_S" in data) { self.ui_last_data_recording_duration_str(secondsToReadableString(data["LAST_DATA_RECORDING_DURATION_S"])) }
			if ("LAST_DATA_PROCESSING_DURATION_S" in data) { self.ui_last_data_processing_duration_str(secondsToReadableString(data["LAST_DATA_PROCESSING_DURATION_S"])) }
			if ("FILES_TOTAL_COUNT" in data) { self.ui_last_data_processing_total_files_count(data["FILES_TOTAL_COUNT"]) }
			if ("FILES_PROCESSED_COUNT" in data) { self.ui_last_data_processing_processed_files_count(data["FILES_PROCESSED_COUNT"]) }
			if ("FILES_SKIPPED_COUNT" in data) { self.ui_last_data_processing_skipped_files_count(data["FILES_SKIPPED_COUNT"]) }
        };

    };

    /**
     * settings view model
     */

    function AccelerometerSettingsViewModel(parameters) {
        const self = this;

        self.settings_view_model = parameters[0];

        self.ui_frequency_hz_step_total_count = ko.observable();
        self.ui_zeta_em2_step_total_count = ko.observable();
        self.ui_estimated_recording_duration_text = ko.observable();

        self.requestPluginEstimation = () =>pluginGetEstimate().done(self.updateUiFromGetResponse);

        self.updateUiFromGetResponse = (response) => {
            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }
        };

        self.onStartupComplete = () => {
            const updateFrequencySteps = () => {
                self.ui_frequency_hz_step_total_count(
                    effectiveSteps(
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.start_frequency_hz(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.stop_frequency_hz(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.step_frequency_hz()));
            };

            const updateZetaSteps = () => {
                self.ui_zeta_em2_step_total_count(
                    effectiveSteps(
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.start_zeta_em2(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.stop_zeta_em2(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.step_zeta_em2()));
            };

            self.settings_view_model.settings.plugins.octoprint_accelerometer.start_frequency_hz.subscribe(() => { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.stop_frequency_hz.subscribe(() => { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_frequency_hz.subscribe(() => { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.start_zeta_em2.subscribe(() => { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.stop_zeta_em2.subscribe(() => { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_zeta_em2.subscribe(() => { updateZetaSteps(); self.requestPluginEstimation(); });

            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_x.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_y.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_z.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.recording_timespan_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.sequence_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.sequence_count.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_count.subscribe(self.requestPluginEstimation);

            self.requestPluginEstimation();
            updateFrequencySteps();
            updateZetaSteps();
        };
    };

    /**
     * register view models
     */

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
