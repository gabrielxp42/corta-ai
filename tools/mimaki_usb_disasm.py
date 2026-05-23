from pathlib import Path

import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64
from capstone.x86 import X86_OP_IMM, X86_OP_MEM, X86_REG_RIP


DLL_PATH = r"C:\Program Files\Adobe\Adobe Illustrator 2024\Plug-ins\Mimaki FineCut\USBFunction.dll"
TARGETS = {
    "USBPortCheck",
    "USBPortOpen",
    "USBPortClose",
    "USBPortWrite",
    "USBReadBuff",
    "USBReadBuffClear",
    "GetDeviceName",
    "GetUSBPortName",
}
EXTRA_VAS = [
    0x180001080,
    0x180001190,
    0x180001310,
    0x1800016A4,
]


def load_exports(pe: pefile.PE):
    exports = {}
    for symbol in pe.DIRECTORY_ENTRY_EXPORT.symbols:
        if not symbol.name:
            continue
        name = symbol.name.decode("ascii", "ignore")
        exports[name] = pe.OPTIONAL_HEADER.ImageBase + symbol.address
    return exports


def read_fn_bytes(pe: pefile.PE, va: int, size: int = 640):
    rva = va - pe.OPTIONAL_HEADER.ImageBase
    return pe.get_memory_mapped_image()[rva : rva + size]


def main():
    pe = pefile.PE(DLL_PATH)
    exports = load_exports(pe)
    import_by_iat = {}
    for entry in pe.DIRECTORY_ENTRY_IMPORT:
        dll_name = entry.dll.decode("ascii", "ignore")
        for imp in entry.imports:
            if imp.name:
                import_by_iat[imp.address] = f"{dll_name}!{imp.name.decode('ascii', 'ignore')}"
    md = Cs(CS_ARCH_X86, CS_MODE_64)
    md.detail = True

    lines = []
    for name in TARGETS:
        if name not in exports:
            continue
        va = exports[name]
        code = read_fn_bytes(pe, va)
        lines.append(f"## {name} @ {hex(va)}")
        for insn in md.disasm(code, va):
            line = f"{insn.address:#x}: {insn.mnemonic} {insn.op_str}".rstrip()
            if insn.mnemonic == "call" and insn.operands and insn.operands[0].type == X86_OP_IMM:
                target = insn.operands[0].imm
                line += f" ; call->{hex(target)}"
            elif insn.mnemonic == "call" and insn.operands and insn.operands[0].type == X86_OP_MEM:
                op = insn.operands[0].mem
                if op.base == X86_REG_RIP:
                    iat = insn.address + insn.size + op.disp
                    if iat in import_by_iat:
                        line += f" ; {import_by_iat[iat]}"
            lines.append(line)
            if insn.mnemonic == "ret":
                break
        lines.append("")

    for va in EXTRA_VAS:
        code = read_fn_bytes(pe, va, 320)
        lines.append(f"## INTERNAL {hex(va)}")
        for insn in md.disasm(code, va):
            line = f"{insn.address:#x}: {insn.mnemonic} {insn.op_str}".rstrip()
            if insn.mnemonic == "call" and insn.operands and insn.operands[0].type == X86_OP_IMM:
                target = insn.operands[0].imm
                line += f" ; call->{hex(target)}"
            elif insn.mnemonic == "call" and insn.operands and insn.operands[0].type == X86_OP_MEM:
                op = insn.operands[0].mem
                if op.base == X86_REG_RIP:
                    iat = insn.address + insn.size + op.disp
                    if iat in import_by_iat:
                        line += f" ; {import_by_iat[iat]}"
            lines.append(line)
            if insn.mnemonic == "ret":
                break
        lines.append("")

    out_path = Path(__file__).resolve().parent.parent / "mimaki-usb-disasm.txt"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
