"""Transcript fixtures for extraction behavior coverage."""

from __future__ import annotations

TRANSCRIPTS: dict[str, str] = {
    "clean_with_total": (
        "Install two motion floodlights at rear garage, replace one porch switch, "
        "and test both circuits. Floodlights are 180 each and switch replacement is 75. "
        "Total should be 435."
    ),
    "clean_no_prices": (
        "Spring cleanup: trim shrubs, edge front flower beds, and bag leaves from the side yard."
    ),
    "total_only": (
        "Replace cracked driveway section and reseal the whole driveway. Total job is 2100."
    ),
    "partial_ambiguous": (
        "Power wash deck and back siding. Deck wash is 225, "
        "siding should be whatever normal rate is, plus maybe gutter touch-up if needed."
    ),
    "noisy_with_hesitation": (
        "Um, okay, so like, we need five yards of brown mulch, uh edge the front beds, and maybe "
        "add two hostas by the walkway, I think the mulch part was around 120."
    ),
    "no_pricing_at_all": (
        "Inspect attic insulation, check crawlspace moisture barrier, and send me recommendations."
    ),
}
