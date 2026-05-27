import os
import re
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel as PydanticModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.ticket import Ticket
from app.models.item_category_rule import ItemCategoryRule
from app.schemas.ticket import TicketRead
from app.auth.setup import current_active_user
from app.models.user import User

UPLOAD_DIR = os.environ.get("CAULKY_UPLOADS_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/tickets", tags=["tickets"])

# ── Categories + keywords ──────────────────────────────────────────────────────

CATEGORIES: dict[str, list[str]] = {
    "Aceites especias y salsas": [
        "aceite", "oliva", "girasol", "vinagre", "sal ", "pimienta", "oregano",
        "pimenton", "mayonesa", "ketchup", "mostaza", "salsa", "especias", "tomillo",
        "laurel", "canela", "comino", "curry", "nuez moscada", "alioli", "sriracha",
    ],
    "Agua y refrescos": [
        "agua ", "aquarius", "coca-cola", "cocacola", "pepsi", "fanta", "sprite",
        "refresco", "tonica", "bitter", "seven up", "nestea", "isotonica", "powerade",
        "gatorade", "monster", "red bull", "casera",
    ],
    "Aperitivos": [
        "patatas fritas", "chips", "nachos", "palomitas", "pistachos", "cacahuetes",
        "almendras", "gusanitos", "doritos", "ruffles", "pringles", "aperitivo",
        "snack", "frutos secos", "nueces", "pipas", "anacardos", "mix frutos",
    ],
    "Arroz legumbres y pasta": [
        "arroz", "pasta", "macarron", "espaguet", "fideo", "lenteja", "garbanzo",
        "judia", "haba", "alubia", "soja", "quinoa", "cous cous", "bulgur",
        "tagliatelle", "penne", "lasaña seca", "canelones secos",
    ],
    "Azúcar caramelos y chocolate": [
        "azucar", "chocolate", "caramelo", "golosina", "chuche", "gominola",
        "regaliz", "turron", "mazapan", "bombon", "tableta choco", "praline",
        "nougat", "kinder", "ferrero", "kit kat", "snickers", "twix", "toblerone",
    ],
    "Bebé": [
        "pañal", "potito", "leche infantil", "cereales bebe", "toallitas bebe",
        "crema bebe", "suero fisiologico", "chupete", "biberón", "papilla",
    ],
    "Bodega": [
        "vino", "cerveza", "cava", "champan", "sidra", "ron ", "whisky", "vodka",
        "gin ", "licor", "tequila", "brandy", "vermut", "jerez", "oporto", "rioja",
        "rueda", "ribera", "albariño", "ribeiro", "mahou", "estrella", "cruzcampo",
        "heineken", "coronita", "amstel", "san miguel", "alhambra",
    ],
    "Cacao café e infusiones": [
        "cafe ", "café", "descafeinado", "nescafe", "cola cao", "colacao",
        "nesquik", "cacao", "te ", "manzanilla", "poleo", "infusion", "tila",
        "rooibos", "capuchino", "espresso", "lungo", "dolce gusto", "senseo",
    ],
    "Carne": [
        "pollo", "cerdo", "ternera", "cordero", "pavo fresco", "carne", "filete",
        "pechuga", "muslo", "costilla", "chuleta", "hamburguesa", "jamon fresco",
        "lomo fresco", "falda", "morcillo", "carrillada", "codillo", "secreto",
        "entrecot", "solomillo", "redondo", "alita", "contramuslo",
    ],
    "Cereales y galletas": [
        "cereal", "corn flake", "muesli", "galleta", "maria ", "digestive",
        "palito", "cracker", "copos avena", "granola", "kellogg", "nestle cereales",
        "cookie", "oreo", "chips ahoy", "barquillo",
    ],
    "Charcutería y quesos": [
        "jamon serrano", "jamon cocido", "salchichon", "chorizo", "fuet",
        "mortadela", "queso", "pavo cocido", "pate", "sobrasada", "fiambre",
        "lonchas", "cecina", "morcilla", "butifarra", "salami", "pepperoni",
        "york ", "pechuga pavo",
    ],
    "Congelados": [
        "congelad", "helado", "pizza congelada", "verduras cong", "guisantes cong",
        "croqueta congelada", "canelones congelados", "lasaña congelada",
        "patatas congeladas", "gambas congeladas", "merluza congelada",
    ],
    "Conservas caldos y cremas": [
        "atun ", "sardina", "mejillon lata", "lata ", "conserva", "caldo",
        "sopa sobre", "crema bote", "tomate frito", "tomate triturado", "pisto",
        "escabeche", "berberecho", "navajuela", "pulpo lata", "bonito lata",
        "fabada lata", "cocido lata", "lentejas lata",
    ],
    "Cuidado del cabello": [
        "champu", "acondicionador", "tinte pelo", "gel capilar", "laca",
        "mascarilla pelo", "serum capilar", "suavizante pelo",
    ],
    "Cuidado facial y corporal": [
        "jabon ", "gel de ducha", "gel ducha", "crema hidra", "desodorante",
        "antitranspirante", "locion", "aftershave", "colonia", "perfume",
        "protector solar", "pasta dientes", "cepillo dientes", "hilo dental",
        "enjuague", "espuma afeitar", "maquinilla", "tonico facial",
    ],
    "Fitoterapia y parafarmacia": [
        "vitamina", "suplemento", "melatonina", "magnesio", "omega", "probiotico",
        "collageno", "zinc ", "hierro suple", "echinacea", "propolis",
    ],
    "Fruta y verdura": [
        "manzana", "pera ", "platano", "naranja", "limon", "fresa", "uva ",
        "melocoton", "albaricoque", "sandia", "melon", "kiwi", "mango",
        "tomate", "patata", "zanahoria", "cebolla", "ajo ", "lechuga",
        "espinaca", "brocoli", "coliflor", "pimiento", "calabacin", "berenjena",
        "pepino", "apio", "puerro", "aguacate", "ciruela", "cereza",
        "mandarina", "pomelo", "higo", "frambuesa", "arandano", "verdura",
        "fruta ", "ensalada", "rucula", "canons", "escarola",
    ],
    "Huevos leche y mantequilla": [
        "huevo", "leche ", "mantequilla", "margarina", "nata ", "crema leche",
        "leche evaporada", "leche condensada", "leche sin lactosa",
    ],
    "Limpieza y hogar": [
        "detergente", "suavizante", "limpiahogar", "friegasuelos", "limpiacristales",
        "lejia", "amoniaco", "bayeta", "fregona", "papel higienico", "papel cocina",
        "bolsa basura", "esponja", "quitamanchas", "limpiador", "wc", "inodoro",
        "baño limpia", "cocina limpia", "multiusos", "domestos", "fairy", "mistol",
        "ariel", "persil", "skip ", "dixan", "colon ", "norit",
    ],
    "Maquillaje": [
        "maquillaje", "base maquillaje", "colorete", "sombra ojos", "labial",
        "pintaunas", "rimmel", "mascara ojos", "corrector", "contorno",
    ],
    "Marisco y pescado": [
        "salmon", "merluza", "bacalao", "atun fresco", "dorada", "lubina",
        "gamba", "langostino", "sepia", "calamar", "almeja", "mejillon fresco",
        "pescado", "rape", "boquerones", "anchoas frescas", "trucha", "rodaballo",
        "lenguado", "pulpo fresco", "navaja", "chirla", "berberecho fresco",
    ],
    "Mascotas": [
        "pienso", "comida gato", "comida perro", "arena gato", "purina",
        "whiskas", "royal canin", "felix gato", "pedigree", "friskies",
        "snack mascota", "antiparasitario",
    ],
    "Panadería y pastelería": [
        "pan ", "barra pan", "hogaza", "baguette", "cruasan", "croissant",
        "brioche", "magdalena", "bizcocho", "tarta", "pastel", "bollo",
        "rosquilla", "donuts", "pan molde", "tostada", "pan integral",
        "pan artesano", "chapata", "ciabatta", "tortitas", "crepe",
    ],
    "Pizzas y platos preparados": [
        "pizza", "lasaña prep", "canelones prep", "empanada", "croqueta",
        "nugget", "plato preparado", "precocinado", "cocido prep",
        "paella preparada", "arroz prep", "wok prep", "wrap", "burrito",
        "fajita", "taco prep",
    ],
    "Postres y yogures": [
        "yogur", "yogurt", "postre", "natillas", "mousse", "flan",
        "gelatina", "arroz con leche", "cuajada", "petit suisse",
        "danonino", "activia",
    ],
    "Zumos": [
        "zumo", "nectar", "jugo ", "don simon", "tropicana", "granini",
        "zumosol", "minute maid", "rich ",
    ],
}

