from dataclasses import dataclass, field
from typing import Dict, Optional

from py3dpaxxel.storage.file_filter import File
from py3dpaxxel.storage.filename_meta import FilenameMetaStream, FilenameMetaFft


@dataclass
class FftMeta:
    file: Optional[File] = None  # = File()
    meta: Optional[FilenameMetaFft] = None  # = FilenameMetaStream()


@dataclass
class StreamMeta:
    file: Optional[File] = None  # = File()
    meta: Optional[FilenameMetaStream] = None  # = FilenameMetaStream()
    ffts: Dict[str, FftMeta] = field(default_factory=lambda: ({}))


@dataclass
class SequenceMeta:
    streams: Dict[str, StreamMeta] = field(default_factory=lambda: ({}))


@dataclass
class Timestamp:
    year: int = 0
    month: int = 0
    day: int = 0
    hour: int = 0
    minute: int = 0
    second: int = 0
    milli_second: int = 0


@dataclass
class RunMeta:
    started: Optional[Timestamp] = None  # Timestamp()
    stopped: Optional[Timestamp] = None  # Timestamp()
    sequences: Dict[int, SequenceMeta] = field(default_factory=lambda: ({}))


@dataclass
class DataSets:
    runs: Dict[str, RunMeta] = field(default_factory=lambda: ({}))
