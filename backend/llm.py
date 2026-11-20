from .validation import MAX_SECTION_TEXT


def mock_review(section: dict) -> dict:
    original = section["text"]
    revised = "\n".join(line.strip() for line in original.strip().splitlines())
    if revised:
        if revised[-1] not in ".!?;:" and len(revised) < MAX_SECTION_TEXT:
            revised += "."
        if revised == original and not revised.startswith(("• ", "- ")):
            if len(revised) <= MAX_SECTION_TEXT - 2:
                revised = "• " + revised
        if revised != original:
            return {
                "text": "Proposta simulata pronta per la revisione.",
                "proposal": {
                    "section_id": section["id"],
                    "new_text": revised,
                    "reason": "Ho sistemato spazi, punteggiatura o presentazione lasciando invariati i fatti.",
                },
            }
    return {
        "text": "Puoi indicare quali informazioni della sezione vuoi mettere in evidenza?",
        "proposal": None,
    }


def generate_review(config: dict, context: dict) -> dict:
    return mock_review(context['section'])
