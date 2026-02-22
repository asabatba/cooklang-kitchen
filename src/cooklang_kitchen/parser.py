"""
Cooklang parser – extracts ingredients, cookware, timers, metadata, and sections
from Cooklang-formatted recipe text.
"""

import re
from fractions import Fraction
from dataclasses import dataclass, field


@dataclass
class Ingredient:
    name: str
    quantity: str = ""
    unit: str = ""
    preparation: str = ""

    def to_dict(self):
        return {
            "name": self.name,
            "quantity": self.quantity,
            "unit": self.unit,
            "preparation": self.preparation,
        }


@dataclass
class Cookware:
    name: str
    quantity: str = ""

    def to_dict(self):
        return {"name": self.name, "quantity": self.quantity}


@dataclass
class Timer:
    name: str
    quantity: str = ""
    unit: str = ""

    def to_dict(self):
        return {"name": self.name, "quantity": self.quantity, "unit": self.unit}


@dataclass
class Step:
    text: str  # rendered text (markup removed)
    raw: str   # original cooklang text
    ingredients: list = field(default_factory=list)
    cookware: list = field(default_factory=list)
    timers: list = field(default_factory=list)
    section: str = ""

    def to_dict(self):
        return {
            "text": self.text,
            "raw": self.raw,
            "ingredients": [i.to_dict() for i in self.ingredients],
            "cookware": [c.to_dict() for c in self.cookware],
            "timers": [t.to_dict() for t in self.timers],
            "section": self.section,
        }


@dataclass
class Recipe:
    metadata: dict = field(default_factory=dict)
    steps: list = field(default_factory=list)
    ingredients: list = field(default_factory=list)
    cookware: list = field(default_factory=list)
    timers: list = field(default_factory=list)

    def to_dict(self):
        return {
            "metadata": self.metadata,
            "steps": [s.to_dict() for s in self.steps],
            "ingredients": [i.to_dict() for i in self.ingredients],
            "cookware": [c.to_dict() for c in self.cookware],
            "timers": [t.to_dict() for t in self.timers],
        }


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Metadata: >> key: value
META_RE = re.compile(r"^>>\s*(.+?):\s*(.+)$")
FRONT_MATTER_KEY_RE = re.compile(r"^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$")
FRONT_MATTER_LIST_ITEM_RE = re.compile(r"^\s*-\s+(.*)$")

# Section headers: == Section Name == or = Section Name
SECTION_RE = re.compile(r"^=+\s*(.*?)\s*=*\s*$")

# Block comments: [- ... -]
BLOCK_COMMENT_RE = re.compile(r"\[-.*?-\]", re.DOTALL)

# Line comments: -- ...
LINE_COMMENT_RE = re.compile(r"--.*$", re.MULTILINE)

# Ingredient: @name{qty%unit}(preparation) or @single_word
INGREDIENT_RE = re.compile(
    r"@([^@#~{}\s]+(?:\s+[^@#~{}\s]+)*?)\{([^}]*)\}"  # @name{...}
    r"(?:\(([^)]*)\))?"                                   # optional (preparation)
    r"|"
    r"@([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)"  # @single_word (relaxed)
)

# Cookware: #name{qty} or #single_word
COOKWARE_RE = re.compile(
    r"#([^@#~{}\s]+(?:\s+[^@#~{}\s]+)*?)\{([^}]*)\}"
    r"(?:\(([^)]*)\))?"
    r"|"
    r"#([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)"
)

# Timer: ~name{qty%unit} or ~{qty%unit}
TIMER_RE = re.compile(
    r"~([^@#~{}\s]*)\{([^}]*)\}"
)


def _parse_qty_unit(raw: str):
    """Parse 'qty%unit' string into (quantity_str, unit_str)."""
    if "%" in raw:
        parts = raw.split("%", 1)
        return parts[0].strip(), parts[1].strip()
    return raw.strip(), ""


