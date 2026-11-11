import csv
import io
import textwrap

from fastapi.responses import Response

def safe_cell(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value

def csv_content(rows):
    target = io.StringIO()
    writer = csv.writer(target)
    writer.writerows([[safe_cell(value) for value in row] for row in rows])
    return target.getvalue().encode("utf-8-sig")

def excel_content(rows):
    from openpyxl import Workbook
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("VERDICTRA")
    for row in rows:
        sheet.append([safe_cell(value) for value in row])
    target = io.BytesIO()
    workbook.save(target)
    return target.getvalue()

def pdf_content(title, rows):
    lines = [title, ""]
    for row in rows:
        lines.extend(textwrap.wrap(" | ".join(str(value if value is not None else "") for value in row), 94) or [""])
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    pages = []
    for offset in range(0, len(lines), 50):
        page_id = len(objects) + 1
        pages.append(f"{page_id} 0 R")
        operators = [b"BT /F1 10 Tf 45 794 Td 14 TL"]
        for line in lines[offset:offset+50]:
            line = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("\n", " ").replace("\r", " ")
            operators.append(f"({line}) Tj T*".encode("cp1252", errors="replace"))
        stream = b"\n".join([*operators, b"ET"])
        objects.extend([
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_id+1} 0 R >>".encode(),
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
        ])
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(pages)}] /Count {len(pages)} >>'.encode()
    target = io.BytesIO()
    target.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(target.tell())
        target.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = target.tell()
    target.write(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        target.write(f"{offset:010} 00000 n \n".encode())
    target.write(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return target.getvalue()

def export(name, title, rows, format):
    if format == "xlsx":
        content, media = excel_content(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif format == "pdf":
        content, media = pdf_content(title, rows), "application/pdf"
    else:
        content, media = csv_content(rows), "text/csv"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}.{format}"'})
