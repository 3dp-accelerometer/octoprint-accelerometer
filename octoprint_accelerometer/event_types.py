from enum import IntEnum


class RecordingEventType(IntEnum):
    STARTING = 1
    "processing: sane execution event"
    PROCESSING = 2
    "processing: sane execution event"
    PROCESSING_FINISHED = 3
    "processing: sane execution event"

    FIFO_OVERRUN = 11
    "processing: exceptional event"
    UNHANDLED_EXCEPTION = 12
    "processing: exceptional event"

    ABORTING = 21
    "event upon user request"
    ABORTED = 22
    "event upon user request"


class DataProcessingEventType(IntEnum):
    STARTING = 1
    "data processing: sane execution event"
    PROCESSING = 2
    "data processing: sane execution event"
    PROCESSING_FINISHED = 3
    "data processing: sane execution event"

    NO_DEVICE_FOUND = 11
    "data processing: exceptional event"

    UNHANDLED_EXCEPTION = 12
    "data processing: exceptional event"

    ABORTING = 21
    "event upon user request"
    ABORTED = 22
    "event upon user request"
