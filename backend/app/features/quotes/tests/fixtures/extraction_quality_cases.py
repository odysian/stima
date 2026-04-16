"""Ground truth fixtures for extraction quality eval runs."""

from __future__ import annotations

from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS
from app.features.quotes.tests.scoring.extraction_scorer import (
    ExpectedLineItem,
    ExtractionQualityCase,
)

_Q03_SINGLE_ITEM_JOB = "Power wash the driveway. 400 flat."
_Q04_QUANTITY_MATH = (
    "Deliver and spread 5 yards of brown mulch across the front beds. "
    "Mulch is 45 per yard, delivery is a flat 35."
)
_Q05_MIXED_SERVICES_AND_MATERIALS = (
    "Replace the cracked driveway section near the garage, about 800 for the concrete and labor, "
    "then reseal the whole driveway for 1300. Also need to fix the mailbox post, probably around "
    "75 for materials and install."
)
_Q06_MID_SENTENCE_CORRECTION = (
    "So we need to power wash the deck, that's 275, and then stain it which was going to be 350 "
    "but actually let's do 325 for the stain since we already have the sealer. And clean the "
    "gutters for 150, wait no, 175."
)
_Q07_ITEM_DESCRIBED_IN_PARTS = (
    "Trim the hedges along the back fence - they're about 40 feet of hedge, so that's 200, and "
    "also edge along the driveway for 85 dollars."
)
_Q08_VERBOSE_WITH_FILLER = (
    "Um, okay so like, we need five yards of brown mulch, uh, edge the front beds, and maybe add "
    "two hostas by the walkway. The mulch part was around 120 I think. The edging is probably 75 "
    "and the hostas should be like 40 for both."
)
_Q10_TAX_AND_DISCOUNT = (
    "Weekly lawn maintenance package: mow, edge, and blow for 45 per visit. Annual contract "
    "discount of 10 percent. Sales tax is 6.5 percent."
)
_Q11_VERY_SHORT = "Mow lawn 50"
_Q12_EXTENDED_MULTI_ITEM = (
    "Okay so we need a full exterior refresh on the Johnson property. First power wash the siding "
    "and driveway, that's gonna run about 350 total for both. Then we need to repaint the trim on "
    "the second floor, I'm figuring 475 for materials and labor. The back deck needs to be sanded "
    "and resealed, that's 280. We also need to fix two sections of fence that came down in the "
    "storm - about 120 per section so 240 there. And then clean out all the gutters including the "
    "second story ones, that's 195. Total on everything should come to 1540."
)
_Q13_DUPLICATE_DETECTION = (
    "Clean gutters for 150. Also clean the gutters on the back side, that's another 150. And check "
    "the downspouts for 75."
)
_Q14_IMPLICIT_SPLIT = (
    "The front yard needs new sod. We'll need about 500 square feet of Bermuda sod, delivered and "
    "installed. Installation is 2 per square foot and the sod itself is 1.50 per square foot, plus "
    "a 75 delivery charge."
)
_Q15_LANDSCAPE_JARGON = (
    "Do a full spring cleanup - dethatch, aerate, and overseed the lawn at 250, prune the "
    "ornamentals at 175, and apply pre-emergent for 95. Then come back in six weeks for a "
    "fertilizer app at 65."
)


