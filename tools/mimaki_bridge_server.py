import ctypes
import json
import signal
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional


DLL_PATH = Path(r"C:\Program Files\Adobe\Adobe Illustrator 2024\Plug-ins\Mimaki FineCut\USBFunction.dll")
HOST = "127.0.0.1"
PORT = 17871
MAX_DEVICE_INDEX = 16
ENUM_RETRIES = 3
KNOWN_DEVICE_NAMES = ["CG-AR DB4BK118"]


@dataclass
class MimakiDevice:
    index: int
    name: str
    path: str
    state_flag: int


class MimakiUsbBridge:
    def __init__(self, dll_path: Path):
        if not dll_path.exists():
            raise FileNotFoundError(f"DLL da Mimaki nao encontrada: {dll_path}")

        self.dll = ctypes.WinDLL(str(dll_path))
        self.last_known_name = KNOWN_DEVICE_NAMES[0]
        self._io_lock = threading.Lock()
        self._configure()

    def _configure(self) -> None:
        self.get_usb_port_name = self.dll.GetUSBPortName
        self.get_usb_port_name.restype = ctypes.c_int
        self.get_usb_port_name.argtypes = [
            ctypes.c_ushort,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_int),
        ]

        self.usb_port_open = self.dll.USBPortOpen
        self.usb_port_open.restype = ctypes.c_int
        self.usb_port_open.argtypes = [ctypes.c_char_p]

        self.usb_port_write = self.dll.USBPortWrite
        self.usb_port_write.restype = ctypes.c_int
        self.usb_port_write.argtypes = [ctypes.c_int, ctypes.c_char_p]

        self.usb_port_close = self.dll.USBPortClose
        self.usb_port_close.restype = ctypes.c_int
        self.usb_port_close.argtypes = []

        self.usb_read_buff = self.dll.USBReadBuff
        self.usb_read_buff.restype = ctypes.c_int
        self.usb_read_buff.argtypes = [ctypes.c_char_p]

        self.usb_read_buff_clear = self.dll.USBReadBuffClear
        self.usb_read_buff_clear.restype = ctypes.c_int
        self.usb_read_buff_clear.argtypes = []

    def list_devices(self) -> list[MimakiDevice]:
        devices: list[MimakiDevice] = []
        seen: set[tuple[str, str]] = set()

        for index in range(1, MAX_DEVICE_INDEX + 1):
            name = ""
            path = ""
            flag_value = 0

            for _ in range(ENUM_RETRIES):
                name_buf = ctypes.create_string_buffer(512)
                path_buf = ctypes.create_string_buffer(512)
                state_flag = ctypes.c_int()

                result = self.get_usb_port_name(
                    index,
                    ctypes.cast(name_buf, ctypes.c_char_p),
                    ctypes.cast(path_buf, ctypes.c_char_p),
                    ctypes.byref(state_flag),
                )

                if result == 0:
                    continue

                name = self._decode(name_buf)
                path = self._decode(path_buf)
                flag_value = int(state_flag.value)

                if path:
                    break

            if not path:
                continue

            if not name:
                name = self.last_known_name or KNOWN_DEVICE_NAMES[0]
            else:
                self.last_known_name = name

            key = (name, path)
            if key in seen:
                continue

            seen.add(key)
            devices.append(MimakiDevice(index=index, name=name, path=path, state_flag=flag_value))

        return devices

    def get_primary_device(self) -> Optional[MimakiDevice]:
        devices = self.list_devices()
        return devices[0] if devices else None

    def send_job(self, payload: str) -> dict:
        with self._io_lock:
            device = self.get_primary_device()
            if not device and self.last_known_name:
                device = MimakiDevice(index=0, name=self.last_known_name, path="", state_flag=-1)
            if not device:
                raise RuntimeError("Nenhuma Mimaki detectada pela DLL do FineCut.")

            payload_bytes = payload.encode("utf-8")
            attempts: list[dict] = []

            for attempt in range(1, 4):
                preclose_result = self.usb_port_close()
                open_result = self.usb_port_open(device.name.encode("ascii", "ignore"))

                if open_result == 0:
                    clear_result = self.usb_read_buff_clear()
                    write_result = self.usb_port_write(len(payload_bytes), payload_bytes)
                    read_buf = ctypes.create_string_buffer(512)
                    read_result = self.usb_read_buff(ctypes.cast(read_buf, ctypes.c_char_p))
                    read_text = self._decode(read_buf)
                else:
                    clear_result = None
                    write_result = None
                    read_result = None
                    read_text = ""

                close_result = self.usb_port_close()

                attempt_result = {
                    "attempt": attempt,
                    "preCloseResult": int(preclose_result),
                    "openResult": int(open_result),
                    "clearResult": None if clear_result is None else int(clear_result),
                    "writeResult": None if write_result is None else int(write_result),
                    "readResult": None if read_result is None else int(read_result),
                    "readText": read_text,
                    "closeResult": int(close_result),
                }
                attempts.append(attempt_result)

                if open_result == 0 and write_result == 0:
                    return {
                        "deviceName": device.name,
                        "devicePath": device.path,
                        "bytesSent": len(payload_bytes),
                        "openResult": int(open_result),
                        "writeResult": int(write_result),
                        "readResult": int(read_result),
                        "readText": read_text,
                        "closeResult": int(close_result),
                        "attempts": attempts,
                    }

                time.sleep(0.25)

            raise RuntimeError(f"USBPortWrite falhou apos tentativas: {attempts}")

    @staticmethod
    def _decode(buffer: ctypes.Array) -> str:
        raw = bytes(buffer).split(b"\x00", 1)[0]
        return raw.decode("utf-8", "ignore").strip()


