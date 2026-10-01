"""Zona horaria y día de negocio del sistema (Venezuela, UTC-4).

El sistema guarda todos los timestamps en **UTC naive** (ver `models.utcnow`),
pero el **día de negocio es el de Venezuela**. Son dos cosas distintas: una
venta hecha a las 9pm se guarda como 1am UTC del día siguiente.

Si el corte del día se calculara en UTC, el "hoy" cambiaría a las 8pm hora de
Venezuela (medianoche UTC = 20:00 local). Por eso todo el cálculo de "hoy" y de
los rangos diarios pasa por aquí.

La zona se fija explícitamente en UTC-4 en vez de usar `astimezone()` a propósito:
así el resultado no depende del reloj de Windows de la PC donde corre. Venezuela
no aplica horario de verano desde 2016, así que el offset es fijo y no hace falta
una base de datos de zonas horarias.

El `zoneinfo` de la biblioteca estándar no se usa: con un offset fijo se evita
depender de la base de datos de zonas horarias del sistema (`tzdata`).
"""

from datetime import datetime, date, timedelta, timezone

# Venezuela: UTC-4, sin horario de verano desde 2016.
VENEZUELA = timezone(timedelta(hours=-4), "America/Caracas")


def ahora_ve() -> datetime:
    """Instante actual en hora de Venezuela, como datetime naive."""
    return datetime.now(VENEZUELA).replace(tzinfo=None)


def hoy_ve() -> date:
    """Fecha del día de negocio en Venezuela (cambia a las 00:00 local)."""
    return ahora_ve().date()


def a_utc_naive(dt: datetime) -> datetime:
    """Convierte un instanteaware (o naive ya en Venezuela) a UTC naive."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=VENEZUELA)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def de_utc_naive(dt: datetime) -> datetime:
    """Convierte un timestamp UTC naive (como se guarda en la BD) a hora Venezuela."""
    return dt.replace(tzinfo=timezone.utc).astimezone(VENEZUELA).replace(tzinfo=None)


def rango_dia_ve(dia: date) -> tuple[datetime, datetime]:
    """Intervalo [inicio, fin) del día local `dia`, expresado en UTC naive.

    Es el inverso de la conversión de almacenamiento: sirve para filtrar
    `Sale.created_at >= inicio AND Sale.created_at < fin`.
    """
    inicio_local = datetime.combine(dia, datetime.min.time())
    fin_local = inicio_local + timedelta(days=1)
    return a_utc_naive(inicio_local), a_utc_naive(fin_local)


def dia_de_utc_naive(dt: datetime) -> date:
    """Día de Venezuela al que pertenece un timestamp UTC naive."""
    return de_utc_naive(dt).date()
