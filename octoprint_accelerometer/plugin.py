import os
from typing import Any, Dict, List, Literal, Optional, Tuple, Set, Union

import flask
import octoprint.plugin
from octoprint.server.util.tornado import LargeResponseHandler, path_validation_factory
from octoprint.util import is_hidden_path
from py3dpaxxel.cli.args import convert_axis_from_str
from py3dpaxxel.controller.api import Py3dpAxxel
from py3dpaxxel.sampling_tasks.series_argument_generator import RunArgsGenerator
from py3dpaxxel.storage.file_filter import FileSelector, File
from py3dpaxxel.storage.filename_meta import FilenameMetaStream, FilenameMetaFft, FilenameMeta

from octoprint_accelerometer.data_post_process import DataPostProcessRunner
from octoprint_accelerometer.event_types import DataProcessingEventType, RecordingEventType
from octoprint_accelerometer.record_step_series import RecordStepSeriesRunner


class Point3D:
    def __init__(self, x: int, y: int, z: int):
        self.x: int = x
        self.y: int = y
        self.z: int = z

    def __str__(self):
        return f"x={self.x} y={self.y} z={self.z}"


class OctoprintAccelerometerPlugin(octoprint.plugin.StartupPlugin,
                                   octoprint.plugin.SettingsPlugin,
                                   octoprint.plugin.AssetPlugin,
                                   octoprint.plugin.TemplatePlugin,
                                   octoprint.plugin.BlueprintPlugin):
    OUTPUT_STREAM_FILE_NAME_PREFIX: str = "axxel"
    OUTPUT_FFT_FILE_NAME_PREFIX: str = "fft"

    # noinspection PyMissingConstructor
    def __init__(self):
        # following parameters are shared among settings and UI
        self.distance_x_mm: int = 0
        self.distance_y_mm: int = 0
        self.distance_z_mm: int = 0
        self.step_count: int = 0
        self.speed_x_mm_s: int = 0
        self.speed_y_mm_s: int = 0
        self.speed_z_mm_s: int = 0
        self.acceleration_x_mm_ss: int = 0
        self.acceleration_y_mm_ss: int = 0
        self.acceleration_z_mm_ss: int = 0
        self.anchor_point_coord_x_mm: int = 0
        self.anchor_point_coord_y_mm: int = 0
        self.anchor_point_coord_z_mm: int = 0
        self.sequence_count: int = 0
        self.go_start: bool = False
        self.return_start: bool = False
        self.auto_home: bool = False
        self.start_frequency_hz: int = 0
        self.stop_frequency_hz: int = 0
        self.step_frequency_hz: int = 0
        self.start_zeta_em2: int = 0
        self.stop_zeta_em2: int = 0
        self.step_zeta_em2: int = 0
        self.sensor_output_data_rate_hz: int = 0
        self.data_remove_before_run: bool = False
        self.do_sample_x: bool = False
        self.do_sample_y: bool = False
        self.do_sample_z: bool = False
        self.recording_timespan_s: float = 0
        self.sequence_separation_s: float = 0
        self.step_separation_s: float = 0
        self.do_dry_run: bool = False

        # other parameters shared with UI

        self.devices_seen: List[str] = []
        self.device: str = ""
        self.controller_fifo_overrun_error: bool = False
        self.controller_response_error: bool = False

        # following parameters are computed from above parameters

        self.axis_x_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_y_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_z_sampling_start: Point3D = Point3D(0, 0, 0)

        # recording runner: once constructed before invocation all properties shall be updated
        self.data_recording_runner: Optional[RecordStepSeriesRunner] = None
        self.data_processing_runner: Optional[DataPostProcessRunner] = None

    @staticmethod
    def _get_devices() -> Tuple[str, List[str]]:
        """
        :return: tuple of primary device (if any) and list of all devices
        """
        seen_devices: List[str] = [k for k in Py3dpAxxel.get_devices_dict().keys()]
        primary: str = seen_devices[0] if len(seen_devices) > 0 else None
        return primary, seen_devices

    def _update_seen_devices(self):
        primary, seen_devices = self._get_devices()
        self._logger.debug(f"seen devices: primary={primary}, seen={seen_devices}")
        self.devices_seen = seen_devices
        self.device = primary if primary is not None else ""

    @octoprint.plugin.BlueprintPlugin.route("/set_values", methods=["POST"])
    def on_api_set_values(self):
        data = flask.request.json
        self._update_members_from_api(data)
        response = flask.jsonify(message="OK")
        response.status_code = 202
        return response

    @octoprint.plugin.BlueprintPlugin.route("/start_recording", methods=["POST"])
    def on_api_start_recording(self):
        self._start_recording()
        response = flask.jsonify(message="OK")
        response.status_code = 202
        return response

    @octoprint.plugin.BlueprintPlugin.route("/abort_recording", methods=["POST"])
    def on_api_abort_recording(self):
        self._abort_recording()
        response = flask.jsonify(message="OK")
        response.status_code = 202
        return response

    @octoprint.plugin.BlueprintPlugin.route("/start_data_processing", methods=["POST"])
    def on_api_start_data_processing(self):
        self._start_data_processing()
        response = flask.jsonify(message="OK")
        response.status_code = 202
        return response

    @octoprint.plugin.BlueprintPlugin.route("/get_estimate", methods=["GET"])
    def on_api_get_estimate(self):
        return flask.jsonify({f"estimate": self._estimate_duration()})

    @octoprint.plugin.BlueprintPlugin.route("/get_parameters", methods=["GET"])
    def on_api_get_parameters(self):
        return flask.jsonify({f"parameters": self._get_parameter_dict(flask.request.args)})

    @octoprint.plugin.BlueprintPlugin.route("/get_files_listing", methods=["GET"])
    def on_api_get_files_listing(self):
        fs = FileSelector(os.path.join(self.get_plugin_data_folder(), ".*"))
        files_details = {f.filename_ext: vars(f) for f in fs.filter()}
        return flask.jsonify({f"files": files_details})

    @octoprint.plugin.BlueprintPlugin.route("/get_stream_files_listing", methods=["GET"])
    def on_api_get_stream_files_listing(self):
        fs = FileSelector(os.path.join(self.get_plugin_data_folder(), f"{self.OUTPUT_STREAM_FILE_NAME_PREFIX}-.*\\.tsv$"))
        files_details = [{"file_name": f.filename_ext} | vars(FilenameMetaStream().from_filename(f.filename_ext)) for f in fs.filter()]
        return flask.jsonify({f"stream_files": files_details})

    @octoprint.plugin.BlueprintPlugin.route("/get_fft_files_listing", methods=["GET"])
    def on_api_get_fft_files_listing(self):
        fs = FileSelector(os.path.join(self.get_plugin_data_folder(), f"{self.OUTPUT_FFT_FILE_NAME_PREFIX}-.*\\.tsv$"))
        files_details = [{"file_name": f.filename_ext} | vars(FilenameMetaFft().from_filename(f.filename_ext)) for f in fs.filter()]
        return flask.jsonify({f"fft_files": files_details})

    @octoprint.plugin.BlueprintPlugin.route("/get_data_listing", methods=["GET"])
    def on_api_get_data_listing(self):
        fs_stream = FileSelector(os.path.join(self.get_plugin_data_folder(), f"{self.OUTPUT_STREAM_FILE_NAME_PREFIX}-.*\\.tsv$"))
        fs_fft = FileSelector(os.path.join(self.get_plugin_data_folder(), f"{self.OUTPUT_FFT_FILE_NAME_PREFIX}-.*\\.tsv$"))

        files_meta_data_stream: List[Tuple[File, FilenameMetaStream]] = [(f, FilenameMetaStream().from_filename(f.filename_ext)) for f in fs_stream.filter()]
        files_meta_data_fft: List[Tuple[File, FilenameMetaFft]] = [(f, FilenameMetaFft().from_filename(f.filename_ext)) for f in fs_fft.filter()]

        runs: Set[str] = set([m.prefix_2 for (_f, m) in files_meta_data_stream])
        data_sets: Dict[str, Dict[str, Union[str, Dict[str, Any]]]] = {run_hash: {} for run_hash in runs}

        def strip_off_unimportant_fields(f: File):
            for u in ["filename_ext", "full_path"]:
                f.__delattr__(u)

        def remap_fields_(m: FilenameMeta):
            for old_name, new_name in {"prefix_1": "prefix",
                                       "prefix_2": "run_hash",
                                       "prefix_3": "stream_hash"}.items():
                m.__dict__[new_name] = m.__dict__.pop(old_name)

        # append all streams
        for file_meta, filename_meta in files_meta_data_stream:
            run_hash: str = filename_meta.prefix_2
            stream_hash: str = filename_meta.prefix_3
            strip_off_unimportant_fields(file_meta)
            remap_fields_(filename_meta)
            stream_data: Dict[str, Any] = vars(file_meta) | vars(filename_meta) | {"fft": {}}
            data_sets[run_hash][stream_hash] = stream_data

        # append all FFT's to their respective stream
        for file_meta, filename_meta in files_meta_data_fft:
            run_hash = filename_meta.prefix_2
            stream_hash = filename_meta.prefix_3
            strip_off_unimportant_fields(file_meta)
            remap_fields_(filename_meta)
            fft_details = vars(file_meta) | vars(filename_meta)
            data_sets[run_hash][stream_hash]["fft"][file_meta.filename_no_ext] = fft_details

        return flask.jsonify({f"data_sets": data_sets})

    def route_hook(self, _server_routes, *_args, **_kwargs):
        return [
            (r"/download/(.*)",
             LargeResponseHandler,
             dict(path=self.get_plugin_data_folder(),
                  mime_type_guesser=lambda *args, **kwargs: "text/plain",
                  stream_body=True,
                  as_attachment=False,
                  path_validation=path_validation_factory(
                      lambda path: not is_hidden_path(path), status_code=404)
                  )
             )
        ]

    def get_template_vars(self):
        return dict(estimated_duration_s=self._estimate_duration())

    def get_template_configs(self):
        return [dict(type="settings", custom_bindings=True),
                dict(type="tab", custom_bindings=True)]

    def get_settings_defaults(self):
        profile: Dict[str, Any] = self._printer_profile_manager.get_current_or_default()
        width = profile["volume"]["width"]
        height = profile["volume"]["height"]
        depth = profile["volume"]["depth"]
        origin_center: bool = True if profile["volume"]["origin"] == "center" else False
        anchor_point = Point3D(0, 0, 50) if origin_center else Point3D(int(width // 2), int(depth // 2), int(height // 2))

        return dict(
            distance_x_mm=10,
            distance_y_mm=10,
            distance_z_mm=10,
            step_count=2,
            speed_x_mm_s=100,
            speed_y_mm_s=100,
            speed_z_mm_s=100,
            acceleration_x_mm_ss=1000,
            acceleration_y_mm_ss=1000,
            acceleration_z_mm_ss=1000,
            anchor_point_coord_x_mm=anchor_point.x,
            anchor_point_coord_y_mm=anchor_point.y,
            anchor_point_coord_z_mm=anchor_point.z,
            sequence_count=1,
            go_start=True,
            return_start=True,
            auto_home=True,
            start_frequency_hz=10,
            stop_frequency_hz=60,
            step_frequency_hz=10,
            start_zeta_em2=15,
            stop_zeta_em2=15,
            step_zeta_em2=5,
            sensor_output_data_rate_hz=800,
            data_remove_before_run=True,
            do_sample_x=True,
            do_sample_y=False,
            do_sample_z=False,
            recording_timespan_s=1.5,
            sequence_separation_s=0.1,
            step_separation_s=0.1,
            do_dry_run=False,
        )

    def on_settings_save(self, data):
        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
        self._update_members_from_settings()

    def on_after_startup(self):
        self._update_members_from_settings()
        self._update_seen_devices()
        self.data_recording_runner = self._construct_new_step_series_runner()
        self.data_processing_runner = self._construct_new_data_processing_runner()

    def get_assets(self):
        return {"js": ["js/octoprint_accelerometer.js",
                       "js/d3.js",
                       "js/plot.js",
                       "js/datavis.js"]}

    def get_update_information(self):
        # see https://docs.octoprint.org/en/master/bundledplugins/softwareupdate.html
        return {
            "octoprint_accelerometer": {
                "displayName": "Octoprint Accelerometer",
                "displayVersion": self._plugin_version,

                # version check: GitHub repository
                "type": "github_release",
                "user": "rubienr",
                "repo": "https://github.com/3dp-accelerometer/octoprint-accelerometer",
                "current": self._plugin_version,

                # update method: pip
                "pip": "https://github.com/3dp-accelerometer/octoprint-accelerometer/archive/{target_version}.zip",
            }
        }

    @staticmethod
    def _get_ui_exposed_parameters() -> List[str]:
        return ["distance_x_mm", "distance_y_mm", "distance_z_mm",
                "step_count",
                "speed_x_mm_s", "speed_y_mm_s", "speed_z_mm_s",
                "acceleration_x_mm_ss", "acceleration_y_mm_ss", "acceleration_z_mm_ss",
                "anchor_point_coord_x_mm", "anchor_point_coord_y_mm", "anchor_point_coord_z_mm",
                "sequence_count",
                "go_start", "return_start", "auto_home",
                "start_frequency_hz", "stop_frequency_hz", "step_frequency_hz",
                "start_zeta_em2", "stop_zeta_em2", "step_zeta_em2",
                "sensor_output_data_rate_hz",
                "data_remove_before_run",
                "do_sample_x", "do_sample_y", "do_sample_z",
                "recording_timespan_s", "sequence_separation_s", "step_separation_s",
                "devices_seen", "device", "do_dry_run"]

    def _update_member_from_str_value(self, parameter: str, value: str):
        if parameter in self._get_ui_exposed_parameters():
            old_value = getattr(self, parameter)
            value_type = type(old_value)
            setattr(self, parameter, value_type(value))
            new_value = getattr(self, parameter)
            self._logger.debug(f"xxx update {parameter}: {old_value} -> {new_value} from api")

    def _update_members_from_api(self, data: Dict[str, str]):
        for k, v in data.items():
            if hasattr(self, k):
                self._update_member_from_str_value(k, v)
        self._compute_start_points()

    def _update_members_from_settings(self) -> None:
        self._logger.debug("xxx update from settings ...")
        self.distance_x_mm = self._settings.get_int(["distance_x_mm"])
        self.distance_y_mm = self._settings.get_int(["distance_y_mm"])
        self.distance_z_mm = self._settings.get_int(["distance_z_mm"])
        self.step_count = self._settings.get_int(["step_count"])
        self.speed_x_mm_s = self._settings.get_int(["speed_x_mm_s"])
        self.speed_y_mm_s = self._settings.get_int(["speed_y_mm_s"])
        self.speed_z_mm_s = self._settings.get_int(["speed_z_mm_s"])
        self.acceleration_x_mm_ss = self._settings.get_int(["acceleration_x_mm_ss"])
        self.acceleration_y_mm_ss = self._settings.get_int(["acceleration_y_mm_ss"])
        self.acceleration_z_mm_ss = self._settings.get_int(["acceleration_z_mm_ss"])
        self.anchor_point_coord_x_mm = self._settings.get_int(["anchor_point_coord_x_mm"])
        self.anchor_point_coord_y_mm = self._settings.get_int(["anchor_point_coord_y_mm"])
        self.anchor_point_coord_z_mm = self._settings.get_int(["anchor_point_coord_z_mm"])
        self.sequence_count = self._settings.get_int(["sequence_count"])
        self.go_start = self._settings.get_boolean(["go_start"])
        self.return_start = self._settings.get_boolean(["return_start"])
        self.auto_home = self._settings.get_boolean(["auto_home"])
        self.start_frequency_hz = self._settings.get_int(["start_frequency_hz"])
        self.stop_frequency_hz = self._settings.get_int(["stop_frequency_hz"])
        self.step_frequency_hz = self._settings.get_int(["step_frequency_hz"])
        self.start_zeta_em2 = self._settings.get_int(["start_zeta_em2"])
        self.stop_zeta_em2 = self._settings.get_int(["stop_zeta_em2"])
        self.step_zeta_em2 = self._settings.get_int(["step_zeta_em2"])
        self.sensor_output_data_rate_hz = self._settings.get_int(["sensor_output_data_rate_hz"])
        self.data_remove_before_run = self._settings.get_boolean(["data_remove_before_run"])
        self.do_sample_x = self._settings.get_boolean(["do_sample_x"])
        self.do_sample_y = self._settings.get_boolean(["do_sample_y"])
        self.do_sample_z = self._settings.get_boolean(["do_sample_z"])
        self.recording_timespan_s = self._settings.get_float(["recording_timespan_s"])
        self.sequence_separation_s = self._settings.get_float(["sequence_separation_s"])
        self.step_separation_s = self._settings.get_float(["step_separation_s"])
        self.do_dry_run = self._settings.get_boolean(["do_dry_run"])

        self._compute_start_points()

    def _compute_start_points(self) -> None:
        self.axis_x_sampling_start = Point3D(self.anchor_point_coord_x_mm - int(self.distance_x_mm // 2),
                                             self.anchor_point_coord_y_mm,
                                             self.anchor_point_coord_z_mm)
        self.axis_y_sampling_start = Point3D(self.anchor_point_coord_x_mm,
                                             self.anchor_point_coord_y_mm - int(self.distance_y_mm // 2),
                                             self.anchor_point_coord_z_mm)
        self.axis_z_sampling_start = Point3D(self.anchor_point_coord_x_mm,
                                             self.anchor_point_coord_y_mm,
                                             self.anchor_point_coord_z_mm + int(self.distance_z_mm // 2))

    def _estimate_duration(self) -> float:
        axs: List[Literal["x", "y", "z"]] = [ax for ax, enabled in [("x", self.do_sample_x), ("y", self.do_sample_y), ("z", self.do_sample_z)] if enabled]
        sequences_count = len(RunArgsGenerator(
            sequence_repeat_count=self.sequence_count,
            fx_start_hz=self.start_frequency_hz,
            fx_stop_hz=self.stop_frequency_hz,
            fx_step_hz=self.step_frequency_hz,
            zeta_start_em2=self.start_zeta_em2,
            zeta_stop_em2=self.stop_zeta_em2,
            zeta_step_em2=self.step_zeta_em2,
            axis=axs,
            out_file_prefix_1="", out_file_prefix_2="").generate())

        duration_s = (sequences_count * self.recording_timespan_s +
                      (sequences_count - 1) * self.sequence_separation_s +
                      (self.step_count - 1) * sequences_count * self.step_separation_s)
        return duration_s

    def _get_parameter_dict(self, args: Dict[str, str] = None) -> Dict[str, str]:
        key_name: str = "v"
        requested_values: List[str] = []
        if args and key_name in args.keys() and args[key_name] is not None:
            requested_values.extend(args[key_name].split(","))

        # reply all parameters if no names were explicitly specified
        requested_values = self._get_ui_exposed_parameters() if len(requested_values) == 0 else requested_values

        params_dict: Dict[str, str] = dict()
        exposed_parameters = self._get_ui_exposed_parameters()

        for parameter_name in [pn for pn in requested_values if pn in exposed_parameters]:
            params_dict[parameter_name] = getattr(self, parameter_name)
        self._logger.debug(f"xxx supply with requested parameters: {params_dict}")
        return params_dict

    def _get_selected_axis_str(self) -> List[Literal["x", "y", "z"]]:
        return convert_axis_from_str(
            f"{'x' if self.do_sample_x else ''}{'y' if self.do_sample_y else ''}{'z' if self.do_sample_z else ''}"
        )

    def _construct_new_data_processing_runner(self) -> DataPostProcessRunner:
        return DataPostProcessRunner(
            logger=self._logger,
            on_event_callback=self.on_data_processing_callback,
            input_dir=self.get_plugin_data_folder(),
            input_file_prefix=self.OUTPUT_STREAM_FILE_NAME_PREFIX,
            algorithm_d1="discrete_blackman",
            output_dir=self.get_plugin_data_folder(),
            output_file_prefix=self.OUTPUT_FFT_FILE_NAME_PREFIX,
            output_overwrite=False,
            do_dry_run=False)

    def _construct_new_step_series_runner(self) -> RecordStepSeriesRunner:
        return RecordStepSeriesRunner(
            logger=self._logger,
            printer=self._printer,
            controller_serial_device=self.device,
            on_event_callback=self.on_recording_callback,
            controller_record_timelapse_s=self.recording_timespan_s,
            controller_decode_timeout_s=3.0,
            sensor_odr_hz=self.sensor_output_data_rate_hz,
            gcode_start_point_mm=(self.anchor_point_coord_x_mm, self.anchor_point_coord_y_mm, self.anchor_point_coord_z_mm),
            gcode_axis=self._get_selected_axis_str(),
            gcode_distance_mm=self.distance_x_mm,
            gcode_step_count=self.step_count,
            gcode_sequence_count=self.sequence_count,
            start_frequency_hz=self.start_frequency_hz,
            stop_frequency_hz=self.stop_frequency_hz,
            step_frequency_hz=self.step_frequency_hz,
            start_zeta_em2=self.start_zeta_em2,
            stop_zeta_em2=self.stop_zeta_em2,
            step_zeta_em2=self.step_zeta_em2,
            output_file_prefix=self.OUTPUT_STREAM_FILE_NAME_PREFIX,
            output_dir=self.get_plugin_data_folder(),
            do_dry_run=self.do_dry_run)

    def _push_data_to_ui(self, data: Dict[str, str]):
        self._plugin_manager.send_plugin_message(self._identifier, data)

    def _push_recording_event_to_ui(self, event: RecordingEventType):
        self._push_data_to_ui({RecordingEventType.__name__: event.name})

    def _push_data_processing_event_to_ui(self, event: DataProcessingEventType):
        self._push_data_to_ui({DataProcessingEventType.__name__: event.name})

    def on_recording_callback(self, event: RecordingEventType):
        self._push_recording_event_to_ui(event)
        if RecordingEventType.PROCESSING_FINISHED == event:
            last_run_duration_s = self.data_recording_runner.get_last_run_duration_s()
            if last_run_duration_s:
                self._push_data_to_ui({"LAST_DATA_RECORDING_DURATION_S": f"{last_run_duration_s}"})

    def on_data_processing_callback(self, event: DataProcessingEventType):
        self._push_data_processing_event_to_ui(event)
        if DataProcessingEventType.PROCESSING_FINISHED == event:
            last_run_duration_s = self.data_processing_runner.get_last_run_duration_s()
            if last_run_duration_s:
                self._push_data_to_ui({"LAST_DATA_PROCESSING_DURATION_S": f"{last_run_duration_s}"})

            total, processed, skipped = self.data_processing_runner.get_last_processed_count()
            if total:
                self._push_data_to_ui({"FILES_TOTAL_COUNT": f"{total}"})
            if processed:
                self._push_data_to_ui({"FILES_PROCESSED_COUNT": f"{processed}"})
            if skipped:
                self._push_data_to_ui({"FILES_SKIPPED_COUNT": f"{skipped}"})

    def _start_recording(self):
        self._push_recording_event_to_ui(RecordingEventType.STARTING)

        self._update_seen_devices()
        self.data_recording_runner.controller_serial_device = self.device
        self.data_recording_runner.controller_record_timelapse_s = self.recording_timespan_s
        self.data_recording_runner.sensor_odr_hz = self.sensor_output_data_rate_hz

        # todo acceleration
        # todo speed

        self.data_recording_runner.start_frequency_hz = self.start_frequency_hz
        self.data_recording_runner.stop_frequency_hz = self.stop_frequency_hz
        self.data_recording_runner.step_frequency_hz = self.step_frequency_hz

        self.data_recording_runner.start_zeta_em2 = self.start_zeta_em2
        self.data_recording_runner.stop_zeta_em2 = self.stop_zeta_em2
        self.data_recording_runner.step_zeta_em2 = self.step_zeta_em2

        self.data_recording_runner.gcode_step_count = self.step_count
        self.data_recording_runner.gcode_sequence_count = self.sequence_count
        self.data_recording_runner.gcode_start_point_mm = (self.anchor_point_coord_x_mm, self.anchor_point_coord_y_mm, self.anchor_point_coord_z_mm)
        self.data_recording_runner.gcode_axis = self._get_selected_axis_str()
        self.data_recording_runner.gcode_distance_mm = self.distance_x_mm  # todo: x y z distances

        self.data_recording_runner.do_dry_run = self.do_dry_run

        if not self.data_recording_runner.is_running():
            self.data_recording_runner.run()
        else:
            self._logger.warning("requested recording but recording task is still running")

    def _abort_recording(self):
        self.data_recording_runner.stop()

    def _start_data_processing(self):
        self._push_data_processing_event_to_ui(DataProcessingEventType.STARTING)
        if not self.data_processing_runner.is_running():
            self.data_processing_runner.run()
        else:
            self._logger.warning("requested data processing but task is still running")
