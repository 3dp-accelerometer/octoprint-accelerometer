import threading
import time
import traceback
from logging import Logger
from typing import Callable, Optional, Tuple

from py3dpaxxel.data_decomposition.decompose_runner import DataDecomposeRunner
from py3dpaxxel.sampling_tasks.exception_task_wrapper import ExceptionTaskWrapper

from octoprint_accelerometer.event_types import DataProcessingEventType


class DataPostProcessTask(Callable[[], None]):
    """
    Wrapper that handles callbacks on task finished. Meant to be run by :class:`threading.Thread`.
    """

    def __init__(self,
                 logger: Logger,
                 runner: Callable,
                 on_event_callback: Optional[Callable[[DataProcessingEventType.PROCESSING, int, int, int], None]]) -> None:
        self.logger: Logger = logger
        self.runner: Callable[[], Tuple[int, int, int, int]] = runner
        self.on_event_callback: Optional[Callable[[DataProcessingEventType.PROCESSING, int, int, int], None]] = on_event_callback

    def __call__(self) -> None:
        try:
            ret, total, processed, skipped = self.runner()
            if 0 == ret:
                self._send_on_event_callback(DataProcessingEventType.PROCESSING_FINISHED, total, processed, skipped)
            elif -1 == ret:
                self._send_on_event_callback(DataProcessingEventType.ABORTED)
            else:
                self._send_on_event_callback(DataProcessingEventType.UNHANDLED_EXCEPTION)

        except Exception as e:
            self.logger.error("unknown post processing error")
            self.logger.error(str(e))
            traceback.print_exception(e)
            self._send_on_event_callback(DataProcessingEventType.UNHANDLED_EXCEPTION)

    def _send_on_event_callback(self, event: DataProcessingEventType, total: Optional[int] = None, processed: Optional[int] = None, skipped: Optional[int] = None):
        if self.on_event_callback:
            self.on_event_callback(event, total, processed, skipped)


class DataPostProcessBackgroundTask:
    """
    Task wrapper to catch exceptions when a task is run by :class:`threading.Thread` so that exceptions can be exposed to the parent thread.
    """

    def __init__(self, logger: Logger, task: DataPostProcessTask) -> None:
        self.logger: Logger = logger
        self.task: DataPostProcessTask = task
        self.exception_wrapper: ExceptionTaskWrapper = ExceptionTaskWrapper(target=task)
        self.thread: threading.Thread = threading.Thread(name="fft_decomposition", target=self.exception_wrapper)
        self.thread.daemon = True

    def is_alive(self):
        return self.thread.is_alive()

    def start(self) -> None:
        self.thread.start()

    def join(self) -> None:
        self.thread.join()