SKIP_WORDS = {
    "total", "subtotal", "iva", "ticket", "importe", "efectivo", "tarjeta",
    "cambio", "euros", "fecha", "hora", "cajero", "tienda", "gracias",
    "unidades", "descuento", "ahorro", "puntos", "oferta", "precio",
    "operacion", "n.operacion", "cif", "nif", "direccion", "telefono",
    "web", "bienvenido", "bienvenida", "www", "factura", "albaran",
    "base imp", "cuota", "tipo", "suma", "pagado", "devolucion", "entregado",
}


def _categorize(name: str) -> str:
    name_lower = name.lower()
    for cat, keywords in CATEGORIES.items():
        for kw in keywords:
            if kw in name_lower:
                return cat
    return "Sin categoría"


def _parse_ticket_lines(text: str, custom_rules: dict[str, str] | None = None) -> list[dict]:
    """Extract item lines from raw OCR/PDF text."""
    rules = custom_rules or {}
    items: list[dict] = []
    # Match lines ending with a price like 1,99 or 1.99 or -1,99
    price_re = re.compile(r'^(.+?)\s+(-?\d{1,4}[,.]\d{2})\s*$')
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) < 5:
            continue
        m = price_re.match(line)
        if not m:
            continue
        raw_name = m.group(1).strip()
        raw_price = m.group(2).replace(",", ".")
        # Skip obviously non-item lines
        low = raw_name.lower()
        if any(skip in low for skip in SKIP_WORDS):
            continue
        # Skip lines that start with digits (quantity markers, totals)
        if re.match(r'^\d+\s*x\s*', raw_name, re.IGNORECASE):
            continue
        try:
            price = float(raw_price)
        except ValueError:
            continue
        if price <= 0:
            continue
        category = rules.get(low) or _categorize(raw_name)
        items.append({
            "name": raw_name.title(),
            "amount": round(price, 2),
            "category": category,
        })
    return items


