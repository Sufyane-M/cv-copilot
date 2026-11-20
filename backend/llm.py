def mock_reply(section: dict) -> str:
    text = ' '.join(section['text'].split())
    if not text:
        return 'Quali informazioni vuoi includere in questa sezione?'
    return 'Testo simulato: ' + text
