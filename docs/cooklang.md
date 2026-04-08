
## The .cook recipe specification

Below is the specification for defining a recipe in Cooklang.

### Ingredients

To define an ingredient, use the `@` symbol. If the ingredient's name contains multiple words, indicate the end of the name with `{}`.

To indicate the quantity of an item, place the quantity inside `{}` after the name.

To use a unit of an item, such as weight or volume, add a `%` between the quantity and unit.

Now you can try Cooklang and experiment with a few things in the [Cooklang Playground](https://cooklang.github.io/cooklang-rs/)!

### Steps

Each paragraph in your recipe file is a cooking step. Separate steps with an empty line.

You can add comments up to the end of the line to Cooklang text with `--`.

Or block comments with `[- comment text -]`.

### Metadata

Recipes are more than just steps and ingredients—they also include context, such as preparation times, authorship, and dietary relevance. You can add metadata to your recipe using YAML front matter, add `---` at the beginning of a file and `---` at the end of the front matter block.

### Cookware

You can define any necessary cookware with `#`. Like ingredients, you don't need to use braces if it's a single word.

### Timer

You can define a timer using `~`.

Timers can have a name too:

Applications can use this name in notifications.

To support the creation of shopping lists by apps and the command line tool, Cooklang includes a specification for a configuration file to define how ingredients should be grouped on the final shopping list. You can use `[]` to define a category name. These names are arbitrary, so you can customize them to meet your needs. For example, each category could be an aisle or section of the store, such as `[produce]` and `[deli]`.

Or, you might be going to multiple stores, in which case you might use `[Tesco]` and `[Costco]`.

You can also define synonyms with `|`.

## Conventions

There are things which aren't part of the language specification but rather common conventions used in tools built on top of the language.

### Adding Pictures

You can add images to your recipe by including a supported image file (`.png`,`.jpg`) matching the name of the recipe in the same directory.

You can also add images for specific steps by including a step number before the file extension.

### Canonical metadata

To use your recipes across different apps, follow the conventions on how to name metadata in common cases:

| Key | Purpose | Example value |
| --- | --- | --- |
| `source`, `source.name` | Where the recipe came from. Usually a URL, can also be text (eg. a book title). | `https://example.org/recipe`, `The Palomar Cookbook <urn:isbn:9781784720995>`, `mums` |
| `author`, `source.author` | The author of the recipe. | `John Doe` |
| `source.url` | The URL of the recipe if nested format is used. | `https://example.org/recipe` |
| `servings`, `serves`, `yield` | Indicates how many people the recipe is for. Used for scaling quantities. Leading number is used for scaling, anything else is ignored but shown as units. | `2`,`15 cups worth` |
| `course`, `category` | Meal category or course. | `dinner` |
| `locale` | The locale of the recipe. Used for spelling/grammar during edits, and for pluralisation of amounts. Uses ISO 639 language code, then optionally an underscore and the ISO 3166 alpha2 "country code" for dialect variants | `es_VE`, `en_GB`, `fr` |
| `time required`, `time` or `duration` | The preparation + cook time of the recipe. Various formats can be parsed, if in doubt use `HhMm` format to avoid plurals and locales. | `45 minutes`, `1 hour 30 minutes`,`1h30m` |
| `prep time`, `time.prep` | Time for preparation steps only. | `2 hour 30 min` |
| `cook time`, `time.cook` | Time for actual cooking steps. | `10 minutes` |
| `difficulty` | Recipe difficulty level. | `easy` |
| `cuisine` | The cuisine of the recipe. | `French` |
| `diet` | Indicates a dietary restriction or guideline for which this recipe or menu item is suitable, e.g. diabetic, halal etc. | `gluten-free`, or array of values |
| `tags` | List of descriptive tags. | `[2022, baking, summer]` |
| `image`, `images`, `picture`, `pictures` | URL to a recipe image. | `https://example.org/recipe_image.jpg` or array of URLs |
| `title` | Title of the recipe. | `Uzbek Manti` |
| `introduction`, `description` | Additional notes about the recipe. | `This recipe is a traditional Uzbek dish that is made with a variety of vegetables and meat.` |

## Pantry Configuration

Cooklang supports a pantry inventory file in TOML format to track ingredients you have on hand. This file helps with meal planning and shopping list generation.

### Format

The pantry file uses TOML sections to organize items by storage location:

### Supported Attributes

Each item can be specified as either:

- A simple quantity string: `"500%g"`
- An object with attributes:
  - `bought`: Date when the item was purchased (e.g., "05.05.2024")
  - `expire`: Expiration date of the item (e.g., "05.06.2025")
  - `quantity`: Amount using Cooklang quantity format (e.g., "1%kg")
  - `low`: Low stock threshold for alerts (e.g., "100%g")

### Example

Applications can use this data to check ingredient availability, track expiration dates, and generate shopping lists based on what's running low.

## Scaling and Servings

Cooklang supports automatic recipe scaling based on servings. This allows users to adjust recipes for different numbers of people.

### Defining Servings

Specify the default serving size in the metadata:

If not specified, recipes default to 1 serving. All ingredient quantities in the recipe are written for this default serving size.

### Scaling Behavior

#### Linear Scaling (Default)

Most ingredients scale linearly with servings:

When scaling from 2 to 4 servings, the milk quantity doubles to 1 cup.

#### Fixed Quantities

Some ingredients shouldn't scale. Use `=` to lock the quantity:

This keeps salt at 1 tsp regardless of serving size.

### What Doesn't Scale

- **Timers**: Cooking times typically remain the same regardless of portion size
- **Cookware**: Pan and pot sizes don't automatically adjust

### Example

When scaled to 8 servings:

- Flour becomes 1000g (doubled)
- Water becomes 600ml (doubled)
- Yeast stays at 1 packet (fixed)
- Rising time remains 1 hour (timers don't scale)

## Advanced

### Notes

To include relevant background, insights, or personal anecdotes that aren't part of the cooking steps, use notes. Start a new line with `>` and add your story.

### Sections

Some recipes are more complex than others and may include components that need to be prepared separately. In such cases, you can use the section syntax, e.g., `==Dough==`. The section name and the `=` symbols after it are optional, and the number of `=` symbols does not matter.

### Short-hand preparations

Many recipes involve repetitive ingredient preparations, such as peeling or chopping. To simplify this, you can define these common preparations directly within the ingredient reference using shorthand syntax:

### Referencing other recipes

You can reference other recipes using the existing `@` ingredient syntax, inferring relative file paths from the ingredient name:

These preparations should be clearly displayed in the ingredient list, allowing you to get everything ready before you start cooking.
