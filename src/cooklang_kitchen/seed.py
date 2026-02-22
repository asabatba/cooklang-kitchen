import sqlite3
import textwrap
from pathlib import Path

SAMPLE_RECIPES = [
    {
        "title": "Spaghetti Aglio e Olio",
        "description": "A classic Roman pasta with garlic and olive oil",
        "category": "Pasta",
        "source": textwrap.dedent("""\
            >> servings: 2
            >> time: 20 minutes
            >> source: Traditional Italian

            Bring a large #pot{} of salted water to boil and cook @spaghetti{200%g} until al dente, about ~{8%minutes}.
            Meanwhile, thinly slice @garlic{4%cloves} and gently fry in @extra virgin olive oil{60%ml} in a #large skillet{} over low heat until golden, about ~{5%minutes}.
            Add @red pepper flakes{1/2%tsp} to the oil and stir for ~{30%seconds}.
            Reserve @pasta water{120%ml} before draining the spaghetti.
            Toss the drained pasta into the skillet with the garlic oil, adding pasta water a splash at a time until silky.
            Finish with @fresh parsley{2%tbsp}(chopped) and serve immediately.
        """),
    },
    {
        "title": "Classic Guacamole",
        "description": "Fresh and vibrant Mexican guacamole",
        "category": "Dips & Sauces",
        "source": textwrap.dedent("""\
            >> servings: 4
            >> time: 10 minutes
            >> source: Mexican Traditional

            Cut @ripe avocados{3} in half, remove the pit, and scoop the flesh into a #molcajete{} or #bowl{}.
            Mash to your preferred consistency with a #fork{}.
            Finely dice @red onion{1/4%cup} and @tomato{1}(seeded and diced), then fold into the avocado.
            Add @fresh lime juice{2%tbsp}, @fresh cilantro{3%tbsp}(chopped), and @salt{1/2%tsp}.
            For heat, mix in @jalapeño{1}(seeded and minced).
            Taste and adjust seasoning. Serve with tortilla chips.
        """),
    },
    {
        "title": "Japanese Miso Soup",
        "description": "Light and umami-rich traditional soup",
        "category": "Soups",
        "source": textwrap.dedent("""\
            >> servings: 4
            >> time: 15 minutes
            >> source: Japanese Home Cooking

            Bring @dashi stock{800%ml} to a gentle simmer in a #saucepan{}.
            Cut @firm tofu{150%g} into small cubes and slice @green onions{2}(thinly).
            Place @white miso paste{3%tbsp} in a #small bowl{} and ladle in some hot dashi, whisking until smooth.
            Pour the dissolved miso back into the pot and stir gently.
            Add the tofu cubes and @dried wakame seaweed{1%tbsp}(rehydrated) and warm through for ~{2%minutes}.
            Ladle into bowls, garnish with the sliced green onions and @sesame seeds{1%tsp}.
        """),
    },
]


def create_db(db_path: str | Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("DROP TABLE IF EXISTS recipes")
    cur.execute(
        """
        CREATE TABLE recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            source TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    for recipe in SAMPLE_RECIPES:
        cur.execute(
            "INSERT INTO recipes (title, description, category, source) VALUES (?, ?, ?, ?)",
            (recipe["title"], recipe["description"], recipe["category"], recipe["source"]),
        )

    conn.commit()
    conn.close()
    print(f"Database created at {db_path} with {len(SAMPLE_RECIPES)} recipes.")