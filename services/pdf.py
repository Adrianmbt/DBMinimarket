"""Generación de PDF: compras y cierre diario (reporte Z)."""
from io import BytesIO
from collections import OrderedDict

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

VERDE = colors.HexColor("#2D5A1E")
CAFE = colors.HexColor("#2C1810")
GRIS = colors.HexColor("#6B5344")
FONDO_ALTERNO = colors.HexColor("#F4EFE8")
AMBER = colors.HexColor("#C9952A")
CREMA = colors.HexColor("#FFF8F0")

BS_METHODS = {"Bolívares Efectivo", "Bolívares", "Efectivo", "Pago Móvil", "Transferencia", "Biopago"}


def _fmt(n: float) -> str:
    if n is None:
        return "—"
    return ("%.2f" % n).replace(".", ",")


class _StyleSet:
    def __init__(self):
        base = getSampleStyleSheet()
        self.titulo = ParagraphStyle(
            "Titulo", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=15, textColor=CAFE, spaceAfter=2,
        )
        self.sub = ParagraphStyle(
            "Sub", parent=base["Normal"], fontSize=9, textColor=GRIS, spaceAfter=8,
        )
        self.th = ParagraphStyle(
            "Th", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8.5, textColor=colors.white, leading=11,
        )
        self.td = ParagraphStyle(
            "Td", parent=base["Normal"], fontSize=8.5, textColor=CAFE, leading=11,
        )
        self.total = ParagraphStyle(
            "Total", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=13, textColor=VERDE,
        )


def _fecha(fecha) -> str:
    return fecha.strftime("%d/%m/%Y %H:%M") if fecha else "—"


def _fecha_cierre(fecha) -> str:
    if isinstance(fecha, str):
        return fecha
    return fecha.strftime("%d/%m/%Y") if fecha else "—"


def _cantidad_desc(d) -> str:
    if d.weight_kg is not None:
        kg = float(d.weight_kg)
        return f"{kg:g} kg ({int(round(kg * 1000))} g)"
    if d.boxes is not None:
        return f"{d.boxes} caja(s) &times; {d.units_per_box} und."
    return f"{d.quantity} und."


def _brand_header(story, title):
    """Encabezado con marca Don Beni: nombre y título."""
    story.append(Paragraph("<b>Don Beni</b> — Minimarket", ParagraphStyle(
        'Brand', fontName='Helvetica-Bold', fontSize=10, textColor=CAFE, spaceAfter=2)))
    story.append(HRFlowable(width="100%", thickness=1.5, color=AMBER))
    if title:
        story.append(Paragraph(title, ParagraphStyle(
            'DocTitle', fontName='Helvetica-Bold', fontSize=11, textColor=CAFE, spaceAfter=4)))
    story.append(Spacer(1, 3 * mm))


def _footer(canvas, doc):
    """Pié de página con marca y número de página."""
    canvas.saveState()
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(GRIS)
    canvas.drawString(18 * mm, 12 * mm, "Don Beni Minimarket")
    canvas.drawRightString(letter[0] - 18 * mm, 12 * mm, f"Página {doc.page}")
    canvas.setStrokeColor(AMBER)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 16 * mm, letter[0] - 18 * mm, 16 * mm)
    canvas.restoreState()


def generar_pdf_compra(compra) -> BytesIO:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
    )
    s = _StyleSet()
    story = []

    _brand_header(story, f"Comprobante de Compra N° {compra.id}")

    datos = [
        Paragraph("<b>Fecha:</b> " + _fecha(compra.created_at), s.td),
        Paragraph("<b>Proveedor:</b> " + (compra.supplier or "Sin proveedor"), s.td),
    ]
    story.append(Table([datos], colWidths=[100 * mm, 100 * mm]))
    story.append(Spacer(1, 3 * mm))

    header = ["Producto", "Cantidad", "Costo U.", "Subtotal"]
    rows = [header]
    for d in compra.details:
        nombre = d.product.name if d.product else "Producto"
        if d.weight_kg is not None:
            costo_u = _fmt(d.cost_price) + "/kg"
            subtotal = d.cost_price * d.weight_kg
        else:
            costo_u = _fmt(d.cost_price) + "/u."
            subtotal = d.cost_price * d.quantity
        rows.append([Paragraph(nombre, s.td), Paragraph(_cantidad_desc(d), s.td),
                     Paragraph(costo_u, s.td), Paragraph(_fmt(subtotal), s.td)])

    tbl = Table(rows, colWidths=[60 * mm, 45 * mm, 40 * mm, 40 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D2C8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_ALTERNO]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 4 * mm))

    total = Table(
        [[Paragraph(f"TOTAL &nbsp; ${_fmt(compra.total)}", s.total)]],
        colWidths=[185 * mm],
    )
    total.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, -1), 1.5, VERDE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(total)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    return buf


