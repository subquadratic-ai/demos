"""Question schema sent to Snap for each content chunk.

Each question returns a probability 0-1 via Snap's `noul` type. The chunk
can be a 30-60s transcript window from a show, a full YouTube video
transcript + thumbnail, or a chapter of a book.
"""

CONTENT_QUESTIONS = {
    "profanity": {
        "type": "noul",
        "instructions": (
            "Does this content contain ACTUAL SWEAR WORDS that would be bleeped "
            "on broadcast TV for a general audience?"
        ),
        "criteria": {
            "true": (
                "Swear words that would be bleeped: hell, damn, bastard, ass, bitch, "
                "shit, f-word, s-word. Slurs. Strong insults intended to hurt."
            ),
            "false": (
                "NO SWEAR WORDS. Mild emphatic words used in kids content ("
                "silly, stupid, dumb, goofy, lame), bodily-function references "
                "appropriate for kids (poo, fart, butt, bum), playful name-calling "
                "between friends without hostility, and ordinary 'oh no!' or "
                "'what the heck!' expressions are NOT profanity. If the words "
                "would appear in a Disney Jr. show, they are NOT profanity."
            ),
        },
    },
    "violence": {
        "type": "noul",
        "instructions": (
            "Does this content contain REAL violence — serious physical harm that "
            "a parent would find concerning for a young child?"
        ),
        "criteria": {
            "true": (
                "Serious violence: real punches/kicks that injure, use of weapons "
                "(guns, knives, swords) to harm, blood or visible wounds, death "
                "or dying shown on screen, cruelty to any living creature, "
                "torture, graphic physical harm, or combat with intent to injure."
            ),
            "false": (
                "NO SERIOUS VIOLENCE. Playful chasing, tag, pretend games about "
                "being pirates/soldiers/superheroes/dinosaurs, rough-and-tumble "
                "sibling play, slapstick comedy, cartoon chase scenes without "
                "injury, playful threats like 'I'm gonna get you!', characters "
                "bumping into things, pillow fights, pretend wrestling, and any "
                "action where no one is actually hurt are NOT violence. If this "
                "would air in a Bluey episode or Peppa Pig, it is NOT violence."
            ),
        },
    },
    "scary": {
        "type": "noul",
        "instructions": (
            "Does this content contain content designed to FRIGHTEN young children "
            "(not pretend-spooky games or mild peril that resolves happily)?"
        ),
        "criteria": {
            "true": (
                "Real horror elements: gore shown graphically, monsters depicted "
                "to frighten (not for kid play), jump scares, loud sudden "
                "distressing sounds, prolonged dark unsettling atmosphere, "
                "characters in genuine danger of harm or death, torture, body "
                "horror, nightmare imagery."
            ),
            "false": (
                "NOT SCARY in a concerning way. Imaginative pretend games about "
                "ghosts/monsters/spooky things that kids initiate for fun, "
                "Halloween-themed costumes and decorations, mild peril that "
                "resolves safely, playful 'boo!' moments, pretend-scary voices "
                "in kids' play, and bedtime stories with gentle suspense are "
                "NOT scary content. If this would appear in a kids' show that a "
                "4-year-old watches calmly, it is NOT scary."
            ),
        },
    },
    "sexual_content": {
        "type": "noul",
        "instructions": (
            "Does this content contain ACTUAL ROMANTIC or SEXUAL content "
            "(crushes, dating, boyfriend/girlfriend plots) — NOT innocent play, "
            "friendship, or family affection?"
        ),
        "criteria": {
            "true": (
                "Characters explicitly in a romantic/dating relationship, named "
                "crushes between characters, first kiss plotlines framed romantically, "
                "boyfriend/girlfriend labels used by characters, dating storylines, "
                "explicit flirting with romantic intent, romantic kissing between "
                "characters (not family), romantic jealousy, love-triangle themes, "
                "physical attraction references, nudity, innuendo, or sexual references."
            ),
            "false": (
                "NO ROMANTIC PLOTLINES. Family affection (parents hugging each "
                "other quickly, parent kissing child goodnight, siblings hugging), "
                "friendship, playing together, educational interaction, kids pretending "
                "to be a family (playing 'house', pretending to be babies or parents), "
                "'I love this toy / my mom / my dog / my friend', platonic hugs, "
                "any family interaction, and all physical play without romantic "
                "framing between characters are NOT romantic content. Normal happy "
                "family dynamics are NOT sexual content."
            ),
        },
    },
    "substance_use": {
        "type": "noul",
        "instructions": "Does this content depict alcohol, drug, or tobacco use?",
        "criteria": {
            "true": "Characters drinking alcohol, using drugs (illegal or prescription misuse), smoking, or vaping. References count even if not shown on screen.",
            "false": "No substance use referenced or depicted.",
        },
    },
    "difficult_themes": {
        "type": "noul",
        "instructions": "Does this content involve difficult emotional themes a parent would want to discuss with their child?",
        "criteria": {
            "true": "Death of a parent or loved one, divorce, abuse, neglect, serious illness, mental health struggles, bullying, grief, or similar heavy themes.",
            "false": "No heavy emotional themes present.",
        },
    },
    "hidden_ads": {
        "type": "noul",
        "instructions": (
            "Does this content contain UNDISCLOSED sponsored promotion of a specific "
            "commercial product or service (not just content ABOUT things)?"
        ),
        "criteria": {
            "true": (
                "Specific commercial brand name promoted with purchase prompts, 'available now' / "
                "'tell your parents to buy' calls to action, repeated prominent product display "
                "without a visible 'sponsored' / 'ad' disclosure, or multiple branded-product "
                "mentions clustered in a way that reads as a hidden commercial."
            ),
            "false": (
                "No undisclosed sponsorship. Content ABOUT generic things (fire trucks, "
                "dinosaurs, playgrounds, animals, nature, educational subjects) is NOT a hidden ad. "
                "Educational tours of real-world locations are NOT hidden ads. Incidental brand "
                "visibility (someone wearing a logo) is NOT a hidden ad. Standard 'please "
                "subscribe' / 'like this video' creator calls to action are NOT hidden ads."
            ),
        },
    },
    "ai_generated": {
        "type": "noul",
        "instructions": (
            "Was this video produced using AI generative tools (text-to-speech "
            "voice, generative video/image models) — NOT a human performer being "
            "animated or styled in a particular way?"
        ),
        "criteria": {
            "true": (
                "The video is OBVIOUSLY output from AI tools: robotic TTS "
                "narration with unnatural prosody, generative video with "
                "warped faces or morphing bodies, characters that change "
                "appearance between shots, impossible anatomy, prompt-template "
                "nonsense dialogue that only parses as AI output, or clearly "
                "auto-generated nursery-rhyme videos where the same template "
                "mechanically substitutes different numbers/colors/names in each clip."
            ),
            "false": (
                "ANY HUMAN-PRODUCED content is NOT AI-generated. This includes: "
                "live-action kids presenters (Blippi, Ms. Rachel, Mr. Rogers), "
                "studio-animated cartoons (Bluey, Peppa Pig, Spidey, Paw Patrol), "
                "human voice acting over 2D or 3D animation, kids-TV presenters "
                "using repetitive catchphrases on purpose, over-the-top energetic "
                "performance for kids audiences, songs with simple repeated lyrics, "
                "counting/alphabet/color-teaching segments, and any content where a "
                "real human performed on camera or voiced the audio. Repetition, "
                "simple vocabulary, bright colors, and animation style do NOT "
                "indicate AI generation. Only output from generative AI tools counts."
            ),
        },
    },
}

