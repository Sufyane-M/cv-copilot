import json
from pathlib import Path
import re


REGISTRY_PATH = Path(__file__).resolve().parents[1] / 'frontend/src/document/templates.json'
REGISTRY = json.loads(REGISTRY_PATH.read_text(encoding='utf-8'))
TEMPLATES = {template['id']: template for template in REGISTRY['templates']}
HEX_COLOR = re.compile(r'#[0-9a-fA-F]{6}')

TYPOGRAPHY_CHOICES = {'font': {'sans', 'serif', 'mono'}, 'weight': {400, 700}}
TYPOGRAPHY_RANGES = {
    'titleSize': (18, 44), 'headingSize': (9, 20), 'textSize': (8, 16),
    'lineHeight': (1.1, 1.8), 'letterSpacing': (-0.5, 1.5),
}
PAGE_CHOICES = {
    'columns': {1, 2}, 'asideSide': {'left', 'right'}, 'align': {'left', 'center', 'right'},
    'header': {'left', 'center', 'band', 'offset'}, 'separators': {'none', 'line', 'accent'},
}
PAGE_RANGES = {'margin': (9, 24), 'sectionGap': (2, 12), 'asideWidth': (25, 44)}
BLOCK_CHOICES = {'border': {'inherit', 'none', 'line', 'accent'}, 'column': {'auto', 'main', 'aside'}}
BLOCK_RANGES = {'width': (50, 100), 'minHeight': (0, 140), 'padding': (0, 10)}


def require_known_fields(value: object, keys, label: str) -> None:
    if not isinstance(value, dict) or value.keys() - keys:
        raise ValueError(f'{label} contiene campi non riconosciuti.')


def validate_choices(settings: dict, choices: dict, label: str) -> None:
    for key, options in choices.items():
        value = settings[key]
        if type(value) not in (str, int) or value not in options:
            raise ValueError(f'{label}, valore non ammesso per {key}.')


def validate_ranges(settings: dict, ranges: dict, label: str) -> None:
    for key, (lowest, highest) in ranges.items():
        value = settings[key]
        if type(value) not in (int, float) or not lowest <= value <= highest:
            raise ValueError(f'{label}, {key} deve essere compreso tra {lowest} e {highest}.')


def validate_colors(settings: dict, keys, allow_empty: bool = False) -> None:
    for key in keys:
        color = settings[key]
        if not isinstance(color, str) or not ((allow_empty and color == '') or HEX_COLOR.fullmatch(color)):
            raise ValueError(f'Il colore {key} deve essere esadecimale nel formato #RRGGBB.')
        settings[key] = color.lower()


def normalize_blocks(blocks: object, section_ids: set[str]) -> dict:
    require_known_fields(blocks, section_ids, 'La configurazione dei riquadri')
    normalized = {}
    defaults = REGISTRY['defaultBlock']
    for section_id, overrides in blocks.items():
        require_known_fields(overrides, defaults.keys(), 'Il riquadro')
        block = {**defaults, **overrides}
        validate_choices(block, BLOCK_CHOICES, 'Riquadro')
        validate_ranges(block, BLOCK_RANGES, 'Riquadro')
        validate_colors(block, ('background', 'color'), allow_empty=True)
        if type(block['textSize']) not in (int, float) or block['textSize'] != 0:
            validate_ranges(block, {'textSize': (8, 18)}, 'Riquadro')
        normalized[section_id] = block
    return normalized


def normalize_design(value: object, section_ids: set[str]) -> dict:
    require_known_fields(value, {'templateId', 'colors', 'typography', 'page', 'blocks'}, 'Il design')
    template_id = value.get('templateId')
    if not isinstance(template_id, str) or template_id not in TEMPLATES:
        raise ValueError('Seleziona un template disponibile.')
    template = TEMPLATES[template_id]
    normalized = {'templateId': template_id}

    # Lo snapshot salva i valori effettivi, così non dipende dai futuri valori iniziali del preset.
    for group, defaults in template['design'].items():
        supplied = value.get(group, {})
        require_known_fields(supplied, defaults.keys(), f'Le impostazioni {group}')
        normalized[group] = {**defaults, **supplied}

    validate_colors(normalized['colors'], normalized['colors'].keys())
    validate_choices(normalized['typography'], TYPOGRAPHY_CHOICES, 'Tipografia')
    validate_ranges(normalized['typography'], TYPOGRAPHY_RANGES, 'Tipografia')
    validate_choices(normalized['page'], PAGE_CHOICES, 'Pagina')
    validate_ranges(normalized['page'], PAGE_RANGES, 'Pagina')
    if normalized['page']['columns'] == 2 and not REGISTRY['families'][template['family']]['supportsColumns']:
        raise ValueError('Il template scelto usa una sola colonna.')

    normalized['blocks'] = normalize_blocks(value.get('blocks', {}), section_ids)
    return normalized
