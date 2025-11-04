import threading
from datetime import datetime

_lock = threading.Lock()

def format_line(source: str, level: str, message: str) -> str:
    timestamp = datetime.now().strftime("%H:%M:%S")
    level_clean = (level or '').upper()
    parts = [timestamp, source]
    if level_clean and level_clean != 'INFO':
        parts.append(level_clean)
    parts.append(message)
    return " · ".join(parts) + "\n"

def write_activity(activity_log_path: str, source: str, level: str, message: str) -> None:
    if not activity_log_path:
        return
    line = format_line(source, level, message)
    with _lock:
        with open(activity_log_path, 'a', encoding='utf-8') as log_file:
            log_file.write(line)
