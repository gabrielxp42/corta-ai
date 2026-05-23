import argparse
import ctypes
import json
import subprocess
import sys
from ctypes import wintypes
from pathlib import Path


DLL_PATH = r"C:\Program Files\Adobe\Adobe Illustrator 2024\Plug-ins\Mimaki FineCut\USBFunction.dll"
REAL_DEVICE_NAME = "CG-AR DB4BK118"


GET_PORT_CASES = [
    {
        "name": "get_port_ret_charp_idx",
        "func": "GetUSBPortName",
        "restype": "c_char_p",
        "argtypes": ["c_int"],
        "call_args": [0],
    },
    {
        "name": "get_port_ret_wcharp_idx",
        "func": "GetUSBPortName",
        "restype": "c_wchar_p",
        "argtypes": ["c_int"],
        "call_args": [0],
    },
    {
        "name": "get_port_int_buf_len",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf", "c_int"],
        "call_args": [0, {"buf": 512}, 512],
    },
    {
        "name": "get_port_bool_buf_len",
        "func": "GetUSBPortName",
        "restype": "c_bool",
        "argtypes": ["c_int", "buf", "c_int"],
        "call_args": [0, {"buf": 512}, 512],
    },
    {
        "name": "get_port_int_buf",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf"],
        "call_args": [0, {"buf": 512}],
    },
    {
        "name": "get_port_buf_len_only",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["buf", "c_int"],
        "call_args": [{"buf": 512}, 512],
    },
    {
        "name": "get_port_len_buf_only",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf"],
        "call_args": [512, {"buf": 512}],
    },
    {
        "name": "get_port_buf_only",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["buf"],
        "call_args": [{"buf": 512}],
    },
    {
        "name": "get_port_int_noargs",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": [],
        "call_args": [],
    },
    {
        "name": "get_device_ret_charp_idx",
        "func": "GetDeviceName",
        "restype": "c_char_p",
        "argtypes": ["c_int"],
        "call_args": [0],
    },
    {
        "name": "get_device_ret_charp_idx_1",
        "func": "GetDeviceName",
        "restype": "c_char_p",
        "argtypes": ["c_int"],
        "call_args": [1],
    },
    {
        "name": "get_device_ret_charp_idx_2",
        "func": "GetDeviceName",
        "restype": "c_char_p",
        "argtypes": ["c_int"],
        "call_args": [2],
    },
    {
        "name": "get_device_int_buf_len",
        "func": "GetDeviceName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf", "c_int"],
        "call_args": [0, {"buf": 512}, 512],
    },
    {
        "name": "get_device_buf_len_only",
        "func": "GetDeviceName",
        "restype": "c_int",
        "argtypes": ["buf", "c_int"],
        "call_args": [{"buf": 512}, 512],
    },
    {
        "name": "get_device_len_buf_only",
        "func": "GetDeviceName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf"],
        "call_args": [512, {"buf": 512}],
    },
    {
        "name": "get_device_buf_only",
        "func": "GetDeviceName",
        "restype": "c_int",
        "argtypes": ["buf"],
        "call_args": [{"buf": 512}],
    },
    {
        "name": "get_port_proper_idx_1",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_ushort", "buf", "buf", "out_int"],
        "call_args": [1, {"buf": 512}, {"buf": 512}, {"out_int": True}],
    },
    {
        "name": "get_port_proper_idx_2",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_ushort", "buf", "buf", "out_int"],
        "call_args": [2, {"buf": 512}, {"buf": 512}, {"out_int": True}],
    },
    {
        "name": "get_port_proper_idx_3",
        "func": "GetUSBPortName",
        "restype": "c_int",
        "argtypes": ["c_ushort", "buf", "buf", "out_int"],
        "call_args": [3, {"buf": 512}, {"buf": 512}, {"out_int": True}],
    },
    {
        "name": "get_device_int_buf_len_1",
        "func": "GetDeviceName",
        "restype": "c_int",
        "argtypes": ["c_int", "buf", "c_int"],
        "call_args": [1, {"buf": 512}, 512],
    },
    {
        "name": "usb_check_name_literal",
        "func": "USBPortCheck",
        "restype": "c_int",
        "argtypes": ["c_char_p"],
        "call_args": ["Mimaki USB2.0 Data Port Controller"],
    },
    {
        "name": "usb_check_real_name_with_path",
        "func": "USBPortCheck",
        "restype": "c_int",
        "argtypes": ["c_char_p", "buf"],
        "call_args": [REAL_DEVICE_NAME, {"buf": 512}],
    },
    {
        "name": "usb_open_name_literal",
        "func": "USBPortOpen",
        "restype": "c_void_p",
        "argtypes": ["c_char_p"],
        "call_args": ["Mimaki USB2.0 Data Port Controller"],
    },
    {
        "name": "usb_open_real_name",
        "func": "USBPortOpen",
        "restype": "c_int",
        "argtypes": ["c_char_p"],
        "call_args": [REAL_DEVICE_NAME],
    },
    {
        "name": "usb_open_name_outptr",
        "func": "USBPortOpen",
        "restype": "c_int",
        "argtypes": ["c_char_p", "out_void_p"],
        "call_args": ["Mimaki USB2.0 Data Port Controller", {"out_void_p": True}],
    },
    {
        "name": "usb_open_outptr_name",
        "func": "USBPortOpen",
        "restype": "c_int",
        "argtypes": ["out_void_p", "c_char_p"],
        "call_args": [{"out_void_p": True}, "Mimaki USB2.0 Data Port Controller"],
    },
    {
        "name": "usb_open_name_bogus_outptr",
        "func": "USBPortOpen",
        "restype": "c_int",
        "argtypes": ["c_char_p", "out_void_p"],
        "call_args": ["BOGUS DEVICE NAME", {"out_void_p": True}],
    },
    {
        "name": "usb_open_name_bogus",
        "func": "USBPortOpen",
        "restype": "c_void_p",
        "argtypes": ["c_char_p"],
        "call_args": ["BOGUS DEVICE NAME"],
    },
    {
        "name": "usb_open_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_close_real_name",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_get_port_charp_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_get_port_buf_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_get_device_charp_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_zero_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_zero_close_real_name",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_a_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_a_close_real_name",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_abc_close_literal",
        "func": "__sequence__",
    },
    {
        "name": "usb_open_write_abc_close_real_name",
        "func": "__sequence__",
    },
]