def generar_pdf_factura(venta, taux=None) -> BytesIO:
    """Factura por venta con desglose de IVA 16% e IGTF 3%.

    Se emite en la moneda del método de pago: bolívares para métodos en Bs,
    dólares si el pago fue en moneda extranjera.
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
    )
    s = _StyleSet()
    story = []

    _brand_header(story, f"Factura N° {venta.id}")

    metodo = venta.payment_method or "Efectivo"
    emite_bs = metodo in BS_METHODS
    rate = venta.rate_usd or taux or 1.0
    sym = "Bs." if emite_bs else "$"
    conv = (lambda n: round(n * rate, 2)) if emite_bs else (lambda n: round(n, 2))

    igtf_rate = 0.03 if metodo in {"Dólares Efectivo"} else 0.0
    iva_rate = 0.16
    total = conv(venta.total or 0.0)
    base = conv(venta.base_amount or 0.0)
    iva = conv(venta.iva_amount or 0.0)
    igtf = conv(venta.igtf_amount or 0.0)

    moneda = "BOLÍVARES (VES)" if emite_bs else "DÓLARES (USD)"
    datos = [
        Paragraph("<b>Fecha:</b> " + _fecha(venta.created_at), s.td),
        Paragraph("<b>Moneda:</b> " + moneda, s.td),
        Paragraph("<b>Cliente:</b> " + (venta.client_name or "Consumidor final"), s.td),
        Paragraph("<b>Referencia:</b> " + (venta.reference or "—"), s.td),
    ]
    if emite_bs:
        datos = [
            Paragraph("<b>Fecha:</b> " + _fecha(venta.created_at), s.td),
            Paragraph("<b>Moneda:</b> " + moneda, s.td),
            Paragraph("<b>Método:</b> " + metodo, s.td),
            Paragraph(f"<b>Tasa BCV:</b> Bs. {_fmt(rate)} por $1", s.td),
            Paragraph("<b>Cliente:</b> " + (venta.client_name or "Consumidor final"), s.td),
            Paragraph("<b>Referencia:</b> " + (venta.reference or "—"), s.td),
        ]
        story.append(Table([datos[0:3], datos[3:6]], colWidths=[100 * mm, 100 * mm]))
    else:
        story.append(Table([datos[:2], datos[2:]], colWidths=[100 * mm, 100 * mm]))
    story.append(Spacer(1, 3 * mm))

    header = ["Producto", "Cantidad", "Precio U.", "Subtotal"]
    rows = [header]
    for d in venta.details:
        nombre = d.product.name if d.product else "Producto"
        es_peso = (d.product.sale_unit if d.product else "unidad") == "peso"
        if es_peso:
            cantidad = f"{d.quantity / 1000.0:g} kg"
            precio_u = sym + " " + _fmt(conv(d.price_at_sale)) + "/kg"
            subtotal = conv(d.price_at_sale * (d.quantity / 1000.0))
        else:
            cantidad = f"{d.quantity} und."
            precio_u = sym + " " + _fmt(conv(d.price_at_sale))
            subtotal = conv(d.price_at_sale * d.quantity)
        rows.append([Paragraph(nombre, s.td), Paragraph(cantidad, s.td),
                     Paragraph(precio_u, s.td), Paragraph(sym + " " + _fmt(subtotal), s.td)])

    tbl = Table(rows, colWidths=[57 * mm, 32 * mm, 52 * mm, 44 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D2C8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_ALTERNO]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 4 * mm))

    # Desglose de impuestos
    desglose_rows = [
        ["Base imponible (sin impuestos)", sym + " " + _fmt(base)],
        [f"IVA {int(iva_rate * 100)}% incluido", sym + " " + _fmt(iva)],
    ]
    if igtf > 0:
        desglose_rows.append([f"IGTF {int(igtf_rate * 100)}% incluido (moneda extranjera)", sym + " " + _fmt(igtf)])
    desglose = Table(
        [[Paragraph(desc, s.td), Paragraph(monto, s.td)] for desc, monto in desglose_rows],
        colWidths=[138 * mm, 47 * mm],
    )
    desglose.setStyle(TableStyle([
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#D9D2C8")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(desglose)
    story.append(Spacer(1, 2 * mm))

    total_tbl = Table(
        [[Paragraph(f"TOTAL A PAGAR &nbsp; {sym} {_fmt(total)}", s.total)]],
        colWidths=[185 * mm],
    )
    total_tbl.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, -1), 1.5, VERDE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(total_tbl)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    return buf


def generar_pdf_cierre(ventas, fecha, taux=None) -> BytesIO:
    """Reporte Z de cierre diario de caja."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
    )
    s = _StyleSet()

    grupos = OrderedDict()
    total_usd = 0.0
    total_bs = 0.0
    for v in ventas:
        method = v.payment_method or "Sin método"
        grp = grupos.setdefault(method, {"n": 0, "usd": 0.0, "bs": 0.0})
        grp["n"] += 1
        grp["usd"] += v.total or 0.0
        total_usd += v.total or 0.0
        rate = v.rate_usd or taux or 1.0
        if method in BS_METHODS:
            bs = (v.total or 0.0) * rate
            grp["bs"] += bs
            total_bs += bs

    story = []

    _brand_header(story, f"Reporte Z — Cierre del {_fecha_cierre(fecha)}")

    resumen = Table(
        [
            [Paragraph("TOTAL VENDIDO (USD)", s.th), Paragraph("TOTAL EN BOLÍVARES", s.th)],
            [Paragraph("$ " + _fmt(total_usd), s.total), Paragraph("Bs. " + _fmt(total_bs), s.total)],
        ],
        colWidths=[92.5 * mm, 92.5 * mm],
    )
    resumen.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D2C8")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(resumen)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Desglose por método de pago", s.sub))
    hdr = ["Método de pago", "N°", "Total (USD)", "Total (Bs)"]
    filas = [hdr]
    for metodo, g in grupos.items():
        filas.append([
            Paragraph(metodo, s.td), Paragraph(str(g["n"]), s.td),
            Paragraph("$ " + _fmt(g["usd"]), s.td), Paragraph("Bs. " + _fmt(g["bs"]), s.td),
        ])
    tbl = Table(filas, colWidths=[70 * mm, 25 * mm, 45 * mm, 45 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CAFE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D9D2C8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_ALTERNO]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Detalle de ventas del día", s.sub))
    hdr2 = ["#", "Hora", "Método", "Total (USD)", "Total (Bs)"]
    filas2 = [hdr2]
    for v in ventas:
        hora = v.created_at.strftime("%H:%M") if v.created_at else "—"
        bs = (v.total or 0.0) * (v.rate_usd or taux or 1.0) if (v.payment_method or "") in BS_METHODS else 0.0
        filas2.append([
            Paragraph(str(v.id), s.td), Paragraph(hora, s.td),
            Paragraph(v.payment_method or "—", s.td),
            Paragraph("$ " + _fmt(v.total), s.td), Paragraph("Bs. " + _fmt(bs), s.td),
        ])
    tbl2 = Table(filas2, colWidths=[15 * mm, 30 * mm, 55 * mm, 45 * mm, 40 * mm], repeatRows=1)
    tbl2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CAFE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E1DBD0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_ALTERNO]),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(tbl2)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    return buf