AGE_GATE_QUESTIONS = {
    "appropriate_under_6": {
        "type": "noul",
        "instructions": "Is this content appropriate for a child under 6 years old?",
        "criteria": {
            "true": (
                "Preschool-safe: gentle themes, no scary content, no violence "
                "beyond slapstick, simple language, no profanity, no mature topics, "
                "NO romantic plotlines or crushes or kissing beyond family affection."
            ),
            "false": (
                "Contains anything that would upset, confuse, or inappropriately "
                "expose a child under 6 — including crushes, dating, or romantic "
                "kissing which preschoolers do not have the concepts for."
            ),
        },
    },
    "appropriate_6_to_9": {
        "type": "noul",
        "instructions": "Is this content appropriate for a child 6 to 9 years old?",
        "criteria": {
            "true": (
                "Early-elementary safe: mild peril acceptable, no graphic violence, "
                "no scary horror, minimal or no profanity, themes an early-reader "
                "can handle. NO romantic plotlines, boyfriend/girlfriend content, "
                "first kiss storylines, or dating themes — these push the "
                "appropriate age to 10 or above."
            ),
            "false": (
                "Too intense, mature, or complex for a 6-9 year old. Includes "
                "any romantic content (crushes, dating, first kiss) which is "
                "typically introduced in middle-grade content for 10+."
            ),
        },
    },
    "appropriate_10_to_12": {
        "type": "noul",
        "instructions": "Is this content appropriate for a child 10 to 12 years old (middle grade)?",
        "criteria": {
            "true": (
                "Middle-grade safe: moderate peril and emotional complexity "
                "acceptable, mild profanity acceptable, scary scenes if not "
                "graphic, death as a theme if handled thoughtfully, age-appropriate "
                "crushes and first-kiss storylines acceptable."
            ),
            "false": (
                "Too mature, graphic, or explicitly sexual for a 10-12 year old. "
                "Graphic violence, strong profanity throughout, or explicit "
                "sexuality push the appropriate age higher."
            ),
        },
    },
    "appropriate_13_plus": {
        "type": "noul",
        "instructions": "Is this content appropriate for a teenager 13 or older?",
        "criteria": {
            "true": (
                "Teen-appropriate: can handle moderate violence, strong themes, "
                "some profanity, romantic content without explicit sexuality."
            ),
            "false": (
                "Content requires older than 13 due to explicit sexual content, "
                "graphic violence, substance glorification, or disturbing imagery."
            ),
        },
    },
}


def build_full_question_set() -> dict:
    """Combine content and age-gate questions for a single Snap call."""
    return {**CONTENT_QUESTIONS, **AGE_GATE_QUESTIONS}


def build_content_only_question_set() -> dict:
    """Content categories only; use when you want to call age-gate separately."""
    return dict(CONTENT_QUESTIONS)