def resolve_type(name: str):
    mapping = {
        "c_int": ctypes.c_int,
        "c_uint": ctypes.c_uint,
        "c_bool": ctypes.c_bool,
        "c_ushort": ctypes.c_ushort,
        "c_void_p": ctypes.c_void_p,
        "c_char_p": ctypes.c_char_p,
        "c_wchar_p": ctypes.c_wchar_p,
        "handle": wintypes.HANDLE,
        "dword": wintypes.DWORD,
    }
    return mapping[name]


def decode_buf(buf: ctypes.Array) -> str:
    raw = bytes(buf)
    if not raw:
        return ""
    if b"\x00" in raw:
        raw = raw.split(b"\x00", 1)[0]
    try:
        return raw.decode("utf-8", "ignore")
    except Exception:
        return raw.hex()


def run_case(case_name: str):
    case = next(c for c in GET_PORT_CASES if c["name"] == case_name)
    dll = ctypes.WinDLL(DLL_PATH)
    if case["func"] == "__sequence__":
        return run_sequence_case(dll, case_name)
    fn = getattr(dll, case["func"])
    fn.restype = resolve_type(case["restype"])
    argtypes = []
    prepared_args = []
    buffers = []
    out_ptrs = []
    out_ints = []
    for spec, value in zip(case["argtypes"], case["call_args"]):
        if spec == "buf":
            size = value["buf"]
            buf = ctypes.create_string_buffer(size)
            buffers.append(buf)
            argtypes.append(ctypes.c_char_p)
            prepared_args.append(ctypes.cast(buf, ctypes.c_char_p))
        elif spec == "out_void_p":
            holder = ctypes.c_void_p()
            out_ptrs.append(holder)
            argtypes.append(ctypes.POINTER(ctypes.c_void_p))
            prepared_args.append(ctypes.byref(holder))
        elif spec == "out_int":
            holder = ctypes.c_int()
            out_ints.append(holder)
            argtypes.append(ctypes.POINTER(ctypes.c_int))
            prepared_args.append(ctypes.byref(holder))
        else:
            argtypes.append(resolve_type(spec))
            prepared_args.append(value.encode("ascii") if isinstance(value, str) else value)
    fn.argtypes = argtypes
    result = fn(*prepared_args)
    payload = {
        "case": case_name,
        "func": case["func"],
        "result_repr": repr(result),
        "result_type": type(result).__name__,
        "buffers": [decode_buf(buf) for buf in buffers],
        "out_ptrs": [repr(holder.value) for holder in out_ptrs],
        "out_ints": [int(holder.value) for holder in out_ints],
    }
    print(json.dumps(payload, ensure_ascii=True))


