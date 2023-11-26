import threading
import time
from logging import Logger
from typing import List, Literal, Callable, Optional
from typing import Tuple

from octoprint.printer import PrinterInterface
from py3dpaxxel.controller.api import ErrorFifoOverflow, ErrorUnknownResponse
from py3dpaxxel.controller.constants import OutputDataRateFromHz
from py3dpaxxel.sampling_tasks.exception_task_wrapper import ExceptionTaskWrapper
from py3dpaxxel.sampling_tasks.steps_series_runner import SamplingStepsSeriesRunner

from octoprint_accelerometer.event_types import RecordingEventType
from octoprint_accelerometer.py3dpaxxel_octo import Py3dpAxxelOcto


class RecordStepSeriesTask(Callable):

    def __init__(self,
                 logger: Logger,
                 runner: Callable,
                 on_event_callback: Optional[Callable[[RecordingEventType.PROCESSING], None]]) -> None:
        self.logger: Logger = logger
        self.runner: Callable = runner
        self.on_event_callback: Optional[Callable[[RecordingEventType.PROCESSING], None]] = on_event_callback

    def __call__(self) -> None:
        try:
            ret = self.runner()
            if 0 == ret:
                self._send_on_event_callback(RecordingEventType.PROCESSING_FINISHED)
            elif -1 == ret:
                self._send_on_event_callback(RecordingEventType.ABORTED)
            else:
                self._send_on_event_callback(RecordingEventType.UNHANDLED_EXCEPTION)
        except ErrorFifoOverflow as e:
            self.logger.error("controller reported FiFo overrun")
            self.logger.error(str(e))
            self._send_on_event_callback(RecordingEventType.FIFO_OVERRUN)

        except ErrorUnknownResponse as e:
            self.logger.error("unknown response from controller")
            self.logger.error(str(e))
            self._send_on_event_callback(RecordingEventType.UNHANDLED_EXCEPTION)

        except Exception as e:
            self.logger.error("unknown controller API error")
            self.logger.error(str(e))
            self._send_on_event_callback(RecordingEventType.UNHANDLED_EXCEPTION)

    def _send_on_event_callback(self, event: RecordingEventType):
        if self.on_event_callback:
            self.on_event_callback(event)


class RecordStepSeriesThread:

    def __init__(self, logger: Logger, task: RecordStepSeriesTask) -> None:
        self.logger: Logger = logger
        self.task: RecordStepSeriesTask = task
        self.exception_wrapper: ExceptionTaskWrapper = ExceptionTaskWrapper(target=task)
        self.thread: threading.Thread = threading.Thread(name="recording_series", target=self.exception_wrapper)
        self.thread.daemon = True

    def is_alive(self):
        return self.thread.is_alive()

    def start(self) -> None:
        self.thread.start()

    def join(self) -> None:
        self.logger.info("xxx joining")
        self.thread.join()