def _extract_store_name(text: str) -> str | None:
    known = [
        "mercadona", "lidl", "aldi", "dia", "carrefour", "eroski",
        "alcampo", "hipercor", "el corte ingles", "consum", "ahorramas",
        "supersol", "coviran", "spar", "plus fresc", "bon preu",
        "condis", "sorli", "simply", "family cash",
    ]
    first_lines = "\n".join(text.splitlines()[:8]).lower()
    for store in known:
        if store in first_lines:
            return store.title()
    return None


def _extract_total(text: str) -> float | None:
    total_re = re.compile(
        r'(?:total|importe total|a pagar|total a pagar)[^\d]*(\d{1,5}[,.]\d{2})',
        re.IGNORECASE,
    )
    m = total_re.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "."))
        except ValueError:
            pass
    return None


def _extract_date(text: str):
    date_re = re.compile(
        r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})'
    )
    m = date_re.search(text)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        if len(y) == 2:
            y = "20" + y
        try:
            from datetime import date
            return date(int(y), int(mo), int(d))
        except ValueError:
            pass
    return None


def _compute_categories(items: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for item in items:
        cat = item["category"]
        totals[cat] = round(totals.get(cat, 0.0) + item["amount"], 2)
    return totals


async def _extract_text(file_path: str, mime_type: str) -> str:
    if mime_type == "application/pdf" or file_path.lower().endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception:
            return ""
    else:
        try:
            import pytesseract
            from PIL import Image
            img = Image.open(file_path)
            return pytesseract.image_to_string(img, lang="spa+eng")
        except Exception:
            return ""


# ── Endpoints ──────────────────────────────────────────────────────────────────

# ── Pydantic schemas for write operations ─────────────────────────────────────

class TicketItemIn(PydanticModel):
    name: str
    amount: float
    category: str


class TicketItemsPatch(PydanticModel):
    items: list[TicketItemIn]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=TicketRead, status_code=201)
async def analyze_ticket(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    content = await file.read()
    ext = os.path.splitext(file.filename or "ticket")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        f.write(content)

    # Load user's custom category rules
    rules_result = await db.execute(
        select(ItemCategoryRule).where(ItemCategoryRule.user_id == user.id)
    )
    custom_rules = {r.item_name: r.category for r in rules_result.scalars().all()}

    text = await _extract_text(dest, file.content_type or "")
    items = _parse_ticket_lines(text, custom_rules)
    categories = _compute_categories(items)

    record = Ticket(
        user_id=user.id,
        original_name=file.filename or filename,
        filename=filename,
        mime_type=file.content_type or "application/octet-stream",
        store_name=_extract_store_name(text),
        ticket_date=_extract_date(text),
        total=_extract_total(text),
        items=json.dumps(items, ensure_ascii=False),
        categories=json.dumps(categories, ensure_ascii=False),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("", response_model=list[TicketRead])
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Ticket)
        .where(Ticket.user_id == user.id)
        .order_by(Ticket.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/{ticket_id}/items", response_model=TicketRead)
async def patch_ticket_items(
    ticket_id: int,
    body: TicketItemsPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = await db.get(Ticket, ticket_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Compare old vs new to detect category changes and save rules
    original_cat = {item["name"].lower(): item["category"] for item in json.loads(t.items)}
    new_items = [i.model_dump() for i in body.items]

    for item in new_items:
        norm = item["name"].lower()
        if original_cat.get(norm) != item["category"]:
            result = await db.execute(
                select(ItemCategoryRule).where(
                    ItemCategoryRule.user_id == user.id,
                    ItemCategoryRule.item_name == norm,
                )
            )
            rule = result.scalar_one_or_none()
            if rule:
                rule.category = item["category"]
            else:
                db.add(ItemCategoryRule(
                    user_id=user.id,
                    item_name=norm,
                    category=item["category"],
                ))

    t.items = json.dumps(new_items, ensure_ascii=False)
    t.categories = json.dumps(_compute_categories(new_items), ensure_ascii=False)
    await db.commit()
    await db.refresh(t)
    return t


@router.get("/{ticket_id}/file")
async def get_ticket_file(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = await db.get(Ticket, ticket_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    path = os.path.join(UPLOAD_DIR, t.filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type=t.mime_type, filename=t.original_name)


@router.delete("/{ticket_id}", status_code=204)
async def delete_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = await db.get(Ticket, ticket_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    path = os.path.join(UPLOAD_DIR, t.filename)
    if os.path.exists(path):
        os.remove(path)
    await db.delete(t)
    await db.commit()