def run_sequence_case(dll, case_name: str):
    open_fn = dll.USBPortOpen
    open_fn.restype = ctypes.c_void_p
    open_fn.argtypes = [ctypes.c_char_p]

    close_fn = dll.USBPortClose
    close_fn.restype = ctypes.c_int
    close_fn.argtypes = [ctypes.c_void_p]

    target_name = REAL_DEVICE_NAME.encode("ascii") if "real_name" in case_name else b"Mimaki USB2.0 Data Port Controller"
    handle = open_fn(target_name)
    payload = {
        "case": case_name,
        "target_name": target_name.decode("ascii", "ignore"),
        "handle_repr": repr(handle),
    }

    if case_name == "usb_open_get_port_charp_close_literal":
        get_fn = dll.GetUSBPortName
        get_fn.restype = ctypes.c_char_p
        get_fn.argtypes = [ctypes.c_void_p]
        payload["get_port_charp"] = repr(get_fn(handle))
    elif case_name == "usb_open_get_port_buf_close_literal":
        get_fn = dll.GetUSBPortName
        get_fn.restype = ctypes.c_int
        get_fn.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
        buf = ctypes.create_string_buffer(512)
        payload["get_port_result"] = int(get_fn(handle, ctypes.cast(buf, ctypes.c_char_p), 512))
        payload["get_port_buffer"] = decode_buf(buf)
    elif case_name == "usb_open_get_device_charp_close_literal":
        get_fn = dll.GetDeviceName
        get_fn.restype = ctypes.c_char_p
        get_fn.argtypes = [ctypes.c_void_p]
        payload["get_device_charp"] = repr(get_fn(handle))
    elif case_name == "usb_open_write_zero_close_literal" or case_name == "usb_open_write_zero_close_real_name":
        payload_bytes = b""
        length = 0
    elif case_name == "usb_open_write_a_close_literal" or case_name == "usb_open_write_a_close_real_name":
        payload_bytes = b"A"
        length = 1
    elif case_name == "usb_open_write_abc_close_literal" or case_name == "usb_open_write_abc_close_real_name":
        payload_bytes = b"ABC"
        length = 3
    else:
        payload_bytes = None
        length = 0

    if payload_bytes is not None:
        write_fn = dll.USBPortWrite
        write_fn.restype = ctypes.c_int
        write_fn.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
        write_result = write_fn(handle, payload_bytes, length)
        payload["write_len"] = length
        payload["write_result"] = int(write_result)

    close_result = close_fn(handle)
    payload["close_result"] = int(close_result)
    print(json.dumps(payload, ensure_ascii=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--child-case")
    args = parser.parse_args()
    if args.child_case:
        run_case(args.child_case)
        return

    root = Path(__file__).resolve().parent.parent
    out_path = root / "mimaki-usb-probe-results.jsonl"
    out_path.write_text("", encoding="utf-8")
    for case in GET_PORT_CASES:
        cmd = [sys.executable, str(Path(__file__).resolve()), "--child-case", case["name"]]
        try:
            completed = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            record = {
                "case": case["name"],
                "returncode": completed.returncode,
                "stdout": completed.stdout.strip(),
                "stderr": completed.stderr.strip(),
            }
        except subprocess.TimeoutExpired:
            record = {
                "case": case["name"],
                "returncode": None,
                "stdout": "",
                "stderr": "timeout",
            }
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=True) + "\n")
        print(json.dumps(record, ensure_ascii=True))


if __name__ == "__main__":
    main()