QUALITY_CASES: tuple[ExtractionQualityCase, ...] = (
    ExtractionQualityCase(
        name="Q01_multi_item_exact_prices",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["clean_with_total"],
        expected_line_items=(
            ExpectedLineItem(description="Rear garage floodlights", price=360),
            ExpectedLineItem(description="Porch switch replacement", price=75),
        ),
        expected_total=435,
        category="services",
        difficulty="easy",
        human_notes="Baseline clear transcript with explicit per-item prices and total.",
    ),
    ExtractionQualityCase(
        name="Q02_multi_item_no_prices",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["clean_no_prices"],
        expected_line_items=(
            ExpectedLineItem(description="Trim shrubs", price=None),
            ExpectedLineItem(description="Edge front flower beds", price=None),
            ExpectedLineItem(description="Bag leaves from side yard", price=None),
        ),
        expected_total=None,
        expect_prices=False,
        expect_total=False,
        category="services",
        difficulty="easy",
        human_notes="No explicit pricing should keep extracted prices and total as null.",
    ),
    ExtractionQualityCase(
        name="Q03_single_item_job",
        extraction_mode="initial",
        transcript=_Q03_SINGLE_ITEM_JOB,
        expected_line_items=(ExpectedLineItem(description="Power wash driveway", price=400),),
        expected_total=400,
        category="services",
        difficulty="easy",
        human_notes="Single-item extraction should remain compact with exact pricing.",
    ),
    ExtractionQualityCase(
        name="Q04_quantities_in_description",
        extraction_mode="initial",
        transcript=_Q04_QUANTITY_MATH,
        expected_line_items=(
            ExpectedLineItem(description="Brown mulch", details="5 yards", price=225),
            ExpectedLineItem(description="Delivery", price=35),
        ),
        expected_total=260,
        category="materials",
        difficulty="easy",
        human_notes="Checks quantity math and preservation of quantity context.",
    ),
    ExtractionQualityCase(
        name="Q05_mixed_services_materials",
        extraction_mode="initial",
        transcript=_Q05_MIXED_SERVICES_AND_MATERIALS,
        expected_line_items=(
            ExpectedLineItem(description="Driveway section repair", price=800),
            ExpectedLineItem(description="Driveway reseal", price=1300),
            ExpectedLineItem(description="Mailbox post fix", price=75),
        ),
        expected_total=2175,
        category="mixed",
        difficulty="medium",
        human_notes="Service and material phrasing is mixed within sentences.",
    ),
    ExtractionQualityCase(
        name="Q06_mid_sentence_correction",
        extraction_mode="initial",
        transcript=_Q06_MID_SENTENCE_CORRECTION,
        expected_line_items=(
            ExpectedLineItem(description="Power wash deck", price=275),
            ExpectedLineItem(description="Stain deck", price=325),
            ExpectedLineItem(description="Clean gutters", price=175),
        ),
        expected_total=775,
        category="correction",
        difficulty="medium",
        human_notes="Uses corrected prices and ignores superseded earlier values.",
    ),
    ExtractionQualityCase(
        name="Q07_item_described_in_two_parts",
        extraction_mode="initial",
        transcript=_Q07_ITEM_DESCRIBED_IN_PARTS,
        expected_line_items=(
            ExpectedLineItem(
                description="Trim hedges along back fence", details="40 feet", price=200
            ),
            ExpectedLineItem(description="Edge driveway", price=85),
        ),
        expected_total=285,
        category="services",
        difficulty="medium",
        human_notes="Length detail should land as details rather than a separate line item.",
    ),
    ExtractionQualityCase(
        name="Q08_verbose_with_filler_words",
        extraction_mode="initial",
        transcript=_Q08_VERBOSE_WITH_FILLER,
        expected_line_items=(
            ExpectedLineItem(description="Brown mulch", price=120),
            ExpectedLineItem(description="Edge front beds", price=75),
            ExpectedLineItem(description="Add two hostas", price=40),
        ),
        expected_total=235,
        category="services",
        difficulty="medium",
        human_notes="Filler words and hedging should not degrade extraction structure.",
    ),
    ExtractionQualityCase(
        name="Q09_total_only_transcript",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["total_only"],
        expected_line_items=(
            ExpectedLineItem(
                description="Driveway repair and reseal",
                price=None,
                price_tolerance_pct=0.15,
            ),
        ),
        expected_total=2100,
        expected_line_item_count_min=1,
        expected_line_item_count_max=3,
        expect_prices=False,
        category="services",
        difficulty="medium",
        human_notes="Total is explicit, but per-item pricing should remain unspecified.",
    ),
    ExtractionQualityCase(
        name="Q10_tax_and_discount_language",
        extraction_mode="initial",
        transcript=_Q10_TAX_AND_DISCOUNT,
        expected_line_items=(
            ExpectedLineItem(
                description="Weekly lawn maintenance package",
                price=45,
                price_tolerance_pct=0.15,
            ),
        ),
        expected_total=None,
        expect_total=False,
        expected_pricing_fields=("tax_rate", "discount_type", "discount_value"),
        category="tax_discount",
        difficulty="medium",
        human_notes="Discount and tax should appear as confidence notes, not line-item math.",
    ),
    ExtractionQualityCase(
        name="Q11_very_short_transcript",
        extraction_mode="initial",
        transcript=_Q11_VERY_SHORT,
        expected_line_items=(ExpectedLineItem(description="Mow lawn", price=50),),
        expected_total=50,
        category="services",
        difficulty="hard",
        human_notes="Minimal transcript still needs one correct item and total.",
    ),
    ExtractionQualityCase(
        name="Q12_extended_multi_item_transcript",
        extraction_mode="initial",
        transcript=_Q12_EXTENDED_MULTI_ITEM,
        expected_line_items=(
            ExpectedLineItem(
                description="Power wash siding and driveway", price=350, price_tolerance_pct=0.10
            ),
            ExpectedLineItem(
                description="Repaint second floor trim", price=475, price_tolerance_pct=0.10
            ),
            ExpectedLineItem(
                description="Sand and reseal back deck", price=280, price_tolerance_pct=0.10
            ),
            ExpectedLineItem(
                description="Fix fence sections",
                details="two sections",
                price=240,
                price_tolerance_pct=0.10,
            ),
            ExpectedLineItem(
                description="Clean gutters including second story",
                price=195,
                price_tolerance_pct=0.10,
            ),
        ),
        expected_total=1540,
        category="long_transcript",
        difficulty="hard",
        cost_tier="high",
        human_notes="Longest expensive run; skipped in cheap iteration with SKIP_HIGH_COST.",
    ),
    ExtractionQualityCase(
        name="Q13_duplicate_detection",
        extraction_mode="initial",
        transcript=_Q13_DUPLICATE_DETECTION,
        expected_line_items=(
            ExpectedLineItem(
                description="Clean gutters",
                price=150,
                expected_flagged=True,
                expected_flag_reason_substring="duplicate",
            ),
            ExpectedLineItem(
                description="Clean gutters back side",
                price=150,
                expected_flagged=True,
                expected_flag_reason_substring="duplicate",
            ),
            ExpectedLineItem(description="Check downspouts", price=75),
        ),
        expected_total=375,
        category="services",
        difficulty="hard",
        human_notes="Duplicate-like entries should still extract with duplicate flags.",
    ),
    ExtractionQualityCase(
        name="Q14_item_split_across_sentences",
        extraction_mode="initial",
        transcript=_Q14_IMPLICIT_SPLIT,
        expected_line_items=(
            ExpectedLineItem(description="Sod installation", price=1000, price_tolerance_pct=0.15),
            ExpectedLineItem(
                description="Bermuda sod material", price=750, price_tolerance_pct=0.15
            ),
            ExpectedLineItem(description="Delivery", price=75, price_tolerance_pct=0.15),
        ),
        expected_total=1825,
        category="materials",
        difficulty="hard",
        human_notes="Canonical split keeps labor/material separate while allowing tolerance.",
    ),
    ExtractionQualityCase(
        name="Q15_landscape_jargon_future_followup",
        extraction_mode="initial",
        transcript=_Q15_LANDSCAPE_JARGON,
        expected_line_items=(
            ExpectedLineItem(description="Dethatch aerate overseed lawn", price=250),
            ExpectedLineItem(description="Prune ornamentals", price=175),
            ExpectedLineItem(description="Apply pre-emergent", price=95),
            ExpectedLineItem(
                description="Fertilizer application in six weeks",
                price=65,
                must_match=False,
            ),
        ),
        expected_total=585,
        category="landscape",
        difficulty="hard",
        human_notes="Future follow-up line item is optional bonus due possible exclusion behavior.",
    ),
)
