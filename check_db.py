import sqlite3

conn = sqlite3.connect(r'C:\Users\MERCEDES\Desktop\DBMinimarket\minimarket.db')
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", tables)

cur.execute("PRAGMA table_info(sales)")
cols = [(r[1], r[2]) for r in cur.fetchall()]
print("Sales columns:", cols)

if 'cuentas_credito' in tables:
    cur.execute("SELECT COUNT(*) FROM cuentas_credito")
    print("Cuentas credito count:", cur.fetchone()[0])
    cur.execute("SELECT * FROM cuentas_credito LIMIT 5")
    rows = cur.fetchall()
    for r in rows:
        print("  Row:", r)
else:
    print("cuentas_credito table DOES NOT EXIST")

cur.execute("SELECT id, is_credit, cuenta_id FROM sales WHERE is_credit = 1 OR is_credit = '1' LIMIT 10")
credit_sales = cur.fetchall()
print("Credit sales:", credit_sales)

conn.close()
