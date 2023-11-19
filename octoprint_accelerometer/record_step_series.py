import threading
from logging import Logger
from typing import List, Literal, Callable, Optional
from typing import Tuple

from octoprint.printer import PrinterInterface
from py3dpaxxel.controller.api import ErrorFifoOverflow, ErrorUnknownResponse
from py3dpaxxel.controller.constants import OutputDataRateFromHz
from py3dpaxxel.sampling_tasks.steps_series_runner import SamplingStepsSeriesRunner

from octoprint_accelerometer.py3dpaxxel_octo import Py3dpAxxelOcto


class RecordStepSeriesTask(Callable):

    def __init__(self, runner: SamplingStepsSeriesRunner) -> None:
        self.runner: SamplingStepsSeriesRunner = runner

    def __call__(self, *args, **kwargs) -> None:
        self.runner.run()


class RecordStepSeriesThread:

    def __init__(self, task: RecordStepSeriesTask) -> None:
        self.task: RecordStepSeriesTask = task
        self.thread: threading.Thread = threading.Thread(name="step_series_recording", target=self.task)
        self.thread.daemon = True

    def is_alive(self):
        return self.thread.is_alive()

    def start(self) -> None:
        self.thread.start()


class RecordStepSeriesRunner:

    def __init__(self,
                 logger: Logger,
                 printer: PrinterInterface,
                 controller_serial_device: str,
                 controller_record_timelapse_s: float,
                 controller_decode_timeout_s: float,
                 sensor_odr_hz: int,
                 gcode_start_point_mm: Tuple[int, int, int],
                 gcode_axis: List[Literal["x", "y", "z"]],
                 gcode_distance_mm: int,
                 gcode_repetitions_count: int,
                 gcode_series_count: int,
                 frequency_start: int,
                 frequency_stop: int,
                 frequency_step: int,
                 zeta_start: int,
                 zeta_stop: int,
                 zeta_step: int,
                 output_file_prefix: str,
                 output_dir: str,
                 do_dry_run: bool):
        self.controller_response_error: bool = False
        self.controller_fifo_overrun_error: bool = False
        self.unhandled_exception: bool = False
        self.logger: Logger = logger
        self.printer: PrinterInterface = printer
        self._controller_serial_device: str = controller_serial_device
        self._controller_record_timelapse_s: float = controller_record_timelapse_s
        self._controller_decode_timeout_s: float = controller_decode_timeout_s
        self._sensor_odr_hz: int = sensor_odr_hz
        self._gcode_start_point_mm: Tuple[int, int, int] = gcode_start_point_mm
        self._gcode_axis: List[Literal["x", "y", "z"]] = gcode_axis
        self._gcode_distance_mm: int = gcode_distance_mm
        self._gcode_repetitions_count: int = gcode_repetitions_count
        self._gcode_series_count: int = gcode_series_count
        self._frequency_start: int = frequency_start
        self._frequency_stop: int = frequency_stop
        self._frequency_step: int = frequency_step
        self._zeta_start: int = zeta_start
        self._zeta_stop: int = zeta_stop
        self._zeta_step: int = zeta_step
        self._output_file_prefix: str = output_file_prefix
        self._output_dir: str = output_dir
        self._do_dry_run: bool = do_dry_run
        self.thread: Optional[RecordStepSeriesThread] = None

    @property
    def controller_serial_device(self) -> str:
        return self._controller_serial_device

    @controller_serial_device.setter
    def controller_serial_device(self, controller_serial_device: str):
        self._controller_serial_device = controller_serial_device

    @property
    def controller_record_timelapse_s(self) -> float:
        return self._controller_record_timelapse_s

    @controller_record_timelapse_s.setter
    def controller_record_timelapse_s(self, controller_record_timelapse_s: float):
        self._controller_record_timelapse_s = controller_record_timelapse_s

    @property
    def controller_decode_timeout_s(self) -> float:
        return self._controller_decode_timeout_s

    @controller_decode_timeout_s.setter
    def controller_decode_timeout_s(self, controller_decode_timeout_s: float):
        self._controller_decode_timeout_s = controller_decode_timeout_s

    @property
    def sensor_odr_hz(self) -> int:
        return self._sensor_odr_hz

    @sensor_odr_hz.setter
    def sensor_odr_hz(self, sensor_odr_hz: int):
        self._sensor_odr_hz = sensor_odr_hz

    @property
    def gcode_start_point_mm(self) -> Tuple[int, int, int]:
        return self._gcode_start_point_mm

    @gcode_start_point_mm.setter
    def gcode_start_point_mm(self, gcode_start_point_mm: Tuple[int, int, int]):
        self._gcode_start_point_mm = gcode_start_point_mm

    @property
    def gcode_axis(self) -> List[Literal["x", "y", "z"]]:
        return self._gcode_axis

    @gcode_axis.setter
    def gcode_axis(self, gcode_axis: List[Literal["x", "y", "z"]]):
        self._gcode_axis = gcode_axis

    @property
    def gcode_distance_mm(self) -> int:
        return self._gcode_distance_mm

    @gcode_distance_mm.setter
    def gcode_distance_mm(self, gcode_distance_mm: int):
        self._gcode_distance_mm = gcode_distance_mm

    @property
    def gcode_repetitions_count(self) -> int:
        return self._gcode_repetitions_count

    @gcode_repetitions_count.setter
    def gcode_repetitions_count(self, gcode_repetitions_count: int):
        self._gcode_repetitions_count = gcode_repetitions_count

    @property
    def gcode_series_count(self) -> int:
        return self._gcode_series_count

    @gcode_series_count.setter
    def gcode_series_count(self, gcode_series_count: int):
        self._gcode_series_count = gcode_series_count

    @property
    def frequency_start(self) -> int:
        return self._frequency_start

    @frequency_start.setter
    def frequency_start(self, frequency_start: int):
        self._frequency_start = frequency_start

    @property
    def frequency_stop(self) -> int:
        return self._frequency_stop

    @frequency_stop.setter
    def frequency_stop(self, frequency_stop: int):
        self._frequency_stop = frequency_stop

    @property
    def frequency_step(self) -> int:
        return self._frequency_step

    @frequency_step.setter
    def frequency_step(self, frequency_step: int):
        self._frequency_step = frequency_step

    @property
    def zeta_start(self) -> int:
        return self._zeta_start

    @zeta_start.setter
    def zeta_start(self, zeta_start: int):
        self._zeta_start = zeta_start

    @property
    def zeta_stop(self) -> int:
        return self._zeta_stop

    @zeta_stop.setter
    def zeta_stop(self, zeta_stop: int):
        self._zeta_stop = zeta_stop

    @property
    def zeta_step(self) -> int:
        return self._zeta_step

    @zeta_step.setter
    def zeta_step(self, zeta_step: int):
        self._zeta_step = zeta_step

    @property
    def output_file_prefix(self) -> str:
        return self._output_file_prefix

    @output_file_prefix.setter
    def output_file_prefix(self, output_file_prefix: str):
        self._output_file_prefix = output_file_prefix

    @property
    def output_dir(self) -> str:
        return self._output_dir

    @output_dir.setter
    def output_dir(self, output_dir: str):
        self._output_dir = output_dir

    @property
    def do_dry_run(self) -> bool:
        return self._do_dry_run

    @do_dry_run.setter
    def do_dry_run(self, do_dry_run: bool):
        self._do_dry_run = do_dry_run

    def is_running(self) -> bool:
        return True if self.thread is not None and self.thread.is_alive() else False

    def task_execution_had_errors(self) -> bool:
        return self.controller_response_error or self.controller_response_error or self.unhandled_exception

    def run(self) -> None:
        py3dpaxxel_octo = Py3dpAxxelOcto(self.printer, self.logger)
        self.controller_fifo_overrun_error = False
        self.controller_response_error = False
        self.unhandled_exception = False

        if not self.printer.is_operational():
            self.logger.warning("received request to start recording but printer is not operational")
            return

        try:
            self.logger.info("start recording ...")
            # todo emit event on finish/error
            self.thread = RecordStepSeriesThread(
                task=RecordStepSeriesTask(
                    runner=SamplingStepsSeriesRunner(
                        octoprint_api=py3dpaxxel_octo,
                        controller_serial_device=self.controller_serial_device,
                        controller_record_timelapse_s=self.controller_record_timelapse_s,
                        controller_decode_timeout_s=self.controller_decode_timeout_s,
                        sensor_odr=OutputDataRateFromHz[self.sensor_odr_hz],
                        gcode_start_point_mm=self.gcode_start_point_mm,
                        gcode_axis=self.gcode_axis,
                        gcode_distance_mm=self.gcode_distance_mm,
                        gcode_repetitions=self.gcode_repetitions_count,
                        runs=self.gcode_series_count,
                        fx_start=self.frequency_start,
                        fx_stop=self.frequency_stop,
                        fx_step=self.frequency_step,
                        zeta_start=self.zeta_start,
                        zeta_stop=self.zeta_stop,
                        zeta_step=self.zeta_step,
                        output_file_prefix=self.output_file_prefix,
                        output_dir=self.output_dir,
                        do_dry_run=self.do_dry_run)))
            self.thread.start()

        except ErrorFifoOverflow as e:
            self.logger.error("controller reported FiFo overrun")
            self.logger.error(e)
            self.controller_fifo_overrun_error = True

        except ErrorUnknownResponse as e:
            self.controller_response_error = True
            self.logger.error("unknown response from controller")
            self.logger.error(e)

        except Exception as e:
            self.unhandled_exception = True
            self.logger.error("unknown controller API error")
            self.logger.error(e.__traceback__)