BRIDGE = MimakiUsbBridge(DLL_PATH)


class Handler(BaseHTTPRequestHandler):
    server_version = "MimakiBridge/0.1"

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split('?')[0].rstrip('/')
        if not clean_path: clean_path = "/"
        
        print(f"GET request received: {self.path} (clean: {clean_path})")
        
        if clean_path == "/health":
            device = BRIDGE.get_primary_device()
            self._json(
                200,
                {
                    "ok": True,
                    "connected": device is not None,
                    "device": None
                    if device is None
                    else {
                        "index": device.index,
                        "name": device.name,
                        "path": device.path,
                        "stateFlag": device.state_flag,
                    },
                },
            )
            return

        if clean_path == "/devices":
            devices = [
                {
                    "index": device.index,
                    "name": device.name,
                    "path": device.path,
                    "stateFlag": device.state_flag,
                }
                for device in BRIDGE.list_devices()
            ]
            self._json(200, {"ok": True, "devices": devices})
            return

        if clean_path == "/library":
            print("Accessing /library route")
            try:
                # Scaneia a pasta public do projeto
                public_dir = Path(__file__).parent.parent / "public"
                print(f"Scanning directory: {public_dir.absolute()}")
                files = []
                
                if not public_dir.exists():
                    print(f"Directory {public_dir} does not exist!")
                    self._json(404, {"ok": False, "error": f"Diretorio public nao encontrado em {public_dir.absolute()}"})
                    return
                
                for p in public_dir.rglob("*"):
                    if p.is_file():
                        # Ignora arquivos de sistema ou ocultos
                        if p.name.startswith(".") or "node_modules" in str(p):
                            continue
                            
                        # Calcula o path relativo a pasta public para usar como URL
                        rel_path = p.relative_to(public_dir)
                        files.append({
                            "name": p.name,
                            "path": str(rel_path).replace("\\", "/"),
                            "size": p.stat().st_size,
                            "category": str(rel_path.parent).replace("\\", "/") if rel_path.parent != Path(".") else "Geral"
                        })
                
                print(f"Found {len(files)} files in library")
                self._json(200, {"ok": True, "files": sorted(files, key=lambda x: x["name"])})
            except Exception as e:
                print(f"Error in /library: {e}")
                self._json(500, {"ok": False, "error": str(e)})
            return

        self._json(404, {"ok": False, "error": f"Rota {self.path} nao encontrada."})

    def do_POST(self):
        if self.path != "/send":
            self._json(404, {"ok": False, "error": "Rota nao encontrada."})
            return

        try:
            raw_length = self.headers.get("Content-Length", "0")
            length = int(raw_length)
            body = self.rfile.read(length) if length > 0 else b"{}"
            data = json.loads(body.decode("utf-8"))
        except Exception as exc:
            self._json(400, {"ok": False, "error": f"JSON invalido: {exc}"})
            return

        payload = data.get("payload")
        if not isinstance(payload, str) or not payload.strip():
            self._json(400, {"ok": False, "error": "Campo payload obrigatorio."})
            return

        try:
            result = BRIDGE.send_job(payload)
        except Exception as exc:
            self._json(500, {"ok": False, "error": str(exc)})
            return

        self._json(
            200,
            {
                "ok": True,
                "transport": "windows-bridge",
                "message": f"Job enviado para {result['deviceName']} pelo bridge Windows.",
                **result,
            },
        )

    def log_message(self, format: str, *args):
        sys.stdout.write(format % args)
        sys.stdout.write("\n")

    def _json(self, status: int, payload: dict):
        encoded = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mimaki bridge online em http://{HOST}:{PORT}")
    print("Rotas: GET /health, GET /devices, POST /send")

    def shutdown_handler(*_args):
        server.shutdown()

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