class DataPostProcessRunner:
    """
    Runner for traversing stream files and post-processing (FFT) if necessary.
    """
    def __init__(self,
                 logger: Logger,
                 on_event_callback: Optional[Callable[[DataProcessingEventType], None]],
                 input_dir: str,
                 input_file_prefix: str,
                 algorithm_d1: str,
                 output_dir: str,
                 output_file_prefix: str,
                 output_overwrite: bool,
                 do_dry_run: bool,
                 do_abort_flag: threading.Event = threading.Event()):
        self.logger: Logger = logger
        self.on_event_callback: Optional[Callable[[DataProcessingEventType], None]] = on_event_callback
        self._input_dir: str = input_dir
        self._input_file_prefix: str = input_file_prefix
        self._algorithm_d1: str = algorithm_d1
        self._output_dir: str = output_dir
        self._output_file_prefix: str = output_file_prefix
        self._output_overwrite: bool = output_overwrite
        self._do_dry_run: bool = do_dry_run
        self._do_abort_flag: threading.Event = do_abort_flag
        self._background_task: Optional[DataPostProcessBackgroundTask] = None
        self._background_task_start_timestamp: Optional[float] = None
        self._background_task_stop_timestamp: Optional[float] = None
        self._files_total: Optional[int] = None
        self._files_processed: Optional[int] = None
        self._files_skipped: Optional[int] = None

    @property
    def algorithm_d1(self) -> str:
        return self._algorithm_d1

    @algorithm_d1.setter
    def algorithm_d1(self, algorithm_d1: str):
        self._algorithm_d1 = algorithm_d1

    @property
    def input_dir(self) -> str:
        return self._input_dir

    @input_dir.setter
    def input_dir(self, input_dir: str):
        self._input_dir = input_dir

    @property
    def input_file_prefix(self) -> str:
        return self._input_file_prefix

    @input_file_prefix.setter
    def input_file_prefix(self, input_file_prefix: str):
        self._input_file_prefix = input_file_prefix

    @property
    def output_dir(self) -> str:
        return self._output_dir

    @output_dir.setter
    def output_dir(self, output_dir: str):
        self._output_dir = output_dir

    @property
    def output_file_prefix(self) -> str:
        return self._output_file_prefix

    @output_file_prefix.setter
    def output_file_prefix(self, output_file_prefix: str):
        self._output_file_prefix = output_file_prefix

    @property
    def output_overwrite(self) -> bool:
        return self._output_overwrite

    @output_overwrite.setter
    def output_overwrite(self, output_overwrite: bool):
        self._output_overwrite = output_overwrite

    @property
    def do_dry_run(self) -> bool:
        return self._do_dry_run

    @do_dry_run.setter
    def do_dry_run(self, do_dry_run: bool):
        self._do_dry_run = do_dry_run

    def is_running(self) -> bool:
        return True if self._background_task is not None and self._background_task.is_alive() else False

    def _send_on_event_callback(self, event: DataProcessingEventType):
        if self.on_event_callback:
            self.on_event_callback(event)

    def _send_on_thread_event_callback(self,
                                       event: DataProcessingEventType,
                                       total: Optional[int] = None,
                                       processed: Optional[int] = None,
                                       skipped: Optional[int] = None):

        self._files_total = total
        self._files_processed = processed
        self._files_skipped = skipped

        if event == DataProcessingEventType.PROCESSING_FINISHED:
            self._thread_stop_timestamp = time.time()

        if self.on_event_callback:
            self.on_event_callback(event)

        # TODO: force an early thread termination not by just terminating run().
        #  Reason: Thread.is_alive() takes up to 30 seconds after run() terminated
        #  to report not-alive. This works but sounds like a bug though.
        if event in [DataProcessingEventType.PROCESSING_FINISHED,
                     DataProcessingEventType.UNHANDLED_EXCEPTION,
                     DataProcessingEventType.ABORTED]:
            self.logger.info("data post processing thread terminated")
            raise SystemExit()

    def stop(self) -> None:
        self._do_abort_flag.set()
        self._send_on_event_callback(DataProcessingEventType.ABORTING)
        if self._background_task:
            try:
                self._background_task.join()
            except RuntimeError as _e:
                self.logger.info("no running thread that can be stopped")
            self._background_task = None
        self._background_task_stop_timestamp = time.time()
        self._send_on_event_callback(DataProcessingEventType.ABORTED)

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
        return None if not self._thread_stop_timestamp or not self._background_task_start_timestamp else self._thread_stop_timestamp - self._background_task_start_timestamp

    def get_last_processed_count(self) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        return self._files_total, self._files_processed, self._files_skipped

    def run(self) -> None:
        self._do_abort_flag.clear()
        self._background_task_stop_timestamp = None
        self._files_total = None
        self._files_processed = None
        self._files_skipped = None

        try:
            self.logger.info("start data processing ...")
            self._background_task = DataPostProcessBackgroundTask(
                logger=self.logger,
                task=DataPostProcessTask(
                    logger=self.logger,
                    runner=DataDecomposeRunner(
                        command="algo",
                        input_dir=self.input_dir,
                        input_file_prefix=self.input_file_prefix,
                        algorithm_d1=self.algorithm_d1,
                        output_dir=self.output_dir,
                        output_file_prefix=self.output_file_prefix,
                        output_overwrite=False),
                    on_event_callback=self._send_on_thread_event_callback))

            self._send_on_event_callback(DataProcessingEventType.PROCESSING)
            self._background_task_start_timestamp = time.time()
            self._background_task.start()

        except Exception as e:
            self.logger.error("railed to start data processing thread")
            self.logger.error(str(e))
            self._send_on_event_callback(DataProcessingEventType.UNHANDLED_EXCEPTION)
