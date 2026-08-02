from cooklang_kitchen.parser import (
    combine_ingredients,
    extract_recipe_fields,
    extract_title_description,
    parse,
)


class TestIngredients:
    def test_braced_ingredient_with_quantity_and_unit(self):
        recipe = parse("Cook @spaghetti{200%g} until done.")
        assert len(recipe.ingredients) == 1
        ing = recipe.ingredients[0]
        assert ing.name == "spaghetti"
        assert ing.quantity == "200"
        assert ing.unit == "g"
        assert ing.preparation == ""

    def test_braced_ingredient_with_preparation(self):
        recipe = parse("Add @fresh parsley{2%tbsp}(chopped).")
        ing = recipe.ingredients[0]
        assert ing.name == "fresh parsley"
        assert ing.quantity == "2"
        assert ing.unit == "tbsp"
        assert ing.preparation == "chopped"

    def test_braced_ingredient_no_unit(self):
        recipe = parse("Cut @ripe avocados{3} in half.")
        ing = recipe.ingredients[0]
        assert ing.name == "ripe avocados"
        assert ing.quantity == "3"
        assert ing.unit == ""

    def test_bare_ingredient_no_braces(self):
        recipe = parse("Add @salt.")
        ing = recipe.ingredients[0]
        assert ing.name == "salt"
        assert ing.quantity == ""
        assert ing.unit == ""

    def test_bare_ingredient_greedily_consumes_trailing_words_until_punctuation(self):
        # The bare-word ingredient pattern's character class includes spaces, so it
        # matches multiple words and stops only at punctuation (or @/#/~/{/}).
        recipe = parse("Add @salt to taste.")
        ing = recipe.ingredients[0]
        assert ing.name == "salt to taste"

    def test_rendered_step_text_strips_markup(self):
        recipe = parse("Cook @spaghetti{200%g} in a #pot{}.")
        assert recipe.steps[0].text == "Cook 200 g spaghetti in a pot."


class TestCookware:
    def test_braced_cookware(self):
        recipe = parse("Fry it in a #large skillet{}.")
        assert len(recipe.cookware) == 1
        assert recipe.cookware[0].name == "large skillet"

    def test_bare_cookware(self):
        recipe = parse("Mash with a #fork.")
        assert recipe.cookware[0].name == "fork"


class TestTimers:
    def test_unnamed_timer(self):
        recipe = parse("Cook for ~{8%minutes}.")
        assert len(recipe.timers) == 1
        timer = recipe.timers[0]
        assert timer.name == ""
        assert timer.quantity == "8"
        assert timer.unit == "minutes"

    def test_named_timer(self):
        recipe = parse("Bake for ~oven{25%minutes}.")
        timer = recipe.timers[0]
        assert timer.name == "oven"
        assert timer.quantity == "25"
        assert timer.unit == "minutes"


class TestMetadataAndFrontMatter:
    def test_inline_metadata_lines(self):
        recipe = parse(">> servings: 2\n>> time: 20 minutes\n\nDo the thing.")
        assert recipe.metadata["servings"] == "2"
        assert recipe.metadata["time"] == "20 minutes"

    def test_yaml_style_front_matter_scalars(self):
        source = "---\ntitle: Test Recipe\nservings: 4\n---\n\nDo the thing."
        recipe = parse(source)
        assert recipe.metadata["title"] == "Test Recipe"
        assert recipe.metadata["servings"] == "4"

    def test_front_matter_bracketed_list(self):
        source = "---\ntags: [vegan, quick]\n---\n\nDo the thing."
        recipe = parse(source)
        assert recipe.metadata["tags"] == ["vegan", "quick"]

    def test_front_matter_csv_tags(self):
        source = "---\ntags: vegan, indian, curry\n---\n\nDo the thing."
        recipe = parse(source)
        assert recipe.metadata["tags"] == ["vegan", "indian", "curry"]

    def test_front_matter_dash_list_items(self):
        source = "---\ntags:\n  - vegan\n  - quick\n---\n\nDo the thing."
        recipe = parse(source)
        assert recipe.metadata["tags"] == ["vegan", "quick"]

    def test_quoted_scalar_value_unquoted(self):
        source = '---\ntitle: "Quoted Title"\n---\n\nDo the thing.'
        recipe = parse(source)
        assert recipe.metadata["title"] == "Quoted Title"

    def test_body_without_front_matter_is_untouched(self):
        # A body that doesn't start with '---' should be parsed as-is, no front matter extracted.
        recipe = parse("Do the @thing{1}.")
        assert recipe.metadata == {}
        assert recipe.ingredients[0].name == "thing"


