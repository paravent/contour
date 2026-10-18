"""The answer pool: well-known English Wikipedia articles whose readership spikes."""

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Article:
    id: str
    title: str  # exact English Wikipedia title, as the pageviews API knows it
    name: str  # what players see and type
    category: str
    aliases: list = field(default_factory=list)


def load_pool(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        return [
            Article(r["id"], r["title"], r["name"], r["category"], [a for a in r["aliases"].split("|") if a])
            for r in csv.DictReader(f)
        ]


def pool_json(articles):
    """The list the game's type-ahead searches; it carries no titles or answers' data."""
    return [{"id": a.id, "name": a.name, "category": a.category, "aliases": a.aliases} for a in articles]


def bare_name(name: str) -> str:
    """The name without a trailing "(film)"-style qualifier, which the shape clue leaves out."""
    return re.sub(r"\s*\([^)]*\)$", "", name)