class RecordStepSeriesRunner:

    def __init__(self,
                 logger: Logger,
                 printer: PrinterInterface,
                 controller_serial_device: str,
                 on_event_callback: Optional[Callable[[RecordingEventType], None]],
                 controller_record_timelapse_s: float,
                 controller_decode_timeout_s: float,
                 sensor_odr_hz: int,
                 gcode_start_point_mm: Tuple[int, int, int],
                 gcode_axis: List[Literal["x", "y", "z"]],
                 gcode_distance_mm: int,
                 gcode_step_count: int,
                 gcode_sequence_count: int,
                 start_frequency_hz: int,
                 stop_frequency_hz: int,
                 step_frequency_hz: int,
                 start_zeta_em2: int,
                 stop_zeta_em2: int,
                 step_zeta_em2: int,
                 output_file_prefix: str,
                 output_dir: str,
                 do_dry_run: bool,
                 do_abort_flag: threading.Event = threading.Event()):
        self.controller_response_error: bool = False
        self.controller_fifo_overrun_error: bool = False
        self.unhandled_exception: bool = False
        self.logger: Logger = logger
        self.printer: PrinterInterface = printer
        self._controller_serial_device: str = controller_serial_device
        self.on_event_callback: Optional[Callable[[RecordingEventType], None]] = on_event_callback
        self._controller_record_timelapse_s: float = controller_record_timelapse_s
        self._controller_decode_timeout_s: float = controller_decode_timeout_s
        self._sensor_odr_hz: int = sensor_odr_hz
        self._gcode_start_point_mm: Tuple[int, int, int] = gcode_start_point_mm
        self._gcode_axis: List[Literal["x", "y", "z"]] = gcode_axis
        self._gcode_distance_mm: int = gcode_distance_mm
        self._gcode_step_count: int = gcode_step_count
        self._gcode_sequence_count: int = gcode_sequence_count
        self._start_frequency_hz: int = start_frequency_hz
        self._stop_frequency_hz: int = stop_frequency_hz
        self._step_frequency_hz: int = step_frequency_hz
        self._start_zeta_em2: int = start_zeta_em2
        self._stop_zeta_em2: int = stop_zeta_em2
        self._step_zeta_em2: int = step_zeta_em2
        self._output_file_prefix: str = output_file_prefix
        self._output_dir: str = output_dir
        self._do_dry_run: bool = do_dry_run
        self._do_abort_flag: threading.Event = do_abort_flag
        self._thread: Optional[RecordStepSeriesThread] = None
        self._thread_start_timestamp: Optional[float] = None
        self._thread_stop_timestamp: Optional[float] = None

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
    def gcode_step_count(self) -> int:
        return self._gcode_step_count

    @gcode_step_count.setter
    def gcode_step_count(self, gcode_step_count: int):
        self._gcode_step_count = gcode_step_count

    @property
    def gcode_sequence_count(self) -> int:
        return self._gcode_sequence_count

    @gcode_sequence_count.setter
    def gcode_sequence_count(self, gcode_sequence_count: int):
        self._gcode_sequence_count = gcode_sequence_count

    @property
    def start_frequency_hz(self) -> int:
        return self._start_frequency_hz

    @start_frequency_hz.setter
    def start_frequency_hz(self, start_frequency_hz: int):
        self._start_frequency_hz = start_frequency_hz

    @property
    def stop_frequency_hz(self) -> int:
        return self._stop_frequency_hz

    @stop_frequency_hz.setter
    def stop_frequency_hz(self, stop_frequency_hz: int):
        self._stop_frequency_hz = stop_frequency_hz

    @property
    def step_frequency_hz(self) -> int:
        return self._step_frequency_hz

    @step_frequency_hz.setter
    def step_frequency_hz(self, step_frequency_hz: int):
        self._step_frequency_hz = step_frequency_hz

    @property
    def start_zeta_em2(self) -> int:
        return self._start_zeta_em2

    @start_zeta_em2.setter
    def start_zeta_em2(self, start_zeta_em2: int):
        self._start_zeta_em2 = start_zeta_em2

    @property
    def stop_zeta_em2(self) -> int:
        return self._stop_zeta_em2

    @stop_zeta_em2.setter
    def stop_zeta_em2(self, stop_zeta_em2: int):
        self._stop_zeta_em2 = stop_zeta_em2

    @property
    def step_zeta_em2(self) -> int:
        return self._step_zeta_em2

    @step_zeta_em2.setter
    def step_zeta_em2(self, step_zeta_em2: int):
        self._step_zeta_em2 = step_zeta_em2

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
        return True if self._thread is not None and self._thread.is_alive() else False

    def task_execution_had_errors(self) -> bool:
        return self.controller_response_error or self.controller_response_error or self.unhandled_exception

    def _send_on_event_callback(self, event: RecordingEventType):
        if self.on_event_callback:
            self.on_event_callback(event)

    def _send_on_thread_event_callback(self, event: RecordingEventType):
        if event == RecordingEventType.PROCESSING_FINISHED:
            self._thread_stop_timestamp = time.time()

        if self.on_event_callback:
            self.on_event_callback(event)

        # TODO: force an early thread termination not by just exiting run().
        #  Reason: Thread.is_alive() takes up to 30 seconds after run() exited
        #  to report not-alive. This sounds like a bug though.
        if event in [RecordingEventType.PROCESSING_FINISHED,
                     RecordingEventType.FIFO_OVERRUN,
                     RecordingEventType.UNHANDLED_EXCEPTION,
                     RecordingEventType.ABORTED]:
            self.logger.info("recording thread terminated")
            raise SystemExit()

    def stop(self) -> None:
        self._do_abort_flag.set()
        self._send_on_event_callback(RecordingEventType.ABORTING)
        if self._thread:
            try:
                self._thread.join()
            except RuntimeError as _e:
                self.logger.info("no running thread that can be stopped")
            self._thread = None
        self._thread_stop_timestamp = time.time()
        self._send_on_event_callback(RecordingEventType.ABORTED)

    def get_last_run_duration_s(self) -> Optional[float]:
        """
        Returns the last known duration.

        Note: Whenever this method is called, make sure to assert that the thread is not running.

        This is-running check is skipped here on purpose.
        Normally the child thread is the caller itself.
        The call propagated indirectly through the plugin's callback that most likely called this method again.
        In that case the thread is always running.

        :return: the last known duration; None if unknown of thread is still running
        """
        return None if not self._thread_stop_timestamp or not self._thread_start_timestamp else self._thread_stop_timestamp - self._thread_start_timestamp

    def run(self) -> None:
        py3dpaxxel_octo = Py3dpAxxelOcto(self.printer, self.logger)
        self.controller_fifo_overrun_error = False
        self.controller_response_error = False
        self.unhandled_exception = False
        self._do_abort_flag.clear()
        self._thread_stop_timestamp = None

        if not self.printer.is_operational():
            self.logger.warning("received request to start recording but printer is not operational")
            return

        try:
            self.logger.info("start recording ...")
            self._thread = RecordStepSeriesThread(
                logger=self.logger,
                task=RecordStepSeriesTask(
                    logger=self.logger,
                    runner=SamplingStepsSeriesRunner(
                        octoprint_api=py3dpaxxel_octo,
                        controller_serial_device=self.controller_serial_device,
                        controller_record_timelapse_s=self.controller_record_timelapse_s,
                        controller_decode_timeout_s=self.controller_decode_timeout_s,
                        sensor_odr=OutputDataRateFromHz[self.sensor_odr_hz],
                        gcode_start_point_mm=self.gcode_start_point_mm,
                        gcode_axis=self.gcode_axis,
                        gcode_distance_mm=self.gcode_distance_mm,
                        gcode_step_repeat_count=self.gcode_step_count,
                        gcode_sequence_repeat_count=self.gcode_sequence_count,
                        fx_start_hz=self.start_frequency_hz,
                        fx_stop_hz=self.stop_frequency_hz,
                        fx_step_hz=self.step_frequency_hz,
                        zeta_start_em2=self.start_zeta_em2,
                        zeta_stop_em2=self.start_zeta_em2,
                        zeta_step_em2=self.step_zeta_em2,
                        output_file_prefix=self.output_file_prefix,
                        output_dir=self.output_dir,
                        do_dry_run=self.do_dry_run,
                        do_abort_flag=self._do_abort_flag),
                    on_event_callback=self._send_on_thread_event_callback))
            self._send_on_event_callback(RecordingEventType.PROCESSING)
            self._thread_start_timestamp = time.time()
            self._thread.start()

        except Exception as e:
            self.unhandled_exception = True
            self.logger.error("railed to start recording thread")
            self.logger.error(str(e))
            self._send_on_event_callback(RecordingEventType.UNHANDLED_EXCEPTION)