def _normalize_meta_scalar(value: str) -> str:
    value = value.strip()
    if (
        len(value) >= 2
        and ((value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")))
    ):
        return value[1:-1].strip()
    return value


def _parse_front_matter_value(key: str, raw_value: str):
    value = _normalize_meta_scalar(raw_value)

    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_normalize_meta_scalar(part) for part in inner.split(",") if part.strip()]

    # Accept simple CSV tags form: tags: vegan, indian, curry
    if key == "tags" and "," in value:
        return [_normalize_meta_scalar(part) for part in value.split(",") if part.strip()]

    return value


def _extract_front_matter(source: str) -> tuple[dict, str]:
    lines = source.splitlines()
    if not lines:
        return {}, source

    start = 0
    while start < len(lines) and not lines[start].strip():
        start += 1

    if start >= len(lines) or lines[start].strip() != "---":
        return {}, source

    metadata = {}
    current_key = None
    current_list = []
    i = start + 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped == "---":
            if current_key is not None:
                metadata[current_key] = current_list
            body = "\n".join(lines[i + 1 :])
            return metadata, body

        kv_match = FRONT_MATTER_KEY_RE.match(line)
        if kv_match:
            if current_key is not None:
                metadata[current_key] = current_list
                current_key = None
                current_list = []

            key = kv_match.group(1).strip().lower()
            raw_value = kv_match.group(2).strip()
            if raw_value == "":
                current_key = key
                current_list = []
            else:
                metadata[key] = _parse_front_matter_value(key, raw_value)
            i += 1
            continue

        list_match = FRONT_MATTER_LIST_ITEM_RE.match(line)
        if list_match and current_key is not None:
            item = _normalize_meta_scalar(list_match.group(1))
            if item:
                current_list.append(item)
            i += 1
            continue

        # If content doesn't look like front matter, treat all as recipe body.
        return {}, source

    # Unclosed front matter block, keep original source untouched.
    return {}, source


def _parse_fraction(s: str) -> float | None:
    """Try to evaluate a quantity string as a number."""
    s = s.strip()
    if not s:
        return None
    try:
        return float(Fraction(s))
    except (ValueError, ZeroDivisionError):
        pass
    # Handle mixed fractions like "1 1/2"
    parts = s.split()
    if len(parts) == 2:
        try:
            return float(Fraction(parts[0])) + float(Fraction(parts[1]))
        except (ValueError, ZeroDivisionError):
            pass
    return None


def _render_line(line: str, step_ingredients, step_cookware, step_timers):
    """
    Replace cooklang markup in a line with readable text,
    collecting ingredients, cookware, timers along the way.
    """

    def replace_ingredient(m):
        if m.group(1) is not None:
            name = m.group(1).strip()
            qty_raw = m.group(2)
            prep = (m.group(3) or "").strip()
        else:
            name = m.group(4).strip()
            qty_raw = ""
            prep = ""

        qty, unit = _parse_qty_unit(qty_raw)
        ing = Ingredient(name=name, quantity=qty, unit=unit, preparation=prep)
        step_ingredients.append(ing)

        # Build display text
        display_parts = []
        if qty:
            display_parts.append(qty)
        if unit:
            display_parts.append(unit)
        display_parts.append(name)
        return " ".join(display_parts)

    def replace_cookware(m):
        if m.group(1) is not None:
            name = m.group(1).strip()
            qty_raw = m.group(2)
        else:
            name = m.group(4).strip()
            qty_raw = ""

        qty, _ = _parse_qty_unit(qty_raw)
        cw = Cookware(name=name, quantity=qty)
        step_cookware.append(cw)
        return name

    def replace_timer(m):
        name = (m.group(1) or "").strip()
        qty_raw = m.group(2)
        qty, unit = _parse_qty_unit(qty_raw)
        t = Timer(name=name, quantity=qty, unit=unit)
        step_timers.append(t)
        display = ""
        if qty:
            display = qty
            if unit:
                display += f" {unit}"
        if name:
            display = f"{name} ({display})" if display else name
        return display

    rendered = INGREDIENT_RE.sub(replace_ingredient, line)
    rendered = COOKWARE_RE.sub(replace_cookware, rendered)
    rendered = TIMER_RE.sub(replace_timer, rendered)
    return rendered


def parse(source: str) -> Recipe:
    """Parse a Cooklang source string into a Recipe object."""
    recipe = Recipe()

    front_matter, source = _extract_front_matter(source)
    recipe.metadata.update(front_matter)

    # Remove block comments
    source = BLOCK_COMMENT_RE.sub("", source)

    current_section = ""

    for line in source.split("\n"):
        # Strip line comments
        line = LINE_COMMENT_RE.sub("", line).strip()

        if not line:
            continue

        # Metadata
        meta_m = META_RE.match(line)
        if meta_m:
            key = meta_m.group(1).strip().lower()
            value = meta_m.group(2).strip()
            recipe.metadata[key] = value
            continue

        # Section header
        sec_m = SECTION_RE.match(line)
        if sec_m:
            current_section = sec_m.group(1).strip()
            continue

        # Regular step line
        step_ingredients = []
        step_cookware = []
        step_timers = []
        rendered = _render_line(line, step_ingredients, step_cookware, step_timers)

        step = Step(
            text=rendered,
            raw=line,
            ingredients=step_ingredients,
            cookware=step_cookware,
            timers=step_timers,
            section=current_section,
        )
        recipe.steps.append(step)
        recipe.ingredients.extend(step_ingredients)
        recipe.cookware.extend(step_cookware)
        recipe.timers.extend(step_timers)

    return recipe


def combine_ingredients(ingredient_lists: list[list[dict]]) -> list[dict]:
    """
    Combine ingredients from multiple recipes.
    Groups by (lowercased name, unit) and sums numeric quantities.
    """
    combined = {}  # (name_lower, unit_lower) -> {name, quantity_num, quantity_str, unit}

    for ingredients in ingredient_lists:
        for ing in ingredients:
            name = ing["name"]
            unit = ing.get("unit", "")
            key = (name.lower(), unit.lower())

            qty_str = ing.get("quantity", "")
            qty_num = _parse_fraction(qty_str)

            if key in combined:
                entry = combined[key]
                if qty_num is not None and entry["quantity_num"] is not None:
                    entry["quantity_num"] += qty_num
                elif qty_num is not None:
                    entry["quantity_num"] = qty_num
                entry["count"] += 1
            else:
                combined[key] = {
                    "name": name,
                    "quantity_num": qty_num,
                    "quantity_str": qty_str,
                    "unit": unit,
                    "count": 1,
                }

    result = []
    for entry in sorted(combined.values(), key=lambda e: e["name"].lower()):
        if entry["quantity_num"] is not None:
            # Format nicely
            num = entry["quantity_num"]
            if num == int(num):
                qty_display = str(int(num))
            else:
                qty_display = f"{num:.2f}".rstrip("0").rstrip(".")
        else:
            qty_display = entry["quantity_str"]
        result.append({
            "name": entry["name"],
            "quantity": qty_display,
            "unit": entry["unit"],
            "count": entry["count"],
        })

    return result