class TestSectionsAndNotes:
    def test_section_header_applies_to_following_steps(self):
        recipe = parse("= Prep =\nChop the @onion.\n\n= Cook =\nFry it in a #pan.")
        assert recipe.steps[0].section == "Prep"
        assert recipe.steps[1].section == "Cook"

    def test_note_paragraph_detected(self):
        recipe = parse("> This is just a note, no markup.")
        assert len(recipe.notes) == 1
        assert recipe.notes[0].text == "This is just a note, no markup."
        assert recipe.steps == []


class TestComments:
    def test_line_comment_stripped(self):
        recipe = parse("Add @salt{1%tsp} -- season to taste, adjust later\n")
        assert recipe.ingredients[0].name == "salt"
        assert "season to taste" not in recipe.steps[0].text

    def test_block_comment_stripped(self):
        recipe = parse("Add @salt{1%tsp} [- this whole aside is removed -] and mix.")
        assert "this whole aside" not in recipe.steps[0].text
        assert recipe.ingredients[0].name == "salt"


class TestTitleDescriptionExtraction:
    def test_title_and_description_present(self):
        title, description = extract_title_description({"title": "Soup", "description": "Warm and tasty"})
        assert title == "Soup"
        assert description == "Warm and tasty"

    def test_description_falls_back_to_introduction(self):
        title, description = extract_title_description({"title": "Soup", "introduction": "An intro"})
        assert description == "An intro"

    def test_missing_title_and_description_are_none(self):
        title, description = extract_title_description({})
        assert title is None
        assert description is None

    def test_list_valued_title_is_joined(self):
        title, _ = extract_title_description({"title": ["Soup", "Stew"]})
        assert title == "Soup, Stew"

    def test_extract_recipe_fields_from_source(self):
        source = "---\ntitle: Miso Soup\ndescription: Umami rich\n---\n\nDo the thing."
        fields = extract_recipe_fields(source)
        assert fields == {"title": "Miso Soup", "description": "Umami rich"}


class TestCombineIngredients:
    def test_sums_matching_ingredients_across_recipes(self):
        combined = combine_ingredients([
            [{"name": "flour", "quantity": "1", "unit": "cup"}],
            [{"name": "flour", "quantity": "2", "unit": "cup"}],
        ])
        assert len(combined) == 1
        assert combined[0]["name"] == "flour"
        assert combined[0]["quantity"] == "3"
        assert combined[0]["unit"] == "cup"
        assert combined[0]["count"] == 2

    def test_groups_by_name_case_insensitively_and_by_unit(self):
        combined = combine_ingredients([
            [{"name": "Flour", "quantity": "1", "unit": "cup"}],
            [{"name": "flour", "quantity": "1", "unit": "tbsp"}],
        ])
        # Different units -> different groups, even though the name matches case-insensitively.
        assert len(combined) == 2

    def test_non_numeric_quantity_preserved_as_string(self):
        combined = combine_ingredients([[{"name": "salt", "quantity": "to taste", "unit": ""}]])
        assert combined[0]["quantity"] == "to taste"

    def test_mixed_fraction_quantity_parsed(self):
        combined = combine_ingredients([[{"name": "sugar", "quantity": "1 1/2", "unit": "cup"}]])
        assert combined[0]["quantity"] == "1.5"

    def test_whole_number_result_has_no_decimal(self):
        combined = combine_ingredients([
            [{"name": "egg", "quantity": "1", "unit": ""}],
            [{"name": "egg", "quantity": "1", "unit": ""}],
        ])
        assert combined[0]["quantity"] == "2"

    def test_sorted_alphabetically_by_name(self):
        combined = combine_ingredients([[
            {"name": "zucchini", "quantity": "1", "unit": ""},
            {"name": "apple", "quantity": "1", "unit": ""},
        ]])
        assert [c["name"] for c in combined] == ["apple", "zucchini"]
