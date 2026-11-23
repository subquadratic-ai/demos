"""Build the synthetic brand library for the brand-match demo. Deterministic.

  python data/build.py      # writes data/library.json

Fernwell is a fictional healthy-living brand. Every asset is a text description
of a photo, the kind an image-to-text model writes, so the ranking runs on text.
About one in eight assets is deliberately off-brand (alcohol, junk food, crash
diets) so the guidelines have something to rule out.
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
rng = random.Random(7)

PEOPLE = ["a woman in her seventies", "a man in his sixties", "two friends in their twenties", "a young dad and his toddler",
          "a teenage girl", "a couple in their thirties", "a grandmother and her grandson", "a nurse after a night shift",
          "three coworkers", "a man using a wheelchair", "a mother and two kids", "a retired couple"]
DOING = [
    ("biking to the farmers market with a basket of produce", "cycling, market, produce"),
    ("biking home along a river path", "cycling, outdoors"),
    ("picking peaches in an orchard", "fruit, outdoors, harvest"),
    ("browsing stalls at a farmers market", "market, produce, community"),
    ("doing yoga on a wooden dock", "yoga, water, calm"),
    ("chopping kale and carrots at a wooden counter", "cooking, vegetables, home"),
    ("hiking a forest trail", "hiking, trees, outdoors"),
    ("stretching after a morning run", "running, recovery"),
    ("filling reusable water bottles at a spring", "hydration, outdoors"),
    ("packing grain bowls for lunch", "meal prep, whole foods"),
    ("swimming in a clear lake", "swimming, nature"),
    ("planting tomatoes in a raised bed", "gardening, home grown"),
    ("sharing a green smoothie on a balcony", "smoothie, morning"),
    ("walking a dog along the beach", "walking, pets, coast"),
    ("meditating on a blanket in a park", "mindfulness, park"),
    ("carrying a crate of vegetables from a CSA farm", "farm, produce, community"),
    ("cooking lentil soup together", "cooking, comfort, plants"),
    ("paddleboarding at dawn", "water, balance, dawn"),
]
LIGHT = ["in soft early-morning light", "at golden hour", "on an overcast afternoon", "under bright midday sun",
         "in late-summer evening light"]
INDOOR = ("chopping", "packing", "cooking")
LIGHT_IN = ["in a sunlit kitchen", "in warm evening lamplight", "by a bright window"]
OFF_BRAND = [
    "a tray of glazed donuts and iced coffees on an office desk",
    "friends clinking cocktails at a neon rooftop bar",
    "a bodybuilder flexing beside a banner reading 'Shred 20 lbs in 10 days'",
    "a pyramid of energy drink cans at a gaming setup",
    "a double cheeseburger and fries in a car's cup holder",
    "a woman holding a box of 'detox' laxative tea with a measuring tape",
    "a man vaping on a city sidewalk at night",
    "a beer tower at a sports bar during a game",
    "a scale with a sticky note reading 'eat nothing until Friday'",
    "a bowl of candy beside a tablet streaming cartoons",
    "a fast-food drive-through at midnight",
    "a gym selfie with a pre-workout tub labeled 'extreme'",
]


def build():
    lib, seen = [], set()
    while len(lib) < 218:
        who, (what, tags) = rng.choice(PEOPLE), rng.choice(DOING)
        light = rng.choice(LIGHT_IN if what.startswith(INDOOR) else LIGHT)
        text = f"Photo of {who} {what} {light}."
        if text in seen:
            continue
        seen.add(text)
        lib.append({"text": text, "tags": tags, "on_brand": True})
    for i in range(32):
        base = OFF_BRAND[i % len(OFF_BRAND)]
        light = rng.choice(["under fluorescent light", "at night", "in harsh flash", "in a dim room"])
        text = f"Photo of {base} {light}."
        if text in seen:
            text = f"Close-up photo of {base} {light}."
        seen.add(text)
        lib.append({"text": text, "tags": "off-brand", "on_brand": False})
    rng.shuffle(lib)
    for i, a in enumerate(lib, 1):
        a["id"] = f"FW-{i:03d}"
    return lib


GUIDELINES = """Fernwell brand guidelines (fictional)

Who we are: everyday healthy living for every age. Real people, real food, time outside.

Show: whole foods and fresh produce; cooking at home; walking, cycling, swimming, gardening and gentle movement; people of all ages and abilities, together; natural light; greens, wood and water.

Never show: alcohol, tobacco or vaping; fast food, candy or sugary drinks; energy drinks and supplements sold as shortcuts; crash diets, detox products, weight-loss promises or body shaming; extreme or punishing exercise.

Tone: calm, warm, honest. No before-and-after, no countdowns, no guarantees."""

# A second upload that breaks the guidelines, to show the on-brand check.
UPLOAD_OFF = ("Customer upload: photo of a woman in her seventies cycling home from the Saturday market, "
              "a six-pack of beer and a box of donuts in the basket, early morning light.")

UPLOAD = ("Customer upload: photo of a woman in her seventies cycling home from the Saturday farmers market, "
          "a basket of peaches and greens on the front of her bike, early morning light.")

if __name__ == "__main__":
    lib = build()
    json.dump({"brand": "Fernwell", "guidelines": GUIDELINES, "upload": UPLOAD, "upload_off": UPLOAD_OFF,
               "library": lib},
              open(os.path.join(HERE, "library.json"), "w"), indent=1)
    print(len(lib), "assets,", sum(not a["on_brand"] for a in lib), "off-brand")
